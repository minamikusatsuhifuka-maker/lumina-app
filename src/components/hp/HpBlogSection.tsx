'use client';

// 185: HP掲載用ブログ記事生成＋記事連動の画像生成。/dashboard/hp-generator に載せるセクション。
// - ①記事生成（hp-writing.ts流用・医療広告チェック必須＝生成完了後に自動実行・人間承認型で適用）
// - ②記事が完成した後にのみ「🎨 画像を生成」→ 166 EyecatchModal(sourceKind:'hp-blog') を開く
//   （画像生成コア・プロンプト起案は書き直さない＝繋ぐだけ。順序: 先に記事、後に画像）
// - 保存は既存の library（SaveToLibraryButton type='hp-blog'）＝新テーブルなし

import { useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import AdGuardFindings, { type AdGuardEdit } from '@/components/hp/AdGuardFindings';
import { EyecatchModal } from '@/components/eyecatch/EyecatchModal';
import ContextSelector, { buildContextText, type ContextItem } from '@/components/ContextSelector';
import { getSavedModel, getModelIcon, getModelLabel } from '@/lib/model-preference';

const TONES = ['親しみやすく丁寧', 'フォーマル・落ち着いた', 'やさしく噛みくだいた'];
type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '📄 短め（1000〜1800字）' },
  { value: 'medium', label: '📑 標準（2000〜3000字）' },
  { value: 'long', label: '📚 長め（3500〜5000字）' },
];

export default function HpBlogSection() {
  const [theme, setTheme] = useState('');
  const [target, setTarget] = useState('');
  const [tone, setTone] = useState(TONES[0]);
  const [length, setLength] = useState<Length>('medium');
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [article, setArticle] = useState('');
  const [usedModel, setUsedModel] = useState<'claude' | 'gemini'>('claude');
  const [copiedMd, setCopiedMd] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // 🎨 記事連動の画像生成（記事完成後にのみ有効）
  const [showEyecatch, setShowEyecatch] = useState(false);

  // 医療広告ガード（184と同じ人間承認型: 検出→修正案→院長が適用→再チェック）
  const [adEdits, setAdEdits] = useState<AdGuardEdit[]>([]);
  const [adStatus, setAdStatus] = useState<'ok' | 'warn' | null>(null);
  const [adChecking, setAdChecking] = useState(false);

  const runAdCheck = async (text: string) => {
    if (!text.trim()) return;
    setAdChecking(true);
    try {
      const res = await fetch('/api/hp-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'チェックに失敗しました');
      setAdStatus(data.status === 'warn' ? 'warn' : 'ok');
      setAdEdits(
        (data.findings as { before: string; after: string; reason: string }[]).map((f) => ({
          ...f,
          status: 'pending' as const,
        })),
      );
    } catch (e) {
      setAdStatus(null);
      setAdEdits([]);
      setErrorMsg(`医療広告チェックに失敗しました: ${e instanceof Error ? e.message : e}`);
    } finally {
      setAdChecking(false);
    }
  };

  const setAdEditStatus = (i: number, status: AdGuardEdit['status']) => {
    if (adChecking) return;
    const e = adEdits[i];
    if (!e) return;
    if (status === 'applied' && e.status === 'pending') {
      const newText = article.split(e.before).join(e.after);
      setArticle(newText);
      setAdEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status: 'applied' } : x)));
      runAdCheck(newText); // 適用直後に再チェック（直したつもり防止）
    } else {
      setAdEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status } : x)));
    }
  };

  const applyAllAdEdits = () => {
    if (adChecking) return;
    let newText = article;
    for (const e of adEdits) {
      if (e.status === 'pending') newText = newText.split(e.before).join(e.after);
    }
    setArticle(newText);
    setAdEdits((prev) => prev.map((x) => (x.status === 'pending' ? { ...x, status: 'applied' } : x)));
    runAdCheck(newText);
  };

  const generate = async () => {
    if (!theme.trim()) {
      setErrorMsg('テーマを入力してください');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    setArticle('');
    setAdEdits([]);
    setAdStatus(null);
    const model = getSavedModel();
    setUsedModel(model);
    try {
      const res = await fetch('/api/hp-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: theme.trim(),
          target,
          tone,
          length,
          model,
          contextInfo: buildContextText(contexts),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `生成に失敗しました（HTTP ${res.status}）`);
      const content: string = data.content ?? '';
      setArticle(content);
      // 医療広告チェックを必ず実行（HP掲載＝患者が読む公開情報・スキップ不可）
      runAdCheck(content);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const downloadMd = () => {
    if (!article.trim()) return;
    const md = `# HPブログ記事下書き: ${theme.slice(0, 40)}\n\n> 生成AI: ${getModelIcon(usedModel)} ${getModelLabel(usedModel)}\n\n---\n\n${article}`;
    triggerDownload(`${sanitizeFilename(`HPブログ_${theme.slice(0, 40)}`)}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
  };

  const downloadDocx = async () => {
    if (!article.trim()) return;
    const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
    await downloadMarkdownAsDocx({
      title: `HPブログ記事下書き: ${theme.slice(0, 40)}`,
      metaLines: [`生成AI: ${getModelLabel(usedModel)}`],
      markdown: sanitizeLatex(article),
      fileName: `${sanitizeFilename(`HPブログ_${theme.slice(0, 40)}`)}_${yyyymmdd()}.docx`,
    });
  };

  const btn = (bg: string, disabled: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: disabled ? 'var(--bg-primary)' : bg,
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginTop: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        📝 HPブログ記事を作る
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14, lineHeight: 1.7 }}>
        HP掲載用のブログ記事を生成します。生成後に医療広告チェックが必ず実行され、記事が完成したら内容に沿った画像も生成できます（先に記事・後に画像）。
      </p>

      {/* 入力フォーム（既存HP生成の作法に揃える） */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>テーマ *</div>
        <textarea
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder={'例：冬の乾燥肌対策と正しい保湿ケア\n例：日焼け止めの選び方と塗り方の基本'}
          style={{ width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>読者（ターゲット）</div>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="例：乾燥肌に悩む30〜40代"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>トーン</div>
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>長さ</div>
          <select value={length} onChange={(e) => setLength(e.target.value as Length)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {LENGTH_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {/* 🧠AI参照素材の連携（既存導線を流用） */}
      <ContextSelector featureKey="all" onSelect={setContexts} />

      {errorMsg && (
        <div style={{ margin: '10px 0', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <button
        onClick={generate}
        disabled={loading}
        style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none', marginTop: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? 'rgba(108,99,255,0.4)' : 'linear-gradient(135deg, #059669, #10b981)',
          color: '#fff', fontWeight: 700, fontSize: 15,
        }}
      >
        {loading ? '🤖 ブログ記事を生成中...（30〜120秒）' : '📝 ブログ記事を生成'}
      </button>

      {/* 生成結果 */}
      {article && !loading && (
        <div style={{ marginTop: 18 }}>
          {/* 「下書き」注意文（必須表示） */}
          <div style={{ marginBottom: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
            ⚠️ これは下書きです。公開前に必ず内容をご確認ください
          </div>

          {/* 医療広告ガード（必須・人間承認型・適用後は自動再チェック） */}
          <AdGuardFindings
            status={adStatus}
            edits={adEdits}
            checking={adChecking}
            onSetStatus={setAdEditStatus}
            onApplyAll={applyAllAdEdits}
            onRecheck={() => runAdCheck(article)}
          />

          {/* 本文プレビュー（renderMarkdown） */}
          <div
            className="markdown-body"
            style={{
              maxHeight: expanded ? undefined : 340,
              overflowY: expanded ? undefined : 'auto',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 14,
              color: 'var(--text-primary)',
              lineHeight: 1.8,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              margin: '10px 0',
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(article) }}
          />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => setExpanded((v) => !v)} style={btn('var(--bg-secondary)', false)}>
              {expanded ? '▲ 閉じる' : '▼ 全文表示'}
            </button>
            <button
              type="button"
              onClick={() => { copyToClipboard(sanitizeLatex(article)); setCopiedMd(true); setTimeout(() => setCopiedMd(false), 2000); }}
              style={btn('var(--bg-secondary)', false)}
            >
              {copiedMd ? '✅ コピー済み' : '📋 コピー'}
            </button>
            <button type="button" onClick={downloadMd} style={btn('var(--bg-secondary)', false)}>📥 MD</button>
            <button type="button" onClick={downloadDocx} style={btn('var(--bg-secondary)', false)}>📄 Word</button>
            <SaveToLibraryButton
              title={`HPブログ記事: ${theme.slice(0, 60)}`}
              content={article}
              type="hp-blog"
              groupName="HPブログ"
              tags="HPブログ,下書き"
              metadata={{ theme, target, tone, length, adStatus }}
            />
            {/* 🎨 記事連動の画像生成（記事が完成した後にのみ有効＝順序を守る） */}
            <button
              type="button"
              onClick={() => setShowEyecatch(true)}
              disabled={!article.trim()}
              title="記事の内容に沿った画像を生成します（記事が完成してから）"
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: !article.trim() ? 'var(--bg-primary)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: !article.trim() ? 'var(--text-muted)' : '#fff',
                fontSize: 12, fontWeight: 700,
                cursor: !article.trim() ? 'not-allowed' : 'pointer',
                marginLeft: 'auto',
              }}
            >
              🎨 画像を生成
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>文字数: {article.length.toLocaleString()}</span>
            <span>使用モデル: {getModelIcon(usedModel)} {getModelLabel(usedModel)}</span>
            {contexts.length > 0 && <span>参考: 🧠AI参照素材 {contexts.length}件</span>}
          </div>
        </div>
      )}

      {/* 記事連動の画像生成（166 EyecatchModal 流用・171マルチモデル・185複数枚/比率選択） */}
      <EyecatchModal
        open={showEyecatch}
        onClose={() => setShowEyecatch(false)}
        sourceTitle={theme}
        sourceText={article}
        sourceKind="hp-blog"
      />
    </div>
  );
}
