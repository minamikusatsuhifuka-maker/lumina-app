'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 313: 画面下部の固定アクションバー（共通部品・画面専用にしない・R-91）
//
// - body へ createPortal（transform / backdrop-filter の祖先で fixed が箱に張り付く罠を避ける）
// - 横位置は**容器（anchorRef）の実測幅**に合わせる＝サイドバーや余白の上に被らない。
//   R-80: getBoundingClientRect は視覚px、fixed の left/width はレイアウトpx ＝ rootZoom で戻す
// - 出ている間だけ documentElement に CSS 変数（バーの高さ）を書く → 追従ボタン（↑ 等）がその分だけ上へ逃げる
// - 中身（ボタン）は呼び出し側が渡す＝既存のハンドラ・活性条件をそのまま使う（複製しない・R-88）
// - 判定（狭幅・キーボード中・余白）は lib/sticky-action-bar.ts の純関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { rootZoom, toLayoutPx } from '@/lib/hover-preview';
import { STICKY_BAR_HEIGHT_VAR, STICKY_BAR_PADDING, STICKY_BAR_Z_INDEX, stickyBarPaddingBottom } from '@/lib/sticky-action-bar';

export function StickyActionBar({
  show,
  anchorRef,
  left,
  children,
  onHeightChange,
  name,
}: {
  /** 出すか（呼び出し側が shouldShowStickyBar で決める） */
  show: boolean;
  /** 横位置を合わせる容器（主カラム） */
  anchorRef: RefObject<HTMLElement | null>;
  /** 左側の補足（件数・文字数など。押せる要素は置かない） */
  left?: ReactNode;
  /** 右側の操作（既存のボタンをそのまま渡す） */
  children: ReactNode;
  /** 実測の高さ（px・視覚）。容器の下余白に使う */
  onHeightChange?: (heightPx: number) => void;
  /** 目印（data-sticky-action-bar の値） */
  name?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // 横位置＝容器の実測（視覚px → レイアウトpx・R-80）。幅の変化は ResizeObserver、位置の変化は resize/scroll で拾う
  useEffect(() => {
    if (!show) return;
    const el = anchorRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const z = rootZoom();
      setBox({ left: toLayoutPx(r.left, z), width: toLayoutPx(r.width, z) });
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, { passive: true, capture: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', apply, { capture: true } as EventListenerOptions);
    };
  }, [show, anchorRef]);

  // 高さ: 実測して呼び出し側（余白）と追従ボタン（CSS 変数）へ。出ていない間は変数を消す＝0px
  useEffect(() => {
    if (!show) {
      document.documentElement.style.removeProperty(STICKY_BAR_HEIGHT_VAR);
      onHeightChange?.(0);
      return;
    }
    const el = barRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(STICKY_BAR_HEIGHT_VAR, `${Math.ceil(toLayoutPx(h, rootZoom()))}px`);
      onHeightChange?.(h);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      document.documentElement.style.removeProperty(STICKY_BAR_HEIGHT_VAR);
    };
  }, [show, onHeightChange]);

  if (!mounted || !show) return null;

  return createPortal(
    <div
      ref={barRef}
      data-sticky-action-bar={name ?? '1'}
      role="region"
      aria-label="操作バー"
      style={{
        position: 'fixed',
        bottom: 0,
        left: box ? box.left : 0,
        width: box ? box.width : '100%',
        zIndex: STICKY_BAR_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: `${STICKY_BAR_PADDING}px 12px`,
        paddingBottom: stickyBarPaddingBottom(),
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -6px 20px rgba(0,0,0,0.12)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ minWidth: 0, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{children}</div>
    </div>,
    document.body,
  );
}

export default StickyActionBar;
