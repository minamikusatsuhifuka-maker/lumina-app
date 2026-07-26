'use client';

import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import ContextSelector, {
  buildContextText,
  type ContextItem,
} from '@/components/ContextSelector';
import DefaultContextBar, {
  buildDefaultContextText,
  type DefaultContextItem,
} from '@/components/DefaultContextBar';
import DeepDiveChat from '@/components/DeepDiveChat';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import AdGuardFindings, { type AdGuardEdit } from '@/components/hp/AdGuardFindings';
import HpBlogSection from '@/components/hp/HpBlogSection';
import { TextRefinePanel } from '@/components/refine/TextRefinePanel';

const INDUSTRIES = ['IT・SaaS', '医療・ヘルスケア', '飲食・フード', '不動産', '教育', 'コンサルティング', '製造業', '小売・EC', 'その他'];
const TONES = ['親しみやすくプロフェッショナル', 'フォーマル・高級感', 'カジュアル・フレンドリー', 'シンプル・ミニマル'];

// ── 184: 医療広告ガード用ヘルパー ──
// 生成結果（構造化JSON）の全文字列を連結して1テキスト化（チェックAPIへ渡す）
function collectStrings(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(collectStrings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(collectStrings);
  return [];
}
function flattenHpResult(r: unknown): string {
  return collectStrings(r).join('\n');
}
// 修正案の適用：結果オブジェクト内のすべての文字列フィールドに対して確定的に置換
function deepReplaceStrings<T>(v: T, before: string, after: string): T {
  if (typeof v === 'string') return v.split(before).join(after) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => deepReplaceStrings(x, before, after)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      out[k] = deepReplaceStrings((v as Record<string, unknown>)[k], before, after);
    }
    return out as unknown as T;
  }
  return v;
}
// 指摘がどのセクションに属するかをベストエフォート判定（before文字列の包含で特定）
const HP_SECTION_DEFS: { label: string; pick: (r: any) => unknown }[] = [
  { label: '🎯 ヒーロー', pick: (r) => r?.hero },
  { label: '🛠️ サービス', pick: (r) => r?.services },
  { label: '✨ 特徴', pick: (r) => r?.features },
  { label: '🏢 会社概要', pick: (r) => r?.about },
  { label: '❓ FAQ', pick: (r) => r?.faq },
  { label: '📣 CTA', pick: (r) => r?.cta_section },
  { label: '🔍 メタ', pick: (r) => r?.meta_description },
];
function sectionLabelFor(result: any, before: string): string | undefined {
  for (const s of HP_SECTION_DEFS) {
    const t = flattenHpResult(s.pick(result));
    if (t && t.includes(before)) return s.label;
  }
  return undefined;
}

interface HpForm {
  companyName: string;
  industry: string;
  target: string;
  usp: string;
  tone: string;
}

// 自動下書き（feature_result_drafts feature_key='hp-generator'）のpayload
// AI対話（DeepDive）の下書きは画面に表示されるため一緒に復元する
interface HpGeneratorDraftPayload {
  form?: HpForm;
  result?: unknown;
  deepDiveContent?: string;
}

export default function HpGeneratorPage() {
  const [form, setForm] = useState({ companyName: '', industry: 'IT・SaaS', target: '', usp: '', tone: '親しみやすくプロフェッショナル' });
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hpContexts, setHpContexts] = useState<ContextItem[]>([]);
  const [defaultContexts, setDefaultContexts] = useState<DefaultContextItem[]>([]);
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [deepDiveContent, setDeepDiveContent] = useState('');
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // ── 184①②: 生成結果の医療広告ガード（必須チェック・人間承認型） ──
  const [adEdits, setAdEdits] = useState<AdGuardEdit[]>([]);
  const [adStatus, setAdStatus] = useState<'ok' | 'warn' | null>(null);
  const [adChecking, setAdChecking] = useState(false);

  // ── 184④: 既存HP文章の加筆修正モード（貼り付けのみ・URL自動取得は作らない） ──
  const [pasteText, setPasteText] = useState('');
  // ↩︎元に戻す用スナップショット（最初の変更前のテキストを固定）
  const [pasteOriginal, setPasteOriginal] = useState('');
  const [pasteEdits, setPasteEdits] = useState<AdGuardEdit[]>([]);
  const [pasteStatus, setPasteStatus] = useState<'ok' | 'warn' | null>(null);
  const [pasteChecking, setPasteChecking] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [pasteCopied, setPasteCopied] = useState(false);

  // 医療広告チェックの共通実行（/api/hp-guard・差分ペアで返る）
  const runAdCheck = async (
    text: string,
    setChecking: (v: boolean) => void,
    setStatus: (v: 'ok' | 'warn' | null) => void,
    setEdits: (v: AdGuardEdit[]) => void,
    labelFor?: (before: string) => string | undefined,
  ) => {
    if (!text.trim()) return;
    setChecking(true);
    try {
      const res = await fetch('/api/hp-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'チェックに失敗しました');
      setStatus(data.status === 'warn' ? 'warn' : 'ok');
      setEdits(
        (data.findings as { before: string; after: string; reason: string }[]).map((f) => ({
          ...f,
          status: 'pending' as const,
          sectionLabel: labelFor?.(f.before),
        })),
      );
    } catch (e) {
      // 失敗時は「未実行」に戻す（✅と誤認させない）。再チェックでリトライできる
      setStatus(null);
      setEdits([]);
      alert(`医療広告チェックに失敗しました: ${e instanceof Error ? e.message : e}`);
    } finally {
      setChecking(false);
    }
  };

  // 生成結果のチェック（生成完了・復元・修正適用のたびに実行＝スキップ不可）
  const runResultCheck = (res: any) => {
    if (!res || res.error) return;
    runAdCheck(
      flattenHpResult(res),
      setAdChecking,
      setAdStatus,
      setAdEdits,
      (before) => sectionLabelFor(res, before),
    );
  };

  // 修正案の個別 適用/却下（適用＝院長の操作で確定 → 直後に再チェック＝「直したつもり」防止）
  const setAdEditStatus = (i: number, status: AdGuardEdit['status']) => {
    if (adChecking) return;
    const e = adEdits[i];
    if (!e) return;
    if (status === 'applied' && e.status === 'pending') {
      const newResult = deepReplaceStrings(result, e.before, e.after);
      setResult(newResult);
      saveFeatureDraft('hp-generator', { form, result: newResult, deepDiveContent } satisfies HpGeneratorDraftPayload);
      setAdEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status: 'applied' } : x)));
      runResultCheck(newResult);
    } else {
      setAdEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status } : x)));
    }
  };

  // 「すべて適用」も確定は院長の操作（自動実行はしない）→ 適用後に再チェック
  const applyAllAdEdits = () => {
    if (adChecking || !result) return;
    let newResult = result;
    for (const e of adEdits) {
      if (e.status === 'pending') newResult = deepReplaceStrings(newResult, e.before, e.after);
    }
    setResult(newResult);
    saveFeatureDraft('hp-generator', { form, result: newResult, deepDiveContent } satisfies HpGeneratorDraftPayload);
    setAdEdits((prev) => prev.map((x) => (x.status === 'pending' ? { ...x, status: 'applied' } : x)));
    runResultCheck(newResult);
  };

  // ④ 貼り付けテキストのチェック・適用（仕組みは①②と同じ・対象がプレーンテキスト）
  const runPasteCheck = (text: string) => {
    runAdCheck(text, setPasteChecking, setPasteStatus, setPasteEdits);
  };
  const ensurePasteSnapshot = () => {
    setPasteOriginal((prev) => (prev ? prev : pasteText));
  };
  const setPasteEditStatus = (i: number, status: AdGuardEdit['status']) => {
    if (pasteChecking) return;
    const e = pasteEdits[i];
    if (!e) return;
    if (status === 'applied' && e.status === 'pending') {
      ensurePasteSnapshot();
      const newText = pasteText.split(e.before).join(e.after);
      setPasteText(newText);
      setPasteEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status: 'applied' } : x)));
      runPasteCheck(newText);
    } else {
      setPasteEdits((prev) => prev.map((x, idx) => (idx === i ? { ...x, status } : x)));
    }
  };
  const applyAllPasteEdits = () => {
    if (pasteChecking) return;
    ensurePasteSnapshot();
    let newText = pasteText;
    for (const e of pasteEdits) {
      if (e.status === 'pending') newText = newText.split(e.before).join(e.after);
    }
    setPasteText(newText);
    setPasteEdits((prev) => prev.map((x) => (x.status === 'pending' ? { ...x, status: 'applied' } : x)));
    runPasteCheck(newText);
  };
  const revertPaste = () => {
    if (!pasteOriginal) return;
    setPasteText(pasteOriginal);
    setPasteEdits([]);
    setPasteStatus(null);
  };

  // 復元取得が返ってきた時点で既に入力/実行が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current =
    isLoading ||
    !!result ||
    !!form.companyName.trim() ||
    !!form.target.trim() ||
    !!form.usp.trim() ||
    !!deepDiveContent;

  // マウント時に前回の実行結果（自動下書き）を復元。正はDB＝端末をまたいで復元できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<HpGeneratorDraftPayload>('hp-generator');
      if (cancelled || !draft?.payload) return;
      const p = draft.payload;
      if (!p.result && !p.deepDiveContent) return;
      if (draftGuardRef.current) return;
      if (p.form) setForm(p.form);
      setResult(p.result ?? null);
      setDeepDiveContent(p.deepDiveContent ?? '');
      setRestoredAt(draft.updated_at);
      // 復元した結果にも医療広告チェックを必ず走らせる（スキップ不可）
      if (p.result && !(p.result as { error?: unknown }).error) runResultCheck(p.result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す（復元は表示のみで副作用なし）
  const handleClearDraft = () => {
    setRestoredAt(null);
    setForm({ companyName: '', industry: 'IT・SaaS', target: '', usp: '', tone: '親しみやすくプロフェッショナル' });
    setResult(null);
    setDeepDiveContent('');
    setAdEdits([]);
    setAdStatus(null);
    clearFeatureDraft('hp-generator');
  };

  const handleGenerate = async () => {
    if (!form.companyName || !form.target || !form.usp) { alert('会社名・ターゲット・強みを入力してください'); return; }
    setIsLoading(true);
    setRestoredAt(null); // 新規実行結果は「復元」ではない
    try {
      const res = await fetch('/api/hp-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, contextInfo: [buildDefaultContextText(defaultContexts), buildContextText(hpContexts)].filter(Boolean).join('\n\n---\n\n') }),
      });
      const data = await res.json();
      setResult(data);
      setAdEdits([]);
      setAdStatus(null);
      // 完了した結果を自動下書き保存（画面遷移/アプリ終了後もマウント時に復元できる）
      if (data && !data.error) {
        saveFeatureDraft('hp-generator', {
          form,
          result: data,
          deepDiveContent,
        } satisfies HpGeneratorDraftPayload);
        // 生成完了後に医療広告チェックを必ず実行（スキップ不可・184①）
        runResultCheck(data);
      }
    } finally { setIsLoading(false); }
  };

  const copyText = (text: string, key: string) => { copyToClipboard(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  // セクション別の ⚠️要修正/✅ バッジ（未チェックなら非表示）
  const sectionWarn = (label: string) =>
    adEdits.some((e) => e.status === 'pending' && e.sectionLabel === label);
  const secBadge = (label: string) =>
    adChecking || adStatus === null ? null : sectionWarn(label) ? (
      <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 8, marginLeft: 6 }}>⚠️ 要修正</span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginLeft: 6 }}>✅</span>
    );

  const exportAll = () => {
    if (!result) return;
    const text = `# ${form.companyName} HP コンテンツ\n\n## ヒーローセクション\nキャッチコピー：${result.hero?.headline}\nサブキャッチ：${result.hero?.subheadline}\n説明文：${result.hero?.description}\nCTAボタン：${result.hero?.cta}\n\n## サービス\n${result.services?.map((s: any) => `### ${s.icon} ${s.title}\n${s.description}`).join('\n\n')}\n\n## 特徴\n${result.features?.map((f: any) => `### ${f.title}\n${f.description}`).join('\n\n')}\n\n## 会社概要\n${result.about}\n\n## FAQ\n${result.faq?.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}\n\n## メタディスクリプション\n${result.meta_description}`;
    triggerDownload(`${form.companyName}_HP_コンテンツ.txt`, text, 'text/plain');
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🏠 HP内容自動生成</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>企業情報を入力するだけで、HPの全セクションコンテンツをAIが自動生成します。</p>

      {/* 自動下書きからの復元バナー */}
      {restoredAt && (
        <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
      )}

      {/* AI対話で深掘りモード切替 */}
      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setShowDeepDive((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: showDeepDive ? '#059669' : 'rgba(5,150,105,0.1)',
            color: showDeepDive ? '#fff' : '#059669',
            border: '1px solid rgba(5,150,105,0.35)',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          💬 {showDeepDive ? '対話モードを閉じる' : 'AI対話で深掘りモード'}
        </button>
      </div>
      {showDeepDive && (
        <div style={{ marginBottom: 20 }}>
          <DeepDiveChat
            featureType="hp_content"
            featureLabel="HP内容"
            featureIcon="🏠"
            accentColor="#059669"
            onGenerated={(content) => {
              setDeepDiveContent(content);
              setShowDeepDive(false);
              setRestoredAt(null);
              // 対話モードの下書きも画面表示されるため自動下書き保存（復元対象にする）
              saveFeatureDraft('hp-generator', {
                form,
                result,
                deepDiveContent: content,
              } satisfies HpGeneratorDraftPayload);
            }}
          />
        </div>
      )}
      {deepDiveContent && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            background: 'rgba(5,150,105,0.06)',
            border: '1px solid rgba(5,150,105,0.25)',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>
              💬 AI対話で生成された下書き
            </span>
            <button
              onClick={() => setDeepDiveContent('')}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              ✕ 閉じる
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              maxHeight: 280,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-primary)',
            }}
          >
            {deepDiveContent}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/image-prompt', icon: '🎨', label: '画像プロンプト' },
          { href: '/dashboard/doc-prompt', icon: '📋', label: '資料プロンプト' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => setForm({ companyName: 'xLUMINA', industry: 'IT・SaaS', target: '情報収集・文章作成を効率化したい中小企業・フリーランス・マーケター', usp: '30以上のAI機能で情報収集から収益化まで一気通貫。月2,980円から。LP/HP/文章をAIが全自動生成。', tone: '親しみやすくプロフェッショナル' })} style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
        }}>📋 サンプルを入力</button>
      </div>
      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>会社名・サービス名 *</div>
            <input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="例：xLUMINA"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>業種</div>
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
              {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>ターゲット顧客 *</div>
          <input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="例：中小企業のマーケティング担当者"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>強み・USP *</div>
          <textarea value={form.usp} onChange={e => setForm(f => ({ ...f, usp: e.target.value }))} placeholder="例：30以上のAI機能で情報収集から文章生成まで一気通貫"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', minHeight: 70, resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>トーン・文体</div>
          <select value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {TONES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {/* 機能別デフォルト背景情報（自動読み込み） */}
        <DefaultContextBar featureKey="hp-generator" onChange={setDefaultContexts} />
        {/* 背景情報セレクタ */}
        <ContextSelector featureKey="all" onSelect={setHpContexts} />
        <button onClick={handleGenerate} disabled={isLoading} style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
          background: isLoading ? 'rgba(108,99,255,0.4)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 15,
        }}>
          {isLoading ? '🤖 AIがHP内容を生成中...' : '✨ HP内容を自動生成'}
        </button>
      </div>

      {/* 生成結果 */}
      {result && !result.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>生成結果</span>
            <button onClick={exportAll} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>💾 全文TXTで保存</button>
          </div>

          {/* 医療広告ガード（184①②）: 生成後に自動実行・⚠️は隠さない・修正は院長が個別に確定 */}
          <AdGuardFindings
            status={adStatus}
            edits={adEdits}
            checking={adChecking}
            onSetStatus={setAdEditStatus}
            onApplyAll={applyAllAdEdits}
            onRecheck={() => runResultCheck(result)}
          />

          {/* ヒーロー */}
          {result.hero && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🎯 ヒーローセクション{secBadge('🎯 ヒーロー')}</span>
                <button onClick={() => copyText(`${result.hero.headline}\n${result.hero.subheadline}\n${result.hero.description}`, 'hero')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {copied === 'hero' ? '✅' : '📋 コピー'}
                </button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>キャッチコピー：</span><strong>{result.hero.headline}</strong></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>サブキャッチ：</span>{result.hero.subheadline}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>説明文：</span>{result.hero.description}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>CTA：</span><span style={{ padding: '3px 12px', borderRadius: 20, background: 'var(--accent)', color: '#fff', fontSize: 12 }}>{result.hero.cta}</span></div>
              </div>
            </div>
          )}

          {/* サービス */}
          {result.services && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>🛠️ サービス・機能{secBadge('🛠️ サービス')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {result.services.map((s: any, i: number) => (
                  <div key={i} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.icon} {s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 会社概要 */}
          {result.about && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🏢 会社概要{secBadge('🏢 会社概要')}</span>
                <button onClick={() => copyText(result.about, 'about')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{copied === 'about' ? '✅' : '📋 コピー'}</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{result.about}</p>
            </div>
          )}

          {/* FAQ */}
          {result.faq && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>❓ FAQ{secBadge('❓ FAQ')}</span>
              {result.faq.map((f: any, i: number) => (
                <div key={i} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Q: {f.question}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>A: {f.answer}</div>
                </div>
              ))}
            </div>
          )}

          {/* メタディスクリプション */}
          {result.meta_description && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🔍 メタディスクリプション{secBadge('🔍 メタ')}</span>
                <button onClick={() => copyText(result.meta_description, 'meta')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{copied === 'meta' ? '✅' : '📋 コピー'}</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{result.meta_description}</p>
            </div>
          )}
        </div>
      )}

      {/* ── 185: HPブログ記事生成＋記事連動の画像生成（既存のHP内容生成は無変更） ── */}
      <HpBlogSection />

      {/* ── 184④: 既存HP文章の加筆修正モード（貼り付けのみ・URL自動取得は行わない） ── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginTop: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          🩺 既存HP文章のチェック＆加筆修正
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, lineHeight: 1.7 }}>
          今のHPに載っている文章を貼り付けると、医療広告チェック（修正案の提示つき）と、AIによる加筆修正・全面リライトができます。
          セクション単位でも全文でも貼り付け可能です（URLからの自動取得は行いません）。
        </p>

        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'既存のHP文章をここに貼り付けてください\n（例：診療案内・院長挨拶・施術説明などのページ本文）'}
          style={{ width: '100%', minHeight: 180, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 14px' }}>
          <button
            type="button"
            onClick={() => { ensurePasteSnapshot(); runPasteCheck(pasteText); }}
            disabled={!pasteText.trim() || pasteChecking}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: !pasteText.trim() || pasteChecking ? 'var(--bg-primary)' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
              color: !pasteText.trim() || pasteChecking ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: 13, cursor: !pasteText.trim() || pasteChecking ? 'not-allowed' : 'pointer',
            }}
          >
            {pasteChecking ? '🛡 チェック中...' : '🛡 医療広告チェック'}
          </button>
          <button
            type="button"
            onClick={() => { ensurePasteSnapshot(); setRefineOpen(true); }}
            disabled={!pasteText.trim()}
            title="加筆修正（差分ペアの適用/却下）・全面リライト（2パス）・前後2列比較"
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: !pasteText.trim() ? 'var(--bg-primary)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: !pasteText.trim() ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: 13, cursor: !pasteText.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            ✏️ AIで修正（加筆・リライト）
          </button>
          <button
            type="button"
            onClick={() => { copyToClipboard(pasteText); setPasteCopied(true); setTimeout(() => setPasteCopied(false), 2000); }}
            disabled={!pasteText.trim()}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: pasteCopied ? '#16a34a' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: !pasteText.trim() ? 'not-allowed' : 'pointer' }}
          >
            {pasteCopied ? '✅ コピー済み' : '📋 コピー'}
          </button>
          <button
            type="button"
            onClick={revertPaste}
            disabled={!pasteOriginal || pasteOriginal === pasteText}
            title="修正を始める前の文章に戻します"
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: !pasteOriginal || pasteOriginal === pasteText ? 'not-allowed' : 'pointer', opacity: !pasteOriginal || pasteOriginal === pasteText ? 0.5 : 1 }}
          >
            ↩︎ 元に戻す
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {pasteText.length.toLocaleString()}字
          </span>
        </div>

        {(pasteStatus !== null || pasteChecking || pasteEdits.length > 0) && (
          <AdGuardFindings
            status={pasteStatus}
            edits={pasteEdits}
            checking={pasteChecking}
            onSetStatus={setPasteEditStatus}
            onApplyAll={applyAllPasteEdits}
            onRecheck={() => runPasteCheck(pasteText)}
          />
        )}
      </div>

      {/* 169の TextRefinePanel 流用: 加筆修正（差分ペア）・全面リライト（172の2パス）・2列比較・↩︎元に戻す内蔵 */}
      <TextRefinePanel
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        sourceText={pasteText}
        sourceLabel="既存HP文章"
        onApply={(newText) => {
          ensurePasteSnapshot();
          setPasteText(newText);
          // 文章が変わったのでチェック結果は古い＝未実行に戻す（✅の残留で誤認させない）
          setPasteStatus(null);
          setPasteEdits([]);
        }}
      />
    </div>
  );
}
