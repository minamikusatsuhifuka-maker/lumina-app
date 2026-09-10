'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import SelectionBar from '@/components/SelectionBar';
import ModalSheet from '@/components/ModalSheet';
import {
  GALLERY_DOWNLOAD_INTERVAL_MS,
  GALLERY_FILTER_ALL,
  GALLERY_KIND_LABEL,
  GALLERY_SELECT_MAX,
  galleryAspectOf,
  galleryBulkResult,
  galleryDeleteConfirm,
  galleryFilterOptions,
  galleryKindOf,
  galleryMatches,
  galleryOriginalIdOf,
  gallerySelectOver,
  type GalleryFilter,
  type GalleryKind,
} from '@/lib/gallery-bulk';

// 画像ギャラリー（165）。画像本体は Vercel Blob にあり、ここでは blob_url を直接参照する。
// 一覧APIはメタ＋URLのみを返す（base64をDOMやDBに流さない）。
// 329: 複数選択と一括処理（318 の SelectionBar）／カードの圧縮（高さを半分）／サムネイルは contain（切らない）／拡大は ModalSheet（326）
interface GalleryImage {
  id: string;
  blob_url: string;
  prompt: string | null;
  settings: { size?: string; quality?: string; model?: string; visual?: { kind?: string; aspect?: string; originalId?: string } } | null;
  title: string | null;
  source: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

const PAGE_SIZE = 30;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function GalleryPage() {
  const { showToast } = useToast();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState<GalleryImage | null>(null);
  // 329: 選択（チェックは常時表示＝318 と同じ・R-106 なので「全選択」は置かない）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const bulkRef = useRef(false); // R-87
  const [filter, setFilter] = useState<GalleryFilter>(GALLERY_FILTER_ALL);

  const load = useCallback(async (offset: number) => {
    const res = await fetch(`/api/gallery?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) throw new Error('ギャラリーの取得に失敗しました');
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await load(0);
        if (cancelled) return;
        setImages(Array.isArray(data.images) ? data.images : []);
        setTotal(Number(data.total_count) || 0);
      } catch {
        // 取得失敗時は空表示（画面自体は壊さない）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = async () => {
    try {
      const data = await load(images.length);
      setImages((prev) => [...prev, ...(Array.isArray(data.images) ? data.images : [])]);
      setTotal(Number(data.total_count) || 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '取得に失敗しました', 'error');
    }
  };

  // Blob URL からPNGダウンロード（本体はブラウザが直接取りに行く）
  const downloadPng = async (img: GalleryImage): Promise<boolean> => {
    try {
      const res = await fetch(img.blob_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(img.title || 'image').slice(0, 40)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
      return false;
    }
  };

  /** 削除は Blob と DB の両方（サーバ側で実施）。選んだ行だけを消す（紐づく元画像は消さない＝既存の挙動） */
  const deleteOne = async (img: GalleryImage): Promise<boolean> => {
    const res = await fetch(`/api/gallery/${img.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '削除に失敗しました');
    }
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    setTotal((t) => Math.max(0, t - 1));
    setSelected((prev) => { const n = new Set(prev); n.delete(img.id); return n; });
    if (zoomed?.id === img.id) setZoomed(null);
    return true;
  };

  const handleDelete = async (img: GalleryImage) => {
    if (!confirm('この画像をギャラリーから削除しますか？（画像本体も削除されます）')) return;
    try {
      await deleteOne(img);
      showToast('削除しました', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  // ── 329: 一括処理（1件ずつ独立・R-39／件数は戻り値で数える・R-126／二重発火は ref・R-87） ──
  const visible = useMemo(() => images.filter((img) => galleryMatches(img, filter)), [images, filter]);
  const options = useMemo(() => galleryFilterOptions(images), [images]);
  const selectedImages = useMemo(() => images.filter((i) => selected.has(i.id)), [images, selected]);
  const overReason = gallerySelectOver(selected.size);
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const bulkDownload = async () => {
    if (bulkRef.current || overReason) return;
    bulkRef.current = true;
    setBusy('download');
    let ok = 0;
    try {
      for (const [i, img] of selectedImages.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, GALLERY_DOWNLOAD_INTERVAL_MS));
        if (await downloadPng(img)) ok += 1;
      }
      showToast(galleryBulkResult('ダウンロード', ok, selectedImages.length - ok), ok === selectedImages.length ? 'success' : 'warning');
    } finally {
      bulkRef.current = false;
      setBusy(null);
    }
  };

  const bulkDelete = async () => {
    if (bulkRef.current || overReason) return;
    bulkRef.current = true;
    setDeleteDialog(false);
    setBusy('delete');
    let ok = 0;
    let failed = 0;
    try {
      for (const img of selectedImages) {
        try {
          await deleteOne(img);
          ok += 1;
        } catch {
          failed += 1; // 1件の失敗で他を巻き添えにしない（R-39）
        }
      }
      showToast(galleryBulkResult('削除', ok, failed), failed === 0 ? 'success' : 'warning');
    } finally {
      bulkRef.current = false;
      setBusy(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const iconBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 12,
    cursor: 'pointer',
  };
  const btnStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' };

  const metaLine = (img: GalleryImage) =>
    [formatDate(img.created_at), img.settings?.model, img.width && img.height ? `${img.width}×${img.height}` : '', formatBytes(img.bytes)].filter(Boolean).join(' · ');

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🖼️ 画像ギャラリー</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        画像生成で作った画像のストック。院内掲示・SNS用に貯めて、いつでも再取得できます。
        {total > 0 && `（${total}件）`}
      </p>

      {/* 329 §2-4: 絞り込み（種類・モデル・比）。並びは新しい順のまま */}
      {images.length > 0 && (
        <div data-gallery-filters style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            種類
            <select data-gallery-filter-kind value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value as GalleryKind | 'all' }))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
              <option value="all">すべて</option>
              {options.kinds.map((k) => <option key={k} value={k}>{GALLERY_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            モデル
            <select data-gallery-filter-model value={filter.model} onChange={(e) => setFilter((f) => ({ ...f, model: e.target.value }))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
              <option value="all">すべて</option>
              {options.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            比
            <select data-gallery-filter-aspect value={filter.aspect} onChange={(e) => setFilter((f) => ({ ...f, aspect: e.target.value }))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
              <option value="all">すべて</option>
              {options.aspects.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <span data-gallery-visible={visible.length} style={{ color: 'var(--text-muted)' }}>表示 {visible.length} / {images.length} 件</span>
        </div>
      )}

      {/* 329 §2-1: 選択バーは 318 の共通部品（📚🗂🧠と同じ） */}
      <SelectionBar
        count={selected.size}
        attrs={{ 'data-gallery-selection-bar': '' }}
        note={overReason ?? undefined}
        actions={[
          {
            key: 'download',
            label: `⬇ ${selected.size}件DL`,
            title: '選んだ画像を1枚ずつ続けてダウンロードします（ZIPにはしません）',
            attrs: { 'data-gallery-bulk-download': '' },
            disabled: !!overReason || busy !== null,
            reason: overReason,
            busy: busy === 'download',
            busyLabel: '⏳ 取得中…',
            onClick: () => void bulkDownload(),
          },
        ]}
        danger={{
          key: 'delete',
          label: `🗑 ${selected.size}件削除`,
          title: '選んだ画像をギャラリーと画像本体から削除します（確認は1回）',
          attrs: { 'data-gallery-bulk-delete': '' },
          disabled: !!overReason || busy !== null,
          reason: overReason,
          busy: busy === 'delete',
          busyLabel: '⏳ 削除中…',
          tone: 'danger',
          onClick: () => setDeleteDialog(true),
        }}
        exitAttrs={{ 'data-gallery-selection-exit': '' }}
        onExit={() => setSelected(new Set())}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.9, border: '1px dashed var(--border)', borderRadius: 12 }}>
          まだ画像がありません。
          <br />
          <a href="/dashboard/image-gen" style={{ color: 'var(--accent)' }}>🎨 画像生成</a>
          {' で生成 →「🖼️ ギャラリーに保存」で貯まります。'}
        </div>
      ) : (
        <>
          {/* 329 §2-2: 圧縮したカード（サムネは 16:9 の枠・タイトル1行・メタ1行・アイコン3つ） */}
          <div data-gallery-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {visible.map((img) => {
              const on = selected.has(img.id);
              return (
                <div key={img.id} data-gallery-card={img.id} data-gallery-selected={on ? '1' : '0'} style={{ ...cardStyle, borderColor: on ? 'var(--border-accent)' : 'var(--border)' }}>
                  {/* 左上のチェック（常時表示・当たり判定は画像の外側・R-81） */}
                  <label data-gallery-check-wrap={img.id} style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'rgba(0,0,0,0.45)', cursor: 'pointer' }}>
                    <input type="checkbox" data-gallery-check={img.id} checked={on} onChange={(e) => toggleOne(img.id, e.target.checked)} aria-label="この画像を選ぶ" />
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-gallery-thumb={img.id}
                    src={img.blob_url}
                    alt={img.title || '生成画像'}
                    loading="lazy"
                    onClick={() => setZoomed(img)}
                    style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'contain', display: 'block', cursor: 'zoom-in', background: 'var(--bg-primary)' }}
                  />
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div data-gallery-title={img.id} title={img.prompt || img.title || ''} style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {img.title || img.prompt || '（無題）'}
                    </div>
                    <div data-gallery-meta={img.id} title={`${metaLine(img)}${galleryOriginalIdOf(img) ? ' ・元画像あり' : ''}`} style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {metaLine(img)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" data-gallery-zoom={img.id} onClick={() => setZoomed(img)} title="拡大して見る" style={iconBtn}>🔍</button>
                      <button type="button" data-gallery-download={img.id} onClick={() => void downloadPng(img)} title="PNG でダウンロード" style={iconBtn}>⬇</button>
                      <button type="button" data-gallery-delete={img.id} onClick={() => void handleDelete(img)} title="この画像を削除（画像本体も消えます）" style={{ ...iconBtn, color: '#e05a5a' }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {images.length < total && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button type="button" onClick={loadMore} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>
                もっと見る（{images.length} / {total}）
              </button>
            </div>
          )}
        </>
      )}

      {/* 329 §2-3: 拡大は ModalSheet（狭幅は全画面・Esc と ✕ で閉じる・背面スクロールロック） */}
      {zoomed && (
        <ModalSheet
          title={zoomed.title || '生成画像'}
          onClose={() => setZoomed(null)}
          maxWidth={900}
          backdropAttrs={{ 'data-gallery-zoom-dialog': '' }}
          closeAttrs={{ 'data-gallery-zoom-close': '' }}
          footer={
            <>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', minWidth: 0 }}>{metaLine(zoomed)}</span>
              <button type="button" data-gallery-zoom-download onClick={() => void downloadPng(zoomed)} style={btnStyle}>⬇ PNGダウンロード</button>
              <button type="button" onClick={() => setZoomed(null)} style={btnStyle}>閉じる</button>
            </>
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-gallery-zoom-img src={zoomed.blob_url} alt={zoomed.title || '生成画像'} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
          <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{zoomed.prompt || '（プロンプトなし）'}</p>
        </ModalSheet>
      )}

      {/* 329 §2-1: 一括削除の確認（1回・件数入り・R-56） */}
      {deleteDialog && (
        <ModalSheet
          title="🗑 選んだ画像を削除しますか？"
          onClose={() => setDeleteDialog(false)}
          maxWidth={520}
          backdropAttrs={{ 'data-gallery-delete-dialog': '' }}
          footer={
            <>
              <button type="button" data-gallery-delete-cancel onClick={() => setDeleteDialog(false)} style={btnStyle}>やめる</button>
              <button type="button" data-gallery-delete-confirm onClick={() => void bulkDelete()} style={{ ...btnStyle, background: '#dc2626', color: '#fff', border: '1px solid #dc2626', fontWeight: 700 }}>
                🗑 {selected.size}件を削除する
              </button>
            </>
          }
        >
          <div data-gallery-delete-count={selected.size} style={{ fontSize: 13, lineHeight: 1.8 }}>{galleryDeleteConfirm(selected.size)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            選んだ行だけを消します（完成画像に紐づく元画像は、その行も選んだときだけ消えます）。1件ずつ実行し、失敗した分は件数でお知らせします。
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-muted)', maxHeight: 160, overflowY: 'auto' }}>
            {selectedImages.slice(0, GALLERY_SELECT_MAX).map((i) => <li key={i.id}>{i.title || i.prompt || i.id}（{galleryKindOf(i) === 'image' ? 'イメージ' : 'コード描画'}・{galleryAspectOf(i)}）</li>)}
          </ul>
        </ModalSheet>
      )}
    </div>
  );
}
