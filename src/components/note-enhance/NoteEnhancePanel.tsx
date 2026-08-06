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
  type SummaryImageTemplateKey,
} from '@/lib/summary-image-templates';
import {
  NOTE_PLACEMENT_SLOTS,
  noteImageFileName,
  recommendedImageCount,
  splitMarkdownBlocks,
  type NoteEnhanceState,
  type NotePlacementImage,
} from '@/lib/note-enhance';
import {
  buildNoteHtml,
  buildNotePasteText,
  copyRichText,
  downloadImageFile,
  orderedPlacements,
  toNoteCompatible,
  type NoteCompatOptions,
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
  const [busyKit, setBusyKit] = useState(false);
  const [toast, setToast] = useState('');
  const [engine, setEngine] = useState<ImageModelKey>('gpt-image-2');
  const [styleKey, setStyleKey] = useState<KindleImageStyleKey>(DEFAULT_KINDLE_IMAGE_STYLE);
  const [template, setTemplate] = useState<SummaryImageTemplateKey>(state.summaryImage?.template ?? 'card');
  const [boldMode, setBoldMode] = useState<NoteCompatOptions['boldMode']>('strip');
  const [tableMode, setTableMode] = useState<NoteCompatOptions['tableMode']>('bullets');
  const [showGuide, setShowGuide] = useState(false);

  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);
  const recommended = recommendedImageCount(content.length);

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
  // 画像が用意できている配置のみキット対象（挿絵=url あり・cta=まとめ画像あり）
  const activePlacements = useMemo(
    () =>
      orderedPlacements(
        state.placements.filter((p) => (p.slot === 'cta' ? !!state.summaryImage : !!p.url)),
      ),
    [state.placements, state.summaryImage],
  );
  const pendingCount = state.placements.length - activePlacements.length;
  const compatOpts: NoteCompatOptions = { boldMode, tableMode };

  const copyPasteText = async () => {
    const text = buildNotePasteText(content, activePlacements, compatOpts);
    const ok = await copyToClipboard(text);
    flash(ok ? '📋 note互換テキストをコピーしました（マーカー位置に画像をドラッグしてください）' : '⚠️ コピーに失敗しました');
  };

  const downloadAllImages = async () => {
    if (activePlacements.length === 0) {
      flash('⚠️ 生成済みの画像がありません');
      return;
    }
    setBusyKit(true);
    try {
      let ok = 0;
      for (const [idx, p] of activePlacements.entries()) {
        const url = p.slot === 'cta' ? state.summaryImage?.url : p.url;
        if (!url) continue;
        const success = await downloadImageFile(url, noteImageFileName(idx + 1, p.slot));
        if (success) ok++;
        // ブラウザの連続DL抑止を避けるため間隔を空ける
        await new Promise((r) => setTimeout(r, 400));
      }
      flash(`🖼 ${ok}/${activePlacements.length}枚をダウンロードしました（挿入順の連番ファイル名）`);
    } finally {
      setBusyKit(false);
    }
  };

  const richCopy = async () => {
    const byBlock = new Map<number, string[]>();
    for (const p of activePlacements) {
      const url = p.slot === 'cta' ? state.summaryImage?.url : p.url;
      if (!url) continue;
      const at = Math.min(Math.max(p.afterBlock, 0), Math.max(blocks.length - 1, 0));
      byBlock.set(at, [...(byBlock.get(at) ?? []), url]);
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

      {/* ── 🖼 挿絵と配置 ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          🖼 挿絵と配置（マーケ・心理学の観点で自動提案）
          <button type="button" onClick={proposePlacements} disabled={busyPlacement} style={smallBtn()}>
            {busyPlacement ? '🔄 提案中...' : state.placements.length > 0 ? '✨ 配置を提案し直す' : '✨ 配置を提案'}
          </button>
          <button type="button" onClick={addPlacement} style={smallBtn()}>＋ 挿絵を追加</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            本文{content.length.toLocaleString()}字 → 挿絵の目安 {recommended}枚（＋まとめ画像）
          </span>
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
            冒頭フック直後（共感）・主張部（裏づけ）・長文の切れ目（休憩）・CTA直前（まとめ画像）の4スロットで提案します。提案後に位置の調整・削除ができます。
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
            📋 note互換テキストをコピー{activePlacements.length > 0 ? '（画像マーカー入り）' : ''}
          </button>
          <button type="button" onClick={downloadAllImages} disabled={busyKit || activePlacements.length === 0} style={smallBtn()}>
            {busyKit ? '🔄 DL中...' : `🖼 画像を一括ダウンロード（${activePlacements.length}枚・連番）`}
          </button>
          <button type="button" onClick={richCopy} disabled={activePlacements.length === 0 && !content.trim()} style={smallBtn()} title="text/htmlで画像込みコピー。noteが受け付けるかの実地検証用">
            🧪 リッチコピー（実験）
          </button>
        </div>
        {pendingCount > 0 && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>
            ⚠️ 画像未生成の配置 {pendingCount}件はキットに含まれません（🎨生成すると含まれます）
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
