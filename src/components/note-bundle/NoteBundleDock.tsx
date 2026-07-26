'use client';

// 180: note記事まとめ生成の「選択中バー＋モーダル」。
// タブコンテナの外（ページ直下）に1回だけマウントする。
// （/dashboard/saved は各パネルを display:none で切り替えるため、
//   パネル内に置くと非表示タブ側の固定バーごと消える。バーはタブの外が正しい位置）
// どのタブ・どのページからでも「📝 note記事にまとめる」を押せる。

import { useState } from 'react';
import { MAX_BUNDLE_SOURCES } from '@/lib/note-bundle';
import { useNoteBundleSelection } from './useNoteBundleSelection';
import NoteBundleModal from './NoteBundleModal';

export default function NoteBundleDock() {
  const { selectMode, selectedList, countBySource, clear } = useNoteBundleSelection();
  const [bundleOpen, setBundleOpen] = useState(false);

  if (!selectMode && !bundleOpen) return null;

  const ctxCount = countBySource('context');
  const anaCount = countBySource('analysis');

  return (
    <>
      {selectMode && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-accent)',
            borderRadius: 14,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap' as const,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            maxWidth: 'calc(100vw - 40px)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            ☑ {selectedList.length}件選択中（🧠{ctxCount}・🗂{anaCount} / 上限{MAX_BUNDLE_SOURCES}件）
          </span>
          <button
            type="button"
            onClick={() => setBundleOpen(true)}
            disabled={selectedList.length === 0}
            style={{
              padding: '9px 20px',
              background: selectedList.length === 0
                ? 'var(--bg-secondary)'
                : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: selectedList.length === 0 ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: selectedList.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            📝 note記事にまとめる
          </button>
          {selectedList.length > 0 && (
            <button
              type="button"
              onClick={clear}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              全解除
            </button>
          )}
        </div>
      )}

      {/* 記事プラン提案→note記事群の生成モーダル（179） */}
      <NoteBundleModal
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
        selected={selectedList}
      />
    </>
  );
}
