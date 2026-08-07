'use client';

// 228: note記事の仕上げパネル（まとめ・画像配置・note貼り付けキット）。
// 経路A（NoteBundleModal の結果カード）と経路B（/dashboard/note-article）で共用する。
// - 状態は NoteEnhanceState を親が保持（controlled）: 器の違い（feature_result_drafts /
//   モーダルstate＋library.metadata）を親に委ねる
// - 本文には一切書き込まない（fail-closed: まとめ・画像の失敗で本文は無傷。出力時にのみ結合）
// - 画像は生成後すぐ既存の /api/gallery 経路で保存（モーダルを閉じても画像は消えない）

import { useMemo, useState, type CSSProperties } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { saveImageToGallery } from '@/lib/gallery-client';
import { IMAGE_MODELS, type ImageModelKey } from '@/lib/image-providers';
import {
  KINDLE_IMAGE_STYLES,
  KINDLE_IMAGE_STYLE_KEYS,
  DEFAULT_KINDLE_IMAGE_STYLE,
  type KindleImageStyleKey,
} from '@/lib/kindle-image-styles';
import {
  SUMMARY_IMAGE_TEMPLATES,
  SUMMARY_IMAGE_TEMPLATE_KEYS,
  FIGURE_TEMPLATES,
  FIGURE_TEMPLATE_KEYS,
  type FigureTemplateKey,
  type SummaryImageTemplateKey,
} from '@/lib/summary-image-templates';
import {
  NOTE_PLACEMENT_SLOTS,
  noteImageFileName,
  splitMarkdownBlocks,
  type NoteEnhanceState,
  type NoteFigure,
  type NotePlacementImage,
} from '@/lib/note-enhance';
import {
  buildNoteHtml,
  buildNotePasteText,
  copyRichText,
  downloadImageFile,
  orderedByBlock,
  orderedPlacements,
  toNoteCompatible,
  type NoteCompatOptions,
  type NotePasteImage,
} from '@/lib/note-compat';

interface Props {
  title: string;
  content: string;
  state: NoteEnhanceState;
  onChange: (next: NoteEnhanceState) => void;
}

const smallBtn = (extra?: CSSProperties): CSSProperties => ({
  padding: '6px 12px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  ...extra,
});

const sectionStyle: CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  marginBottom: 12,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

function nowIso(): string {
  return new Date().toISOString();
}

let placementIdSeq = 1;
function newPlacementId(): string {
  return `pl-${Date.now()}-${placementIdSeq++}`;
}

export default function NoteEnhancePanel({ title, content, state, onChange }: Props) {
  const [busySummary, setBusySummary] = useState(false);
  const [busySummaryImage, setBusySummaryImage] = useState(false);
  const [busyPlacement, setBusyPlacement] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [busyFigures, setBusyFigures] = useState(false);
  const [busyFigureId, setBusyFigureId] = useState<string | null>(null);
  const [busyKit, setBusyKit] = useState(false);
  const [toast, setToast] = useState('');
  const [engine, setEngine] = useState<ImageModelKey>('gpt-image-2');
  const [styleKey, setStyleKey] = useState<KindleImageStyleKey>(DEFAULT_KINDLE_IMAGE_STYLE);
  const [template, setTemplate] = useState<SummaryImageTemplateKey>(state.summaryImage?.template ?? 'card');
  const [boldMode, setBoldMode] = useState<NoteCompatOptions['boldMode']>('strip');
  const [tableMode, setTableMode] = useState<NoteCompatOptions['tableMode']>('bullets');
  const [showGuide, setShowGuide] = useState(false);

  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);
  const figures = useMemo(() => state.figures ?? [], [state.figures]);

  const flash = (msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  const summaryTitle = `${(title || 'この記事').slice(0, 40)}｜まとめ`;

  // ── まとめ ──────────────────────────────────────────────
  const generateSummary = async () => {
    if (!content.trim()) return;
    setBusySummary(true);
    try {
      const res = await fetch('/api/note-enhance/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.points)) throw new Error(data.error || 'まとめの生成に失敗しました');
      onChange({ ...state, summary: { points: data.points, updatedAt: data.updatedAt || nowIso(), source: 'auto' } });
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusySummary(false);
    }
  };

  const setPoints = (points: string[]) => {
    onChange({ ...state, summary: { points, updatedAt: nowIso(), source: 'edited' } });
  };
  const updatePoint = (i: number, v: string) => {
    const pts = [...(state.summary?.points ?? [])];
    pts[i] = v;
    setPoints(pts);
  };
  const movePoint = (i: number, dir: -1 | 1) => {
    const pts = [...(state.summary?.points ?? [])];
    const j = i + dir;
    if (j < 0 || j >= pts.length) return;
    [pts[i], pts[j]] = [pts[j], pts[i]];
    setPoints(pts);
  };
  const removePoint = (i: number) => {
    const pts = (state.summary?.points ?? []).filter((_, x) => x !== i);
    setPoints(pts);
  };
  const addPoint = () => setPoints([...(state.summary?.points ?? []), '']);

  // ── まとめ画像（227C方式b・プログラム描画→gallery保存） ──
  const generateSummaryImage = async () => {
    const points = (state.summary?.points ?? []).map((p) => p.trim()).filter(Boolean);
    if (points.length === 0) {
      flash('⚠️ 先にまとめを生成・保存してください');
      return;
    }
    setBusySummaryImage(true);
    try {
      const res = await fetch('/api/note-enhance/summary-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: summaryTitle, points, template }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.imageBase64) throw new Error(data.error || 'まとめ画像の生成に失敗しました');
      const saved = await saveImageToGallery({
        imageBase64: data.imageBase64,
        prompt: `noteまとめ画像（プログラム描画・${SUMMARY_IMAGE_TEMPLATES[template].label}）`,
        settings: { model: 'og-render', size: `${data.width}x${data.height}` },
        title: summaryTitle,
      });
      onChange({
        ...state,
        summaryImage: {
          url: saved.blob_url,
          template,
          sourceUpdatedAt: state.summary?.updatedAt ?? nowIso(),
          updatedAt: nowIso(),
        },
      });
      flash('🧾 まとめ画像を生成しました（ギャラリーにも保存済み）');
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusySummaryImage(false);
    }
  };

  // ── 配置提案（観点10原則の応用・提案のみ＝調整/削除可） ──
  const proposePlacements = async () => {
    if (!content.trim()) return;
    const hasGenerated = state.placements.some((p) => p.url);
    if (hasGenerated && !confirm('提案し直すと、生成済みの挿絵との対応が置き換わります。よろしいですか？（画像自体はギャラリーに残ります）')) {
      return;
    }
    setBusyPlacement(true);
    try {
      const res = await fetch('/api/note-enhance/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.placements)) throw new Error(data.error || '配置の提案に失敗しました');
      const placements: NotePlacementImage[] = data.placements.map((p: Omit<NotePlacementImage, 'id'>) => ({
        ...p,
        id: newPlacementId(),
      }));
      onChange({ ...state, placements, placementRanAt: data.ranAt || nowIso() });
      flash(`✨ ${placements.length}件の配置を提案しました（位置は調整・削除できます）`);
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyPlacement(false);
    }
  };

  const patchPlacement = (id: string, patch: Partial<NotePlacementImage>) => {
    onChange({
      ...state,
      placements: state.placements.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };
  const removePlacement = (id: string) => {
    onChange({ ...state, placements: state.placements.filter((p) => p.id !== id) });
  };
  const movePlacement = (p: NotePlacementImage, dir: -1 | 1) => {
    const next = Math.min(Math.max(p.afterBlock + dir, 0), Math.max(blocks.length - 1, 0));
    patchPlacement(p.id, { afterBlock: next });
  };
  const addPlacement = () => {
    onChange({
      ...state,
      placements: [
        ...state.placements,
        { id: newPlacementId(), slot: 'rest', afterBlock: 0, purpose: '', principle: '認知負荷の軽減', prompt: '' },
      ],
    });
  };

  // ── 図表（228a・記事図表の主力。プログラム描画のみ） ──
  const proposeFigures = async () => {
    if (!content.trim()) return;
    const hasRendered = figures.some((f) => f.url);
    if (hasRendered && !confirm('提案し直すと、生成済みの図表との対応が置き換わります。よろしいですか？（画像自体はギャラリーに残ります）')) {
      return;
    }
    setBusyFigures(true);
    try {
      const res = await fetch('/api/note-enhance/figures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.figures)) throw new Error(data.error || '図表の提案に失敗しました');
      if (data.figures.length === 0) {
        flash('💡 図表化に向く構造は見つかりませんでした（＋図表を追加で手動作成できます）');
        return;
      }
      const next: NoteFigure[] = data.figures.map((f: Omit<NoteFigure, 'id'>) => ({
        ...f,
        id: newPlacementId(),
        dataUpdatedAt: nowIso(),
      }));
      onChange({ ...state, figures: next, figuresRanAt: data.ranAt || nowIso() });
      flash(`📊 ${next.length}件の図表を提案しました（文言は本文由来・編集できます）`);
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyFigures(false);
    }
  };

  // データ編集（title/groups/template）は dataUpdatedAt を進める＝生成済み画像の古さ検知
  const patchFigureData = (id: string, patch: Partial<NoteFigure>) => {
    onChange({
      ...state,
      figures: figures.map((f) => (f.id === id ? { ...f, ...patch, dataUpdatedAt: nowIso() } : f)),
    });
  };
  // 位置・生成結果の更新はデータ編集扱いにしない
  const patchFigureMeta = (id: string, patch: Partial<NoteFigure>) => {
    onChange({ ...state, figures: figures.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  };
  const removeFigure = (id: string) => {
    onChange({ ...state, figures: figures.filter((f) => f.id !== id) });
  };
  const moveFigure = (f: NoteFigure, dir: -1 | 1) => {
    const next = Math.min(Math.max(f.afterBlock + dir, 0), Math.max(blocks.length - 1, 0));
    patchFigureMeta(f.id, { afterBlock: next });
  };
  const addFigure = () => {
    onChange({
      ...state,
      figures: [
        ...figures,
        {
          id: newPlacementId(),
          template: 'steps',
          title: '',
          groups: [{ points: [''] }],
          afterBlock: 0,
          dataUpdatedAt: nowIso(),
        },
      ],
    });
  };

  const renderFigure = async (f: NoteFigure) => {
    const groups = f.groups
      .map((g) => ({ heading: g.heading?.trim() || undefined, points: g.points.map((p) => p.trim()).filter(Boolean) }))
      .filter((g) => g.points.length > 0);
    if (!f.title.trim() || groups.length === 0) {
      flash('⚠️ 図表の見出しとデータ（1行以上）を入力してください');
      return;
    }
    setBusyFigureId(f.id);
    try {
      const res = await fetch('/api/note-enhance/summary-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title, groups, template: f.template }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.imageBase64) throw new Error(data.error || '図表の描画に失敗しました');
      const saved = await saveImageToGallery({
        imageBase64: data.imageBase64,
        prompt: `note図表（プログラム描画・${FIGURE_TEMPLATES[f.template].label}）`,
        settings: { model: 'og-render', size: `${data.width}x${data.height}` },
        title: `note図表: ${f.title.slice(0, 40)}`,
      });
      patchFigureMeta(f.id, { url: saved.blob_url, renderedAt: f.dataUpdatedAt ?? nowIso() });
      flash('📊 図表を生成しました（ギャラリーにも保存済み）');
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyFigureId(null);
    }
  };

  // ── 挿絵の生成（226エンジン枠組み→gallery保存） ──
  const generatePlacementImage = async (p: NotePlacementImage) => {
    if (p.slot === 'cta') return;
    if (!p.prompt.trim()) {
      flash('⚠️ 画像プロンプトを入力してください');
      return;
    }
    setBusyImageId(p.id);
    try {
      const res = await fetch('/api/note-enhance/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p.prompt, engine, styleKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.imageBase64) throw new Error(data.error || '画像の生成に失敗しました');
      const saved = await saveImageToGallery({
        imageBase64: data.imageBase64,
        prompt: p.prompt,
        settings: { model: engine, size: data.sizeLabel },
        title: `note挿絵（${NOTE_PLACEMENT_SLOTS[p.slot].label}）: ${(title || '無題').slice(0, 40)}`,
      });
      patchPlacement(p.id, { url: saved.blob_url, engine, styleKey, updatedAt: nowIso() });
      flash('🎨 挿絵を生成しました（ギャラリーにも保存済み）');
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyImageId(null);
    }
  };

  // ── note貼り付けキット ──────────────────────────────────
  // 画像が用意できているものだけキット対象:
  // 配置（挿絵=url あり・cta=まとめ画像あり）＋図表（url あり）を統合して挿入順に連番
  const kitImages = useMemo<NotePasteImage[]>(() => {
    const fromPlacements = state.placements
      .map((p): NotePasteImage | null => {
        const url = p.slot === 'cta' ? state.summaryImage?.url : p.url;
        if (!url) return null;
        return {
          afterBlock: p.afterBlock,
          kind: p.slot,
          label: p.slot === 'cta' ? 'まとめ画像' : NOTE_PLACEMENT_SLOTS[p.slot].label,
          url,
        };
      })
      .filter((x): x is NotePasteImage => x !== null);
    const fromFigures = figures
      .filter((f) => f.url)
      .map((f): NotePasteImage => ({
        afterBlock: f.afterBlock,
        kind: f.template,
        label: FIGURE_TEMPLATES[f.template].label,
        url: f.url!,
      }));
    return orderedByBlock([...fromPlacements, ...fromFigures]);
  }, [state.placements, state.summaryImage, figures]);
  const pendingCount = state.placements.length + figures.length - kitImages.length;
  const compatOpts: NoteCompatOptions = { boldMode, tableMode };

  const copyPasteText = async () => {
    const text = buildNotePasteText(content, kitImages, compatOpts);
    const ok = await copyToClipboard(text);
    flash(ok ? '📋 note互換テキストをコピーしました（マーカー位置に画像をドラッグしてください）' : '⚠️ コピーに失敗しました');
  };

  const downloadAllImages = async () => {
    if (kitImages.length === 0) {
      flash('⚠️ 生成済みの画像がありません');
      return;
    }
    setBusyKit(true);
    try {
      let ok = 0;
      for (const [idx, img] of kitImages.entries()) {
        const success = await downloadImageFile(img.url, noteImageFileName(idx + 1, img.kind));
        if (success) ok++;
        // ブラウザの連続DL抑止を避けるため間隔を空ける
        await new Promise((r) => setTimeout(r, 400));
      }
      flash(`🖼 ${ok}/${kitImages.length}枚をダウンロードしました（挿入順の連番ファイル名）`);
    } finally {
      setBusyKit(false);
    }
  };

  const richCopy = async () => {
    const byBlock = new Map<number, string[]>();
    for (const img of kitImages) {
      const at = Math.min(Math.max(img.afterBlock, 0), Math.max(blocks.length - 1, 0));
      byBlock.set(at, [...(byBlock.get(at) ?? []), img.url]);
    }
    const html = buildNoteHtml(content, byBlock);
    const plain = toNoteCompatible(content, compatOpts);
    const ok = await copyRichText(html, plain);
    flash(
      ok
        ? '🧪 リッチテキストをコピーしました。noteに貼り付けて画像・見出しが残るか確認してください（実験機能）'
        : '⚠️ この環境ではリッチコピーを使えません（互換テキスト＋画像DLをご利用ください）',
    );
  };

  const summary = state.summary;
  const stale =
    !!state.summaryImage && !!summary && state.summaryImage.sourceUpdatedAt !== summary.updatedAt;

  return (
    <div style={{ marginTop: 10 }}>
      {/* ── 📝 まとめ ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          📝 記事のまとめ（要点箇条書き）
          <button type="button" onClick={generateSummary} disabled={busySummary} style={smallBtn()}>
            {busySummary ? '🔄 生成中...' : summary ? '🪄 再生成' : '🪄 まとめを生成'}
          </button>
        </div>
        {!summary && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            本文から要点3〜5点を生成します（本文にない事実は加えません）。生成後は自由に編集できます。
          </div>
        )}
        {summary && (
          <div>
            {summary.points.map((pt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input
                  value={pt}
                  onChange={(e) => updatePoint(i, e.target.value)}
                  style={{ flex: 1, fontSize: 13, padding: '6px 10px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6 }}
                />
                <button type="button" onClick={() => movePoint(i, -1)} disabled={i === 0} style={smallBtn({ padding: '6px 8px' })}>↑</button>
                <button type="button" onClick={() => movePoint(i, 1)} disabled={i === summary.points.length - 1} style={smallBtn({ padding: '6px 8px' })}>↓</button>
                <button type="button" onClick={() => removePoint(i)} style={smallBtn({ padding: '6px 8px', color: '#ef4444' })}>🗑</button>
              </div>
            ))}
            <button type="button" onClick={addPoint} style={smallBtn()}>＋ 要点を追加</button>
          </div>
        )}
      </div>

      {/* ── 🧾 まとめ画像 ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          🧾 まとめ画像（文字はプログラム描画＝100%正確）
          {SUMMARY_IMAGE_TEMPLATE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTemplate(k)}
              style={smallBtn(
                template === k
                  ? { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-primary)', fontWeight: 700 }
                  : undefined,
              )}
            >
              {SUMMARY_IMAGE_TEMPLATES[k].emoji} {SUMMARY_IMAGE_TEMPLATES[k].label}
            </button>
          ))}
          <button
            type="button"
            onClick={generateSummaryImage}
            disabled={busySummaryImage || !summary}
            style={smallBtn(stale ? { border: '1px solid #f59e0b', color: '#f59e0b', fontWeight: 700 } : undefined)}
            title={!summary ? '先にまとめを生成してください' : ''}
          >
            {busySummaryImage ? '🔄 生成中...' : state.summaryImage ? '🔄 再生成' : '🧾 まとめ画像を生成'}
          </button>
        </div>
        {stale && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
            ⚠️ まとめが更新されています。🔄再生成で画像に反映してください
          </div>
        )}
        {state.summaryImage && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.summaryImage.url} alt="まとめ画像" style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            <button type="button" onClick={() => onChange({ ...state, summaryImage: undefined })} style={smallBtn({ color: '#ef4444' })}>
              ✕ 不使用（画像はギャラリーに残ります）
            </button>
          </div>
        )}
        {!state.summaryImage && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            編集後のまとめをそのまま描画します（AIによる文言の創作なし）。CTA直前などに置くと行動が明確になります。
          </div>
        )}
      </div>

      {/* ── 📊 図表（228a・記事図表の主力＝プログラム描画） ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          📊 図表（手順・比較・Q&A・前後の変化。文字はプログラム描画＝100%正確）
          <button type="button" onClick={proposeFigures} disabled={busyFigures} style={smallBtn()}>
            {busyFigures ? '🔄 抽出中...' : figures.length > 0 ? '✨ 図表を提案し直す' : '✨ 本文から図表を提案'}
          </button>
          <button type="button" onClick={addFigure} style={smallBtn()}>＋ 図表を追加</button>
        </div>
        {figures.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            本文にある手順・比較・Q&A・変化の記述から図表データを抽出します（本文にない内容は作りません）。データを編集してから描画できます。
          </div>
        )}
        {orderedByBlock(figures).map((f) => {
          const excerpt = (blocks[Math.min(f.afterBlock, Math.max(blocks.length - 1, 0))] ?? '').slice(0, 40);
          const figStale = !!f.url && !!f.dataUpdatedAt && f.dataUpdatedAt !== f.renderedAt;
          return (
            <div key={f.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {FIGURE_TEMPLATE_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => patchFigureData(f.id, { template: k as FigureTemplateKey })}
                    title={FIGURE_TEMPLATES[k].hint}
                    style={smallBtn(
                      f.template === k
                        ? { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-primary)', fontWeight: 700, padding: '4px 8px' }
                        : { padding: '4px 8px' },
                    )}
                  >
                    {FIGURE_TEMPLATES[k].emoji} {FIGURE_TEMPLATES[k].label}
                  </button>
                ))}
                <button type="button" onClick={() => removeFigure(f.id)} style={smallBtn({ padding: '4px 8px', color: '#ef4444', marginLeft: 'auto' })}>✕ 削除</button>
              </div>
              {f.purpose && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  💡 {f.purpose}{f.principle ? `（原則: ${f.principle}）` : ''}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                位置: 段落{f.afterBlock + 1}の後「{excerpt}…」
                <button type="button" onClick={() => moveFigure(f, -1)} disabled={f.afterBlock <= 0} style={smallBtn({ padding: '4px 8px' })} title="1段落前へ">↑</button>
                <button type="button" onClick={() => moveFigure(f, 1)} disabled={f.afterBlock >= blocks.length - 1} style={smallBtn({ padding: '4px 8px' })} title="1段落後へ">↓</button>
              </div>
              <input
                value={f.title}
                onChange={(e) => patchFigureData(f.id, { title: e.target.value })}
                placeholder="図表の見出し"
                style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '6px 10px', marginBottom: 6, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6 }}
              />
              {f.groups.map((g, gi) => (
                <div key={gi} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {f.template !== 'steps' && (
                      <input
                        value={g.heading ?? ''}
                        onChange={(e) => {
                          const groups = f.groups.map((x, xi) => (xi === gi ? { ...x, heading: e.target.value } : x));
                          patchFigureData(f.id, { groups });
                        }}
                        placeholder={f.template === 'qa' ? '質問' : f.template === 'beforeafter' ? (gi === 0 ? '変化前ラベル' : '変化後ラベル') : '列名'}
                        style={{ width: '100%', fontSize: 12, padding: '5px 8px', marginBottom: 4, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6 }}
                      />
                    )}
                    <textarea
                      value={g.points.join('\n')}
                      onChange={(e) => {
                        const groups = f.groups.map((x, xi) => (xi === gi ? { ...x, points: e.target.value.split('\n') } : x));
                        patchFigureData(f.id, { groups });
                      }}
                      placeholder={'1行=1項目'}
                      style={{ width: '100%', minHeight: 44, fontSize: 12, lineHeight: 1.6, padding: 8, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                  {f.template !== 'steps' && f.template !== 'beforeafter' && f.groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => patchFigureData(f.id, { groups: f.groups.filter((_, xi) => xi !== gi) })}
                      style={smallBtn({ padding: '4px 8px', color: '#ef4444' })}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {(f.template === 'compare' || f.template === 'qa') && f.groups.length < (f.template === 'compare' ? 3 : 4) && (
                  <button type="button" onClick={() => patchFigureData(f.id, { groups: [...f.groups, { points: [''] }] })} style={smallBtn()}>
                    ＋ {f.template === 'qa' ? '質問' : '列'}を追加
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => renderFigure(f)}
                  disabled={busyFigureId !== null}
                  style={smallBtn(figStale ? { border: '1px solid #f59e0b', color: '#f59e0b', fontWeight: 700 } : undefined)}
                >
                  {busyFigureId === f.id ? '🔄 描画中...' : f.url ? '🔄 再描画' : '📊 図表を描画'}
                </button>
                {figStale && <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠️ データが更新されています</span>}
                {f.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={f.url} alt="図表" style={{ maxWidth: 220, borderRadius: 6, border: '1px solid var(--border)' }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 🖼 AIイメージ画像と配置 ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          🖼 AIイメージ画像（既定=冒頭1枚。図表が主力）
          <button type="button" onClick={proposePlacements} disabled={busyPlacement} style={smallBtn()}>
            {busyPlacement ? '🔄 提案中...' : state.placements.length > 0 ? '✨ 配置を提案し直す' : '✨ 配置を提案'}
          </button>
          <button type="button" onClick={addPlacement} style={smallBtn()}>＋ 挿絵を追加</button>
        </div>

        {state.placements.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            エンジン:
            <select value={engine} onChange={(e) => setEngine(e.target.value as ImageModelKey)} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
              {IMAGE_MODELS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}（{m.approxCost}）</option>
              ))}
            </select>
            画風:
            <select value={styleKey} onChange={(e) => setStyleKey(e.target.value as KindleImageStyleKey)} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
              {KINDLE_IMAGE_STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{KINDLE_IMAGE_STYLES[k].emoji} {KINDLE_IMAGE_STYLES[k].label}</option>
              ))}
            </select>
            <span>文字なしガードはサーバ側で必ず適用されます</span>
          </div>
        )}

        {state.placements.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            自動提案は冒頭フック直後のAIイメージ1枚＋CTA直前のまとめ画像のみ（AI画像は冒頭1枚が既定）。中盤の裏づけ・休憩は上の📊図表をご利用ください。＋挿絵を追加で手動追加もできます。
          </div>
        )}

        {orderedPlacements(state.placements).map((p) => {
          const meta = NOTE_PLACEMENT_SLOTS[p.slot];
          const excerpt = (blocks[Math.min(p.afterBlock, Math.max(blocks.length - 1, 0))] ?? '').slice(0, 48);
          return (
            <div key={p.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{meta.emoji} {meta.label}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--text-secondary)' }} title={meta.role}>
                  原則: {p.principle || meta.principles}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  位置: 段落{p.afterBlock + 1}の後「{excerpt}…」
                </span>
                <button type="button" onClick={() => movePlacement(p, -1)} disabled={p.afterBlock <= 0} style={smallBtn({ padding: '4px 8px' })} title="1段落前へ">↑</button>
                <button type="button" onClick={() => movePlacement(p, 1)} disabled={p.afterBlock >= blocks.length - 1} style={smallBtn({ padding: '4px 8px' })} title="1段落後へ">↓</button>
                <button type="button" onClick={() => removePlacement(p.id)} style={smallBtn({ padding: '4px 8px', color: '#ef4444', marginLeft: 'auto' })}>✕ 削除</button>
              </div>
              {p.purpose && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>💡 {p.purpose}</div>
              )}
              {p.slot === 'cta' ? (
                <div style={{ fontSize: 12, color: state.summaryImage ? '#10b981' : '#f59e0b' }}>
                  {state.summaryImage
                    ? '🧾 この位置に上のまとめ画像を挿入します'
                    : '⚠️ まとめ画像が未生成です（上の🧾セクションで生成してください）'}
                </div>
              ) : (
                <div>
                  <textarea
                    value={p.prompt}
                    onChange={(e) => patchPlacement(p.id, { prompt: e.target.value })}
                    placeholder="画像プロンプト（編集できます）"
                    style={{ width: '100%', minHeight: 48, fontSize: 12, lineHeight: 1.6, padding: 8, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', resize: 'vertical', marginBottom: 6 }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => generatePlacementImage(p)} disabled={busyImageId !== null} style={smallBtn()}>
                      {busyImageId === p.id ? '🔄 生成中...' : p.url ? '🔄 再生成' : '🎨 生成'}
                    </button>
                    {p.url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.url} alt="挿絵" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 📤 note貼り付けキット ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          📤 note貼り付けキット（コピペで投稿完了へ）
          <button type="button" onClick={() => setShowGuide((v) => !v)} style={smallBtn()}>
            {showGuide ? '▲ 手順を閉じる' : '❓ 手順'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={boldMode === 'strip'} onChange={(e) => setBoldMode(e.target.checked ? 'strip' : 'keep')} />
            太字記号 ** を除去（noteでは記号が露出するため推奨）
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={tableMode === 'bullets'} onChange={(e) => setTableMode(e.target.checked ? 'bullets' : 'keep')} />
            表を箇条書きに変換（noteに表機能がないため推奨）
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={copyPasteText} style={smallBtn({ fontWeight: 700 })}>
            📋 note互換テキストをコピー{kitImages.length > 0 ? '（画像マーカー入り）' : ''}
          </button>
          <button type="button" onClick={downloadAllImages} disabled={busyKit || kitImages.length === 0} style={smallBtn()}>
            {busyKit ? '🔄 DL中...' : `🖼 画像を一括ダウンロード（${kitImages.length}枚・連番）`}
          </button>
          <button type="button" onClick={richCopy} disabled={kitImages.length === 0 && !content.trim()} style={smallBtn()} title="text/htmlで画像込みコピー。noteが受け付けるかの実地検証用">
            🧪 リッチコピー（実験）
          </button>
        </div>
        {pendingCount > 0 && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>
            ⚠️ 画像未生成の配置・図表 {pendingCount}件はキットに含まれません（🎨生成/📊描画すると含まれます）
          </div>
        )}
        {showGuide && (
          <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.9, margin: '10px 0 0', paddingLeft: 20 }}>
            <li>「📋 note互換テキストをコピー」→ noteの新規記事に貼り付け（見出し・リストは自動変換されます）</li>
            <li>「🖼 画像を一括ダウンロード」→ 01_hook.png などの連番ファイルが保存されます</li>
            <li>本文中の「――― 画像01（…）をここに挿入 ―――」の位置に、同じ番号の画像をドラッグ＆ドロップ</li>
            <li>マーカー行を削除 → タイトルを入れて<strong>下書き保存</strong>（そのまま公開しない）</li>
            <li>🧪リッチコピーで画像ごと貼れた場合は 2〜4 は不要です（実験機能・結果をご確認ください）</li>
          </ol>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, zIndex: 1002, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxWidth: 'calc(100vw - 40px)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
