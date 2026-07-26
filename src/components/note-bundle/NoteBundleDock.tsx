'use client';

// 180/181: note記事まとめ生成の「追従する選択完了ボタン＋中央確認モーダル＋生成モーダル」。
// タブコンテナの外（ページ直下）に1回だけマウントする。
// （/dashboard/saved は各パネルを display:none で切り替えるため、
//   パネル内に置くと非表示タブ側の固定UIごと消える。ここはタブの外が正しい位置）
//
// 181: 旧・下部固定バーは廃止（案a）。選択1件以上で画面下部中央に「☑ N件選択中 → 次へ」の
// 追従ボタンを表示 → 押すと中央モーダルで確認（選択一覧・個別解除・全解除）→
// 「📝 note記事にまとめる」で179のプラン生成フローへそのまま接続（生成ロジック無変更）。
// 右下は既存フローティング3つ（📖ガイド・📝メモ・💬チャット, right:16 の縦列）が使用済みのため中央配置。

import { useState, type CSSProperties } from 'react';
import { MAX_BUNDLE_SOURCES, BUNDLE_SOURCE_META } from '@/lib/note-bundle';
import { useNoteBundleSelection } from './useNoteBundleSelection';
import NoteBundleModal from './NoteBundleModal';

export default function NoteBundleDock() {
  const { selectedList, countBySource, clear, toggle } = useNoteBundleSelection();
  // confirmOpen = 中央の確認モーダル / bundleOpen = 179のプラン→生成モーダル
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);

  const count = selectedList.length;
  // 選択0件では追従ボタンを出さない（常時表示は邪魔）。全解除で0件になったら確認モーダルも閉じる
  if (count === 0 && confirmOpen) setConfirmOpen(false);
  if (count === 0 && !bundleOpen) return null;

  const ctxCount = countBySource('context');
  const anaCount = countBySource('analysis');

  const smallBtn = (extra?: CSSProperties): CSSProperties => ({
    padding: '8px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    ...extra,
  });

  return (
    <>
      {/* ① 追従する「選択完了」ボタン（選択1件以上・スクロール位置に関わらず常に見える） */}
      {count > 0 && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          title="選択した資料を確認して note 記事にまとめます"
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(139,92,246,0.45)',
            whiteSpace: 'nowrap',
            // モバイル幅でも右下のフローティング群（right:16）と重ならないよう中央・コンパクト表示
            maxWidth: 'calc(100vw - 140px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          ☑ {count}件選択中 → 次へ
        </button>
      )}

      {/* ② 中央の確認モーダル（閉じる=選択維持 / 全解除=選択クリア） */}
      {confirmOpen && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 560,
              maxHeight: '80vh',
              overflowY: 'auto',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>
                ☑ {count}件選択中（上限{MAX_BUNDLE_SOURCES}件）
              </h2>
              <button type="button" onClick={() => setConfirmOpen(false)} style={smallBtn({ padding: '6px 12px', fontSize: 12 })}>
                ✕ 閉じる
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              内訳: 🧠AI参照素材 {ctxCount}件・🗂テキスト分析 {anaCount}件（「閉じる」では選択は消えません）
            </p>

            {/* 選択中の資料タイトル一覧（各行 ✕ で個別解除） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {selectedList.map((item) => {
                const meta = BUNDLE_SOURCE_META[item.source];
                return (
                  <div
                    key={`${item.source}-${item.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0 }} title={meta.label}>{meta.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.topic}>
                      {item.topic}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      title="この資料を選択から外す"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '2px 6px', flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setBundleOpen(true);
                }}
                style={{
                  padding: '11px 22px',
                  background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                📝 note記事にまとめる
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  setConfirmOpen(false);
                }}
                style={smallBtn({ color: '#ef4444' })}
              >
                全解除
              </button>
              <button type="button" onClick={() => setConfirmOpen(false)} style={smallBtn({ marginLeft: 'auto' })}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ③ 記事プラン提案→note記事群の生成モーダル（179・ロジック無変更） */}
      <NoteBundleModal
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
        selected={selectedList}
      />
    </>
  );
}
