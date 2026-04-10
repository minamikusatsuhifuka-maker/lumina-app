'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const DOC_TYPES = [
  { id: 'proposal', label: '📋 提案書', desc: '企業向け提案・見積', color: '#6c63ff' },
  { id: 'report', label: '📊 報告書', desc: '成果・進捗報告', color: '#00d4b8' },
  { id: 'plan', label: '💡 企画書', desc: '新規企画・プロジェクト', color: '#f5a623' },
  { id: 'presentation', label: '🎯 プレゼン', desc: 'スライド構成', color: '#4ade80' },
  { id: 'sales', label: '💼 営業資料', desc: '営業・商談用', color: '#8b5cf6' },
  { id: 'manual', label: '📖 マニュアル', desc: '手順書・ガイド', color: '#ff6b6b' },
];

const SLIDE_OPTIONS = ['5', '8', '10', '12', '15', '20'];

interface DocForm {
  theme: string;
  audience: string;
  slides: string;
  purpose: string;
}

interface SlidePrompt {
  slide_num: number;
  title: string;
  prompt: string;
  design_tips: string;
}

interface DocResult {
  overview_prompt: string;
  slide_prompts: SlidePrompt[];
  design_prompt: string;
  data_visualization_prompt: string;
  review_prompt: string;
  tips: string[];
}

export default function DocPromptPage() {
  const [docType, setDocType] = useState('proposal');
  const [form, setForm] = useState<DocForm>({ theme: '', audience: '', slides: '10', purpose: '' });
  const [result, setResult] = useState<DocResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const updateForm = (key: keyof DocForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const generate = async () => {
    if (!form.theme.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/doc-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, docType }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  const copySection = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  /** 全体をTXTエクスポート */
  const exportTxt = () => {
    if (!result) return;
    const selectedDoc = DOC_TYPES.find(d => d.id === docType);
    const lines: string[] = [];
    lines.push(`【${selectedDoc?.label} プロンプト集 — ${form.theme}】`);
    lines.push(`対象: ${form.audience || '未指定'}`);
    lines.push(`スライド数: ${form.slides}`);
    lines.push('');

    lines.push('━━━ 全体概要プロンプト ━━━');
    lines.push(result.overview_prompt);
    lines.push('');

    lines.push('━━━ スライド別プロンプト ━━━');
    result.slide_prompts.forEach(s => {
      lines.push(`--- スライド ${s.slide_num}: ${s.title} ---`);
      lines.push(s.prompt);
      lines.push(`[デザインTips] ${s.design_tips}`);
      lines.push('');
    });

    lines.push('━━━ デザインプロンプト ━━━');
    lines.push(result.design_prompt);
    lines.push('');

    lines.push('━━━ データ可視化プロンプト ━━━');
    lines.push(result.data_visualization_prompt);
    lines.push('');

    lines.push('━━━ レビュープロンプト ━━━');
    lines.push(result.review_prompt);
    lines.push('');

    if (result.tips.length > 0) {
      lines.push('━━━ Tips ━━━');
      result.tips.forEach(t => lines.push(`・${t}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doc_prompt_${form.theme || 'output'}_${Date.now()}.txt`;
    a.click();
  };

  const selectedDoc = DOC_TYPES.find(d => d.id === docType);

  const copyBtnStyle = (key: string) => ({
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer' as const,
    fontSize: 11,
    fontWeight: 600 as const,
    background: copiedSection === key ? 'rgba(74,222,128,0.15)' : 'var(--bg-primary)',
    border: copiedSection === key ? '1px solid #4ade80' : '1px solid var(--border)',
    color: copiedSection === key ? '#4ade80' : 'var(--text-secondary)',
    transition: 'all 0.2s',
  });

  const selectStyle = {
    width: '100%' as const,
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23999\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat' as const,
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="📋 資料プロンプト生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📋 資料作成プロンプト生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        資料の種類に合わせて、AIに指示するための最適なプロンプトを生成します
      </p>

      {/* 資料タイプ選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {DOC_TYPES.map(d => (
          <button key={d.id} onClick={() => setDocType(d.id)} style={{
            padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
            textAlign: 'center' as const, transition: 'all 0.15s',
            border: docType === d.id ? `2px solid ${d.color}` : '1px solid var(--border)',
            background: docType === d.id ? `${d.color}15` : 'var(--bg-secondary)',
            color: docType === d.id ? d.color : 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{d.desc}</div>
          </button>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${selectedDoc?.color}30`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selectedDoc?.color, marginBottom: 16 }}>
          {selectedDoc?.label} のプロンプトを生成
        </div>

        {/* テーマ */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>テーマ・タイトル *</label>
          <input
            value={form.theme}
            onChange={e => updateForm('theme', e.target.value)}
            placeholder="例：2026年度 DX推進戦略、新サービス「AIアシスタント」導入提案"
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {/* 対象 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>対象・聴衆</label>
            <input
              value={form.audience}
              onChange={e => updateForm('audience', e.target.value)}
              placeholder="例：経営層、新入社員、クライアント"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          {/* スライド数 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>スライド数</label>
            <select
              value={form.slides}
              onChange={e => updateForm('slides', e.target.value)}
              style={selectStyle}
            >
              {SLIDE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}枚</option>
              ))}
            </select>
          </div>
        </div>

        {/* 目的 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>目的・伝えたいこと</label>
          <textarea
            value={form.purpose}
            onChange={e => updateForm('purpose', e.target.value)}
            placeholder="例：DX推進の必要性を理解してもらい、来期予算の承認を得たい。具体的なロードマップと期待効果を示す。"
            style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            * は必須項目です
          </div>
          <button onClick={generate} disabled={loading || !form.theme.trim()} style={{
            padding: '12px 36px',
            background: `linear-gradient(135deg, ${selectedDoc?.color}, ${selectedDoc?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !form.theme.trim()) ? 0.5 : 1,
          }}>
            {loading ? '⏳ 生成中...' : '📋 プロンプト生成'}
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${selectedDoc?.color}40`, borderTopColor: selectedDoc?.color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          資料プロンプトを生成しています...
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <SaveToLibraryButton
              title={`${selectedDoc?.label}: ${form.theme}`}
              content={JSON.stringify(result, null, 2)}
              type="doc-prompt"
              groupName="資料プロンプト"
              tags={`${selectedDoc?.label},資料作成`}
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              📝 全体をTXTエクスポート
            </button>
          </div>

          {/* 全体概要プロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: `2px solid ${selectedDoc?.color}40`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: selectedDoc?.color }}>
                📌 全体概要プロンプト
              </div>
              <button onClick={() => copySection('overview', result.overview_prompt)} style={copyBtnStyle('overview')}>
                {copiedSection === 'overview' ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
              {result.overview_prompt}
            </div>
          </div>

          {/* スライド別プロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
              🎯 スライド別プロンプト（{result.slide_prompts.length}枚）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.slide_prompts.map((s) => (
                <div key={s.slide_num} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: `${selectedDoc?.color}20`, color: selectedDoc?.color, fontSize: 13, fontWeight: 700 }}>
                        {s.slide_num}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {s.title}
                      </span>
                    </div>
                    <button onClick={() => copySection(`slide-${s.slide_num}`, s.prompt)} style={copyBtnStyle(`slide-${s.slide_num}`)}>
                      {copiedSection === `slide-${s.slide_num}` ? '✅' : '📋'}
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const, marginBottom: 10 }}>
                    {s.prompt}
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 6, fontSize: 12, color: '#f5a623', lineHeight: 1.5 }}>
                    🎨 {s.design_tips}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* デザインプロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#8b5cf6' }}>
                🎨 デザインプロンプト
              </div>
              <button onClick={() => copySection('design', result.design_prompt)} style={copyBtnStyle('design')}>
                {copiedSection === 'design' ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
              {result.design_prompt}
            </div>
          </div>

          {/* データ可視化プロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#00d4b8' }}>
                📊 データ可視化プロンプト
              </div>
              <button onClick={() => copySection('dataviz', result.data_visualization_prompt)} style={copyBtnStyle('dataviz')}>
                {copiedSection === 'dataviz' ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
              {result.data_visualization_prompt}
            </div>
          </div>

          {/* レビュープロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ff6b6b' }}>
                🔍 レビュープロンプト
              </div>
              <button onClick={() => copySection('review', result.review_prompt)} style={copyBtnStyle('review')}>
                {copiedSection === 'review' ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
              {result.review_prompt}
            </div>
          </div>

          {/* Tips */}
          {result.tips && result.tips.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f5a623', marginBottom: 10 }}>
                💡 作成のコツ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.tips.map((tip, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
