'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 315: 🖼 図解生成（記事→表・図・画像）
//   STEP1 元テキスト（📚🗂🧠の ?scope=&id= か貼り付け）→ プラン抽出（Gemini・最大6）
//   STEP2 プランの編集（院長が直した文字列が唯一の正）。元テキストに無い語句・医療広告NGは赤い印＝直すまで描けない（決定的）
//   STEP3 決定的描画（表・フロー・比較・手順・概念図＝/api/visuals/render）／イメージ（GPT Image 2.5＝/api/visuals/image・確認1回）
//   保存は既存の /api/gallery（Blob）に source='visuals'・settings.visual（出どころ・プラン・費用の実績）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { saveImageToGallery } from '@/lib/gallery-client';
import { IMAGE_MODEL_IDS, estimateImageCost, formatUsd, imagePricingNote } from '@/lib/model-pricing';
import {
  VISUAL_DETERMINISTIC_TYPES,
  VISUAL_IMAGE_DEFAULT_SETTINGS,
  VISUAL_IMAGE_QUALITIES,
  VISUAL_IMAGE_SIZE,
  VISUAL_NOTE_GUIDE,
  VISUAL_ORIENTATIONS,
  VISUAL_ORIENTATION_LABEL,
  VISUAL_SOURCE_MAX_ITEMS,
  VISUAL_TYPES,
  VISUAL_TYPE_META,
  buildVisualGallerySettings,
  buildVisualImagePrompt,
  checkPlan,
  collectPlanStrings,
  planBlockReason,
  visualSaveTitle,
  type PlanCheck,
  type VisualImageSettings,
  type VisualOrientation,
  type VisualPlan,
  type VisualSourceRef,
  type VisualType,
} from '@/lib/visuals';

type Result = {
  kind: 'render' | 'image';
  finalBase64: string;
  originalBase64?: string;
  width: number;
  height: number;
  galleryId?: string;
  originalGalleryId?: string;
  blobUrl?: string;
  model: string;
  costUsd?: number | null;
  aiText?: boolean;
  textVerified?: boolean;
  generatedAt: string;
  saving?: boolean;
  saveError?: string;
};

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' };

export default function VisualsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>読み込み中...</div>}>
      <VisualsInner />
    </Suspense>
  );
}

function VisualsInner() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [sourceText, setSourceText] = useState('');
  const [sources, setSources] = useState<VisualSourceRef[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [status, setStatus] = useState<{ gptImage: boolean; blob: boolean } | null>(null);
  const [plans, setPlans] = useState<VisualPlan[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [orientation, setOrientation] = useState<VisualOrientation>('landscape');
  const [imageSettings, setImageSettings] = useState<VisualImageSettings>(VISUAL_IMAGE_DEFAULT_SETTINGS);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, { message: string; unavailable?: boolean }>>({});
  const [imageDialog, setImageDialog] = useState<string | null>(null);
  const busyRef = useRef<Set<string>>(new Set()); // R-87
  const extractRef = useRef(false);

  // 使えるモデル（キーの有無だけ）と、?scope=&id= の元テキスト
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/visuals?mode=status');
        const j = (await r.json().catch(() => ({}))) as { gptImage?: boolean; blob?: boolean };
        if (!cancelled) setStatus({ gptImage: !!j.gptImage, blob: !!j.blob });
      } catch {
        if (!cancelled) setStatus({ gptImage: false, blob: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const scope = searchParams?.get('scope') ?? '';
    const ids = (searchParams?.get('id') ?? searchParams?.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!scope || ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/visuals?mode=source&scope=${encodeURIComponent(scope)}&ids=${encodeURIComponent(ids.join(','))}`);
        const j = (await r.json().catch(() => ({}))) as { sources?: VisualSourceRef[]; text?: string; error?: string; missing?: string[] };
        if (!r.ok || !j.sources) throw new Error(j.error || `元テキストを取得できませんでした（${r.status}）`);
        if (cancelled) return;
        setSources(j.sources);
        setSourceText(j.text ?? '');
        if (j.missing && j.missing.length > 0) setSourceError(`見つからない元テキストがあります（${j.missing.length}件）`);
      } catch (e) {
        if (!cancelled) setSourceError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const checks = useMemo<Record<string, PlanCheck>>(() => Object.fromEntries(plans.map((p) => [p.id, checkPlan(p, sourceText)])), [plans, sourceText]);
  const updatePlan = useCallback((id: string, patch: (p: VisualPlan) => VisualPlan) => setPlans((prev) => prev.map((p) => (p.id === id ? patch(p) : p))), []);
  const movePlan = (id: string, dir: -1 | 1) =>
    setPlans((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const extract = async () => {
    if (extractRef.current) return; // R-87
    const text = sourceText.trim();
    if (text.length < 20) {
      showToast('元テキストを入れてください（20字以上）', 'warning');
      return;
    }
    extractRef.current = true;
    setExtracting(true);
    try {
      const r = await fetch('/api/visuals/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = (await r.json().catch(() => ({}))) as { plans?: VisualPlan[]; rejected?: string[]; error?: string };
      if (!r.ok || !j.plans) throw new Error(j.error || `抽出に失敗しました（${r.status}）`);
      setPlans(j.plans);
      setRejected(j.rejected ?? []);
      setResults({});
      setErrors({});
      showToast(j.plans.length > 0 ? `${j.plans.length}件の図解候補を提案しました` : '図解に向く構造が見つかりませんでした', j.plans.length > 0 ? 'success' : 'warning');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '抽出に失敗しました', 'error');
    } finally {
      extractRef.current = false;
      setExtracting(false);
    }
  };

  const saveToGallery = async (plan: VisualPlan, r: { base64: string; width: number; height: number; model: string; generatedAt: string; kind: 'render' | 'image-final' | 'image-original'; quality?: string; aiText?: boolean; costUsd?: number | null; originalId?: string }) => {
    const settings = buildVisualGallerySettings({ kind: r.kind, plan, orientation, sources, width: r.width, height: r.height, model: r.model, quality: r.quality, aiText: r.aiText, costUsd: r.costUsd, originalId: r.originalId, generatedAt: r.generatedAt });
    return saveImageToGallery({ imageBase64: r.base64, prompt: `図解: ${plan.title}`, settings, title: visualSaveTitle(plan, r.kind), source: 'visuals', width: r.width, height: r.height });
  };

  const render = async (plan: VisualPlan) => {
    if (busyRef.current.has(plan.id)) return; // R-87
    busyRef.current.add(plan.id);
    setBusy((b) => ({ ...b, [plan.id]: true }));
    setErrors((e) => ({ ...e, [plan.id]: undefined as never }));
    try {
      const r = await fetch('/api/visuals/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, sourceText, orientation }) });
      const j = (await r.json().catch(() => ({}))) as { imageBase64?: string; width?: number; height?: number; textVerified?: boolean; generatedAt?: string; error?: string };
      if (!r.ok || !j.imageBase64) throw new Error(j.error || `描画に失敗しました（${r.status}）`);
      const res: Result = { kind: 'render', finalBase64: j.imageBase64, width: j.width ?? 0, height: j.height ?? 0, model: 'og-render', textVerified: !!j.textVerified, generatedAt: j.generatedAt ?? new Date().toISOString(), saving: true };
      setResults((m) => ({ ...m, [plan.id]: res }));
      try {
        const saved = await saveToGallery(plan, { base64: j.imageBase64, width: res.width, height: res.height, model: 'og-render', generatedAt: res.generatedAt, kind: 'render' });
        setResults((m) => ({ ...m, [plan.id]: { ...m[plan.id], galleryId: saved.id, blobUrl: saved.blob_url, saving: false } }));
      } catch (e) {
        setResults((m) => ({ ...m, [plan.id]: { ...m[plan.id], saving: false, saveError: e instanceof Error ? e.message : '保存に失敗しました' } }));
      }
    } catch (e) {
      setErrors((m) => ({ ...m, [plan.id]: { message: e instanceof Error ? e.message : '描画に失敗しました' } }));
    } finally {
      busyRef.current.delete(plan.id);
      setBusy((b) => ({ ...b, [plan.id]: false }));
    }
  };

  const generateImage = async (plan: VisualPlan) => {
    if (busyRef.current.has(plan.id)) return; // R-87
    busyRef.current.add(plan.id);
    setImageDialog(null);
    setBusy((b) => ({ ...b, [plan.id]: true }));
    setErrors((e) => ({ ...e, [plan.id]: undefined as never }));
    try {
      const r = await fetch('/api/visuals/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, sourceText, settings: { ...imageSettings, orientation } }) });
      const j = (await r.json().catch(() => ({}))) as { originalBase64?: string; finalBase64?: string; width?: number; height?: number; model?: string; costUsd?: number | null; generatedAt?: string; error?: string; unavailable?: boolean };
      if (!r.ok || !j.finalBase64 || !j.originalBase64) throw Object.assign(new Error(j.error || `生成に失敗しました（${r.status}）`), { unavailable: j.unavailable });
      const res: Result = { kind: 'image', finalBase64: j.finalBase64, originalBase64: j.originalBase64, width: j.width ?? 0, height: j.height ?? 0, model: j.model ?? IMAGE_MODEL_IDS.flare, costUsd: j.costUsd ?? null, aiText: imageSettings.aiText, generatedAt: j.generatedAt ?? new Date().toISOString(), saving: true };
      setResults((m) => ({ ...m, [plan.id]: res }));
      try {
        // 元画像（C2PA つき）を先に保存し、完成画像に originalId を載せる
        const original = await saveToGallery(plan, { base64: j.originalBase64, width: res.width, height: res.height, model: res.model, generatedAt: res.generatedAt, kind: 'image-original', quality: imageSettings.quality, aiText: imageSettings.aiText, costUsd: res.costUsd });
        const saved = await saveToGallery(plan, { base64: j.finalBase64, width: res.width, height: res.height, model: res.model, generatedAt: res.generatedAt, kind: 'image-final', quality: imageSettings.quality, aiText: imageSettings.aiText, costUsd: res.costUsd, originalId: original.id });
        setResults((m) => ({ ...m, [plan.id]: { ...m[plan.id], galleryId: saved.id, originalGalleryId: original.id, blobUrl: saved.blob_url, saving: false } }));
      } catch (e) {
        setResults((m) => ({ ...m, [plan.id]: { ...m[plan.id], saving: false, saveError: e instanceof Error ? e.message : '保存に失敗しました' } }));
      }
    } catch (e) {
      setErrors((m) => ({ ...m, [plan.id]: { message: e instanceof Error ? e.message : '生成に失敗しました', unavailable: !!(e as { unavailable?: boolean }).unavailable } }));
    } finally {
      busyRef.current.delete(plan.id);
      setBusy((b) => ({ ...b, [plan.id]: false }));
    }
  };

  const download = (plan: VisualPlan, r: Result) => {
    const bytes = Uint8Array.from(atob(r.finalBase64), (c) => c.charCodeAt(0));
    const safe = plan.title.replace(/[/\\:*?"<>|]/g, '').slice(0, 30) || 'visual';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}_${VISUAL_TYPE_META[plan.type].label}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyImage = async (r: Result) => {
    try {
      const bytes = Uint8Array.from(atob(r.finalBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('画像をコピーしました', 'success');
    } catch {
      showToast('この環境では画像をコピーできません（ダウンロードをお使いください）', 'warning');
    }
  };

  const dialogPlan = imageDialog ? plans.find((p) => p.id === imageDialog) ?? null : null;
  const dialogEstimate = dialogPlan ? estimateImageCost(imageSettings.quality, orientation, buildVisualImagePrompt(dialogPlan, imageSettings).length) : null;

  return (
    <div data-visuals-page style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🖼 図解生成</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
          記事・分析結果のテキストから、表・フロー・比較・手順・概念図（コードで描画＝文字はプランどおり）とイメージ画像（GPT Image 2.5・文字は重ねる）を作ります。図に入る文字は、あなたが確認・編集したプランの文字列だけです。
        </p>
      </div>

      {/* STEP1 */}
      <section data-vis-step1 style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>STEP1 元テキスト</strong>
          {sources.length > 0 && (
            <span data-vis-sources={sources.length} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {sources.map((s) => s.title).join(' ／ ')}（{sources.length}件）
            </span>
          )}
          {sourceError && <span data-vis-source-error style={{ fontSize: 11, color: '#B91C1C' }}>⚠️ {sourceError}</span>}
        </div>
        <textarea data-vis-source value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="ここに記事・分析結果のテキストを貼り付けるか、📚🗂の行の「🖼 図解にする」から開いてください" rows={8} style={{ ...input, fontSize: 16, resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sourceText.length.toLocaleString()} 文字</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-vis-extract onClick={() => void extract()} disabled={extracting || sourceText.trim().length < 20} style={{ ...primaryBtn, opacity: extracting || sourceText.trim().length < 20 ? 0.5 : 1 }}>
            {extracting ? '⏳ 抽出中…' : '🧩 図解プランを抽出（最大6・AI）'}
          </button>
        </div>
      </section>

      {/* STEP2/3 */}
      {plans.length > 0 && (
        <section data-vis-step2 style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>STEP2 プランを直す → STEP3 描く</strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>赤い印＝元テキストに無い語句／NG表現。直すと描けます（判定は編集のたびに再計算）</span>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              向き
              <select data-vis-orientation value={orientation} onChange={(e) => setOrientation(e.target.value as VisualOrientation)} style={{ ...input, width: 'auto', padding: '4px 8px' }}>
                {VISUAL_ORIENTATIONS.map((o) => <option key={o} value={o}>{VISUAL_ORIENTATION_LABEL[o]}</option>)}
              </select>
            </label>
          </div>
          {rejected.length > 0 && <div data-vis-rejected={rejected.length} style={{ fontSize: 11, color: 'var(--text-muted)' }}>候補から外したもの: {rejected.join('／')}</div>}
          {plans.map((plan, idx) => {
            const check = checks[plan.id];
            const reason = planBlockReason(check);
            const res = results[plan.id];
            const err = errors[plan.id];
            const isImage = plan.type === 'image';
            const imageBlocked = isImage && status && !status.gptImage;
            return (
              <div key={plan.id} data-vis-plan={plan.id} data-vis-plan-type={plan.type} data-vis-plan-ok={check.ok ? '1' : '0'} style={{ border: `1px solid ${check.ok ? 'var(--border)' : 'rgba(185,28,28,0.5)'}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{idx + 1}.</span>
                  <select data-vis-type={plan.id} value={plan.type} onChange={(e) => updatePlan(plan.id, (p) => ({ ...p, type: e.target.value as VisualType }))} style={{ ...input, width: 'auto', padding: '4px 8px' }}>
                    {VISUAL_TYPES.map((t) => <option key={t} value={t}>{VISUAL_TYPE_META[t].emoji} {VISUAL_TYPE_META[t].label}</option>)}
                  </select>
                  <input data-vis-title={plan.id} value={plan.title} onChange={(e) => updatePlan(plan.id, (p) => ({ ...p, title: e.target.value }))} placeholder="タイトル（元テキストの語句）" style={{ ...input, flex: 1, minWidth: 200 }} />
                  <button type="button" onClick={() => movePlan(plan.id, -1)} disabled={idx === 0} style={{ ...btn, padding: '4px 8px' }} title="上へ">↑</button>
                  <button type="button" onClick={() => movePlan(plan.id, 1)} disabled={idx === plans.length - 1} style={{ ...btn, padding: '4px 8px' }} title="下へ">↓</button>
                  <button type="button" data-vis-remove={plan.id} onClick={() => setPlans((prev) => prev.filter((p) => p.id !== plan.id))} style={{ ...btn, padding: '4px 8px', color: '#B91C1C' }} title="この候補を消す">🗑</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{VISUAL_TYPE_META[plan.type].hint}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                  {plan.groups.map((g, gi) => (
                    <div key={gi} data-vis-group={`${plan.id}-${gi}`} style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input data-vis-heading={`${plan.id}-${gi}`} value={g.heading ?? ''} onChange={(e) => updatePlan(plan.id, (p) => ({ ...p, groups: p.groups.map((x, i) => (i === gi ? { ...x, heading: e.target.value || undefined } : x)) }))} placeholder="見出し（列名・対象・枝）" style={{ ...input, fontSize: 13 }} />
                        <button type="button" onClick={() => updatePlan(plan.id, (p) => ({ ...p, groups: p.groups.filter((_, i) => i !== gi) }))} style={{ ...btn, padding: '4px 8px' }} title="このグループを消す">✕</button>
                      </div>
                      <textarea data-vis-points={`${plan.id}-${gi}`} value={g.points.join('\n')} onChange={(e) => updatePlan(plan.id, (p) => ({ ...p, groups: p.groups.map((x, i) => (i === gi ? { ...x, points: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } : x)) }))} placeholder="要素（1行1つ・順番どおり）" rows={Math.max(3, g.points.length + 1)} style={{ ...input, fontSize: 13, resize: 'vertical' }} />
                    </div>
                  ))}
                  <button type="button" onClick={() => updatePlan(plan.id, (p) => ({ ...p, groups: [...p.groups, { points: [] }] }))} style={{ ...btn, alignSelf: 'flex-start' }}>＋ グループを足す</button>
                </div>
                {isImage && (
                  <input data-vis-image-prompt={plan.id} value={plan.imagePrompt ?? ''} onChange={(e) => updatePlan(plan.id, (p) => ({ ...p, imagePrompt: e.target.value }))} placeholder="絵柄の指示（文字はここに書かない）" style={{ ...input, fontSize: 13 }} />
                )}
                {/* 判定（決定的・編集のたびに再計算） */}
                {(check.foreign.length > 0 || check.banned.length > 0 || check.empty) && (
                  <div data-vis-block-reason={plan.id} style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.7 }}>
                    ⚠️ {reason}
                    {check.foreign.length > 0 && (
                      <div>
                        元テキストに無い語句: {check.foreign.map((f) => <span key={f} data-vis-foreign={plan.id} style={{ display: 'inline-block', margin: '2px 4px', padding: '1px 6px', borderRadius: 6, background: 'rgba(185,28,28,0.1)', color: '#B91C1C', fontWeight: 700 }}>{f}</span>)}
                      </div>
                    )}
                    {check.banned.length > 0 && (
                      <div>
                        NG表現: {check.banned.map((b, i) => <span key={i} data-vis-banned={plan.id} style={{ display: 'inline-block', margin: '2px 4px', padding: '1px 6px', borderRadius: 6, background: 'rgba(185,28,28,0.1)', color: '#B91C1C', fontWeight: 700 }} title={b.reason}>{b.matched}</span>)}
                      </div>
                    )}
                  </div>
                )}
                {/* STEP3 操作 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {VISUAL_DETERMINISTIC_TYPES.includes(plan.type) ? (
                    <button type="button" data-vis-render={plan.id} onClick={() => void render(plan)} disabled={!check.ok || !!busy[plan.id]} title={reason ?? 'プランの文字列をそのまま描画します（文字はコードで描くため100%一致）'} style={{ ...primaryBtn, opacity: !check.ok || busy[plan.id] ? 0.5 : 1 }}>
                      {busy[plan.id] ? '⏳ 描画中…' : '🖨 描画する（コード・AIなし）'}
                    </button>
                  ) : (
                    <>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        品質
                        <select data-vis-quality value={imageSettings.quality} onChange={(e) => setImageSettings((s) => ({ ...s, quality: e.target.value as 'low' | 'medium' | 'high' }))} style={{ ...input, width: 'auto', padding: '4px 8px' }}>
                          {VISUAL_IMAGE_QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      </label>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} title="既定は文字なしの絵柄を生成し、プランの文字をコードで重ねます（文字は100%一致）。チェックすると AI に文字も描かせます（完成後に目視確認）">
                        <input type="checkbox" data-vis-aitext checked={imageSettings.aiText} onChange={(e) => setImageSettings((s) => ({ ...s, aiText: e.target.checked }))} />
                        AIに文字も描かせる
                      </label>
                      <input data-vis-extra-prompt value={imageSettings.extraPrompt} onChange={(e) => setImageSettings((s) => ({ ...s, extraPrompt: e.target.value }))} placeholder="追記（任意）" style={{ ...input, width: 220, fontSize: 12 }} />
                      <button
                        type="button"
                        data-vis-image={plan.id}
                        data-vis-image-unavailable={imageBlocked ? '1' : undefined}
                        onClick={() => setImageDialog(plan.id)}
                        disabled={!check.ok || !!busy[plan.id] || !status || !!imageBlocked}
                        title={imageBlocked ? '未設定（院長が OPENAI_API_KEY を Vercel の環境変数に設定すると使えます）' : reason ?? `GPT Image 2.5（${IMAGE_MODEL_IDS.flare}）で絵柄を生成し、プランの文字を重ねます（確認ダイアログで費用の目安を表示）`}
                        style={{ ...primaryBtn, background: '#e0684b', opacity: !check.ok || busy[plan.id] || !status || imageBlocked ? 0.5 : 1 }}
                      >
                        {busy[plan.id] ? '⏳ 生成中…' : imageBlocked ? '🖼 GPT Image 2.5（未設定）' : '🖼 画像を生成（GPT Image 2.5）'}
                      </button>
                    </>
                  )}
                  {err && <span data-vis-error={plan.id} data-vis-error-unavailable={err.unavailable ? '1' : undefined} style={{ fontSize: 12, color: '#B91C1C' }}>❌ {err.message}</span>}
                </div>
                {/* 結果 */}
                {res && (
                  <div data-vis-result={plan.id} data-vis-result-kind={res.kind} data-vis-verified={res.textVerified ? '1' : undefined} data-vis-saved={res.galleryId ? '1' : '0'} data-vis-gallery-id={res.galleryId} data-vis-original-id={res.originalGalleryId} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <img data-vis-result-img={plan.id} src={`data:image/png;base64,${res.finalBase64}`} alt={plan.title} style={{ maxWidth: res.aiText ? 'min(100%, 520px)' : '100%', width: res.aiText ? 520 : undefined, height: 'auto', border: '1px solid var(--border)', borderRadius: 8 }} />
                      {res.aiText && (
                        <div data-vis-aitext-check={plan.id} style={{ flex: 1, minWidth: 220, fontSize: 12, lineHeight: 1.7 }}>
                          <div style={{ fontWeight: 700, color: '#B45309' }}>👀 目視確認: 画像の文字がプランの文字列と一字一句同じか確かめてください（AIが描いた文字は機械判定していません）</div>
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{collectPlanStrings(plan).map((s) => <li key={s}>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>{res.width}×{res.height}</span>
                      <span data-vis-result-model>{res.model}</span>
                      {res.kind === 'render' && res.textVerified && <span data-vis-text-verified style={{ color: '#0d9973', fontWeight: 700 }}>✓ 文字はプランと完全一致（機械判定）</span>}
                      {res.costUsd != null && <span data-vis-cost-actual>費用の実績 {formatUsd(res.costUsd)}</span>}
                      {res.saving ? <span>保存中…</span> : res.galleryId ? <a data-vis-gallery-link href="/dashboard/gallery" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>✅ ギャラリーに保存済み{res.originalGalleryId ? '（元画像も保存）' : ''}</a> : res.saveError ? <span style={{ color: '#B91C1C' }}>保存に失敗: {res.saveError}</span> : null}
                      <span style={{ flex: 1 }} />
                      <button type="button" data-vis-download={plan.id} onClick={() => download(plan, res)} style={btn}>📥 PNG</button>
                      <button type="button" data-vis-copy={plan.id} onClick={() => void copyImage(res)} style={btn}>📋 コピー</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>📝 {VISUAL_NOTE_GUIDE}</div>
        </section>
      )}

      {/* 画像生成の確認ダイアログ（R-56: 1回） */}
      {dialogPlan && dialogEstimate && (
        <div data-vis-image-dialog role="dialog" aria-label="画像生成の確認" onClick={(e) => { if (e.target === e.currentTarget) setImageDialog(null); }} style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.35)' }}>
          <div style={{ width: 'min(560px, 100%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>🖼 GPT Image 2.5 で画像を生成しますか？</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div>図解: <strong>{dialogPlan.title}</strong></div>
              <div>モデル: <span data-vis-image-dialog-model>{IMAGE_MODEL_IDS[imageSettings.model]}</span> ／ 品質 {imageSettings.quality} ／ サイズ {VISUAL_IMAGE_SIZE[orientation]}</div>
              <div>文字: {imageSettings.aiText ? 'AIに描かせる（完成後に目視確認）' : '重ねる（コードで描く＝100%一致）'}</div>
              <div>枚数: <span data-vis-image-dialog-count>1</span> 枚（元画像と完成画像の2ファイルを保存）</div>
              <div>費用の目安: <strong data-vis-image-dialog-cost data-vis-image-dialog-cost-usd={dialogEstimate.usd.toFixed(4)}>{formatUsd(dialogEstimate.usd)}</strong> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>（{imagePricingNote()}）</span></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" data-vis-image-cancel onClick={() => setImageDialog(null)} style={btn}>やめる</button>
              <button type="button" data-vis-image-start onClick={() => void generateImage(dialogPlan)} style={{ ...primaryBtn, background: '#e0684b' }}>🖼 生成する</button>
            </div>
          </div>
        </div>
      )}
      {sources.length > VISUAL_SOURCE_MAX_ITEMS && null}
    </div>
  );
}
