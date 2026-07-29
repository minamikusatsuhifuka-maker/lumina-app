'use client';

// 180/181/187: note記事まとめ生成の「追従する選択完了ボタン＋中央確認モーダル＋生成モーダル」。
// タブコンテナの外（ページ直下）に1回だけマウントする。
// （/dashboard/saved は各パネルを display:none で切り替えるため、
//   パネル内に置くと非表示タブ側の固定UIごと消える。ここはタブの外が正しい位置）
//
// 187: 「☑ N件選択中 → 次へ」は**最後にチェック操作したカードの直下**に追従表示する
// （目線の先にボタンを置く）。カードは data-bundle-key 属性で特定し、rect計測＋fixed配置＝
// カードのレイアウトを一切変えない（インライン差し込みのガタつきを回避）。
// フォールバック: カードが見つからない/別タブ(display:none)/画面外スクロール時は
// 181の画面下部中央固定に切り替える（押せるボタンが消える状態を作らない・二重表示はしない）。
// 右下は既存フローティング3つ（📖ガイド・📝メモ・💬チャット, right:16 の縦列）が使用済み。

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MAX_BUNDLE_SOURCES, BUNDLE_SOURCE_META } from '@/lib/note-bundle';
import { isShortcutsEnabled, isTypingTarget } from '@/lib/keyboard-shortcuts';
import { useNoteBundleSelection } from './useNoteBundleSelection';
import NoteBundleModal from './NoteBundleModal';

export default function NoteBundleDock() {
  const { selectMode, selectedList, lastToggledKey, countBySource, clear, toggle, setSelectMode } = useNoteBundleSelection();
  // confirmOpen = 中央の確認モーダル / bundleOpen = 179のプラン→生成モーダル
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  // 187: 追従ボタンの表示位置（viewport座標）。null = 下部中央固定へフォールバック
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const count = selectedList.length;

  // 最後に操作したカードの位置を計測し、直下座標を追従更新（scroll/resize/レイアウト変化）
  useEffect(() => {
    if (!selectMode || count === 0 || !lastToggledKey) {
      setAnchor(null);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = document.querySelector(`[data-bundle-key="${lastToggledKey}"]`);
      if (!(el instanceof HTMLElement)) {
        // 別ページ・検索絞り込み等でカードが現在の画面に無い → 下部固定へ
        setAnchor(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // display:none（タブ切替）は width=0、スクロールで直下位置が視界外に出た場合も下部固定へ
      if (r.width === 0 || r.bottom < 80 || r.bottom > window.innerHeight - 70) {
        setAnchor(null);
        return;
      }
      setAnchor({ top: r.bottom + 8, left: r.left + r.width / 2 });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    // capture: 内側スクロールコンテナのスクロールも拾う
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    // カード展開などスクロールを伴わないレイアウト変化にも追従
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [selectMode, count, lastToggledKey]);

  // 189: 確認モーダル表示中は背景スクロールをロック（閉じたら復元。FullscreenReaderと同方式）
  useEffect(() => {
    if (!confirmOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [confirmOpen]);

  // 204: 選択モードのショートカット（設定ON時のみ・入力中/IME変換中は無効）。
  // ⌘/Ctrl+Enter=選択完了（確認モーダルを開く。破壊的でないので割り当て可）
  // Esc=確認モーダルを閉じる → 選択モードを抜ける（生成モーダル表示中は触らない）
  const bundleOpenNow = bundleOpen;
  useEffect(() => {
    if (!selectMode || bundleOpenNow) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcutsEnabled()) return;
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (count > 0 && !confirmOpen) {
          e.preventDefault();
          setConfirmOpen(true);
        }
        return;
      }
      if (e.key === 'Escape' && !isTypingTarget(e)) {
        if (confirmOpen) {
          setConfirmOpen(false);
        } else if (document.body.style.overflow !== 'hidden') {
          // 全画面リーダー等のモーダル表示中（bodyスクロールロック中）は
          // そちらのEscクローズに譲る（選択が意図せず解除・クリアされる事故を防ぐ）
          setSelectMode(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode, bundleOpenNow, confirmOpen, count, setSelectMode]);

  // 選択0件では追従ボタンを出さない（常時表示は邪魔）。全解除で0件になったら確認モーダルも閉じる
  if (count === 0 && confirmOpen) setConfirmOpen(false);
  if (count === 0 && !bundleOpen) return null;

  const ctxCount = countBySource('context');
  const anaCount = countBySource('analysis');

  // ピル型ボタンの共通スタイル（直下追従・下部固定の両方で使用＝見た目を揃える）
  const pillStyle: CSSProperties = {
    zIndex: 900,
    padding: '10px 22px',
    background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    color: '#fff',
    border: 'none',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(139,92,246,0.45)',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100vw - 140px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

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

  // 189: document.body 直下に portal で描画する。祖先（dashboard の main 等）に
  // transform / filter があっても position:fixed が常にビューポート基準になり、
  // ボタン・モーダルがスクロール位置に関係なく「いま見えている画面」に出る。
  // ここに到達するのは選択操作後（クライアント側）のみ＝SSRでは早期 return 済みで document は常に存在する。
  return createPortal(
    <>
      {/* ① 追従する「選択完了」ボタン（187: 最後に操作したカードの直下。
             カード不在・別タブ・画面外は181の下部中央固定へフォールバック。二重には出さない） */}
      {count > 0 && (
        anchor ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            title="選択した資料を確認して note 記事にまとめます"
            style={{
              ...pillStyle,
              position: 'fixed',
              top: anchor.top,
              // カードの中央に合わせつつ、画面端では見切れないようにクランプ
              left: Math.min(Math.max(anchor.left, 140), window.innerWidth - 140),
              transform: 'translateX(-50%)',
            }}
          >
            ☑ {count}件選択中 → 次へ
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            title="選択した資料を確認して note 記事にまとめます"
            style={{
              ...pillStyle,
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 24px',
              fontSize: 14,
            }}
          >
            ☑ {count}件選択中 → 次へ
          </button>
        )
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
    </>,
    document.body,
  );
}
