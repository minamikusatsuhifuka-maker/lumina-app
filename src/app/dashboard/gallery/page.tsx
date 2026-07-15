'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

// 画像ギャラリー（165）。画像本体は Vercel Blob にあり、ここでは blob_url を直接参照する。
// 一覧APIはメタ＋URLのみを返す（base64をDOMやDBに流さない）。
interface GalleryImage {
  id: string;
  blob_url: string;
  prompt: string | null;
  settings: { size?: string; quality?: string; model?: string } | null;
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
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
  const downloadPng = async (img: GalleryImage) => {
    try {
      const res = await fetch(img.blob_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(img.title || 'image').slice(0, 40)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    }
  };

  // 削除は Blob と DB の両方（サーバ側で実施）
  const handleDelete = async (img: GalleryImage) => {
    if (!confirm('この画像をギャラリーから削除しますか？（画像本体も削除されます）')) return;
    try {
      const res = await fetch(`/api/gallery/${img.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '削除に失敗しました');
      }
      setImages((prev) => prev.filter((i) => i.id !== img.id));
      setTotal((t) => Math.max(0, t - 1));
      if (zoomed?.id === img.id) setZoomed(null);
      showToast('削除しました', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 11,
    cursor: 'pointer',
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🖼️ 画像ギャラリー
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
        画像生成で作った画像のストック。院内掲示・SNS用に貯めて、いつでも再取得できます。
        {total > 0 && `（${total}件）`}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      ) : images.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1.9,
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          まだ画像がありません。
          <br />
          <a href="/dashboard/image-gen" style={{ color: 'var(--accent)' }}>
            🎨 画像生成
          </a>
          {' で生成 →「🖼️ ギャラリーに保存」で貯まります。'}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {images.map((img) => (
              <div key={img.id} style={cardStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.blob_url}
                  alt={img.title || '生成画像'}
                  onClick={() => setZoomed(img)}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    objectFit: 'cover',
                    display: 'block',
                    cursor: 'zoom-in',
                    background: 'var(--bg-primary)',
                  }}
                />
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={img.prompt || ''}
                  >
                    {img.prompt || '（プロンプトなし）'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {formatDate(img.created_at)}
                    {img.settings?.model && ` ・ ${img.settings.model}`}
                    {img.settings?.size && ` ・ ${img.settings.size}`}
                    {img.settings?.quality && ` ・ ${img.settings.quality}`}
                    {img.bytes ? ` ・ ${formatBytes(img.bytes)}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setZoomed(img)} style={btnStyle}>
                      🔍 拡大
                    </button>
                    <button type="button" onClick={() => downloadPng(img)} style={btnStyle}>
                      ⬇ PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(img)}
                      style={{ ...btnStyle, color: '#e05a5a' }}
                    >
                      🗑 削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {images.length < total && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                type="button"
                onClick={loadMore}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                もっと見る（{images.length} / {total}）
              </button>
            </div>
          )}
        </>
      )}

      {/* 拡大表示 */}
      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 900,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'var(--bg-secondary)',
              borderRadius: 14,
              padding: 16,
              cursor: 'default',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomed.blob_url}
              alt={zoomed.title || '生成画像'}
              style={{ width: '100%', borderRadius: 10, display: 'block' }}
            />
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-primary)',
                lineHeight: 1.8,
                marginTop: 12,
                whiteSpace: 'pre-wrap',
              }}
            >
              {zoomed.prompt || '（プロンプトなし）'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {formatDate(zoomed.created_at)}
              {zoomed.settings?.model && ` ・ ${zoomed.settings.model}`}
              {zoomed.settings?.size && ` ・ ${zoomed.settings.size}`}
              {zoomed.settings?.quality && ` ・ ${zoomed.settings.quality}`}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => downloadPng(zoomed)} style={btnStyle}>
                ⬇ PNGダウンロード
              </button>
              <button type="button" onClick={() => setZoomed(null)} style={btnStyle}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
