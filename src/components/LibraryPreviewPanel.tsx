'use client';

import { useEffect } from 'react';

interface Props {
  item: {
    id: string;
    title: string;
    content: string;
    group_name: string;
    created_at: string;
    tags?: string;
  } | null;
  onClose: () => void;
}

export function LibraryPreviewPanel({ item, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!item) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.2)' }} onClick={onClose} />

      {/* スライドインパネル */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: '100%', maxWidth: 560, zIndex: 50,
        background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
      }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.group_name || '未分類'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</span>
              {item.tags && item.tags.split(',').filter(Boolean).slice(0, 3).map((tag: string) => (
                <span key={tag.trim()} style={{ fontSize: 10, padding: '0 6px', borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  #{tag.trim()}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
            <button onClick={() => navigator.clipboard.writeText(item.content)} style={{
              padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            }}>📋 コピー</button>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.9, wordBreak: 'break-word' }}>
            {item.content}
          </div>
        </div>

        {/* フッター */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <button onClick={() => {
            localStorage.setItem('lumina_research_context', item.content.slice(0, 2000));
            window.location.href = '/dashboard/write';
          }} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
          }}>✍️ 文章作成に使う</button>
          <button onClick={() => {
            const blob = new Blob([item.content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${item.title}.txt`; a.click();
            URL.revokeObjectURL(url);
          }} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
          }}>💾 TXT保存</button>
        </div>
      </div>
    </>
  );
}
