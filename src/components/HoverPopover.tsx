'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 304: 対話要素を載せるホバーポップアップ（共通部品。まずマンダラのリンクバッジで使う）
//
// 257 の HoverPreview（押せない・本文のみ・既定OFF）と 300 の InstantTooltip（title 由来・即時・押せない）は
// どちらも「読むだけ」の吹き出し。これは**行を押してリンク先へ飛ぶ**ための箱なので別部品にし、
// title 属性は併用しない（アンカー側は aria-label で読み上げ・R-110）。
//
// 挙動（§2-2）:
// - ホバーで出す（HOVER_POPOVER_DELAY_MS）。アンカー→箱へカーソルを移す間は猶予（CLOSE_GRACE）で消えない
// - アンカーと箱の両方から外れたら消える。Esc／外側クリックでも消える。同時に1つだけ
// - アンカーのクリック＝ピン留め（マウスでも、ホバーの無いタッチでも同じ）。呼び出し側は stopPropagation で
//   親（マスのクリック）へ伝えない（R-81: バッジは操作要素）
// - スクロールでは消さず、アンカーの新しい矩形へ位置を取り直す（300 §3-4 の「表示直後の遅れた scroll で消える」を
//   再現しない）。アンカーが画面から出たら消す
// 位置: 273 の computePreviewPlacement（右→左→下→上・画面内へクランプ）。R-80: 視覚pxで決め、style へは
// toLayoutPx（zoom=1 なら同値）。createPortal で body 直下（R-19）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { rootZoom, toLayoutPx, type PreviewRect } from '@/lib/hover-preview';
import {
  HOVER_POPOVER_CLOSE_GRACE_MS,
  HOVER_POPOVER_DELAY_MS,
  HOVER_POPOVER_MAX_HEIGHT,
  HOVER_POPOVER_WIDTH,
  HOVER_POPOVER_Z,
  computePopoverPlacement,
} from '@/lib/hover-popover';

type OpenState<P> = { key: string; payload: P; anchor: HTMLElement; rect: PreviewRect; pinned: boolean };

export interface HoverPopoverBindings {
  onMouseEnter: (e: ReactMouseEvent) => void;
  onMouseLeave: () => void;
  onClick: (e: ReactMouseEvent) => void;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
  'data-hover-popover-anchor': string;
}

export interface HoverPopoverApi<P> {
  /** アンカー要素へ展開する。key は同時に1つだけ開くための識別子 */
  bind: (key: string, payload: P) => HoverPopoverBindings;
  /** 画面のどこか1箇所に置くポップアップ本体 */
  layer: ReactNode;
  openKey: string | null;
  close: () => void;
  /** 呼び出し側が明示的に開く（タッチのタップなど。ピン留め扱い） */
  openPinned: (key: string, payload: P, anchor: HTMLElement) => void;
}

export function useHoverPopover<P>(
  renderContent: (payload: P, api: { close: () => void; pinned: boolean }) => ReactNode,
  options?: { onOpen?: (key: string, payload: P) => void },
): HoverPopoverApi<P> {
  const [state, setState] = useState<OpenState<P> | null>(null);
  const stateRef = useRef<OpenState<P> | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onOpenRef = useRef(options?.onOpen);
  // ref はイベント時に最新の state を読むための箱。描画中に書かず、描画後の effect で更新する
  useEffect(() => {
    stateRef.current = state;
    onOpenRef.current = options?.onOpen;
  });

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };
  const close = useCallback(() => {
    clearTimer(openTimer);
    clearTimer(closeTimer);
    setState(null);
  }, []);

  const rectOf = (el: HTMLElement): PreviewRect => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const open = useCallback((key: string, payload: P, anchor: HTMLElement, pinned: boolean) => {
    clearTimer(openTimer);
    clearTimer(closeTimer);
    if (!anchor.isConnected) return;
    setState({ key, payload, anchor, rect: rectOf(anchor), pinned });
    onOpenRef.current?.(key, payload);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimer(openTimer);
    const cur = stateRef.current;
    if (!cur || cur.pinned) return;
    clearTimer(closeTimer);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setState((s) => (s && !s.pinned ? null : s));
    }, HOVER_POPOVER_CLOSE_GRACE_MS);
  }, []);

  const openKey = state?.key ?? null;
  const bind = useCallback(
    (key: string, payload: P): HoverPopoverBindings => ({
      onMouseEnter: (e) => {
        const el = e.currentTarget as HTMLElement;
        clearTimer(closeTimer);
        const cur = stateRef.current;
        if (cur && cur.key === key) return; // 出ている箱へ戻ってきた
        clearTimer(openTimer);
        openTimer.current = window.setTimeout(() => {
          openTimer.current = null;
          // 別の箱がピン留め中でも、新しいアンカーへ来たら差し替える（同時に1つ）
          open(key, payload, el, false);
        }, HOVER_POPOVER_DELAY_MS);
      },
      onMouseLeave: scheduleClose,
      onClick: (e) => {
        // ピン留め（マウス）／タップで出す（タッチ）。親（マスのクリック）へは伝えない（R-81: バッジは操作要素）
        e.stopPropagation();
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const cur = stateRef.current;
        if (cur && cur.key === key && cur.pinned) {
          close();
          return;
        }
        open(key, payload, el, true);
      },
      'aria-haspopup': 'dialog',
      'aria-expanded': openKey === key,
      'data-hover-popover-anchor': key,
    }),
    [open, scheduleClose, close, openKey],
  );

  const openPinned = useCallback((key: string, payload: P, anchor: HTMLElement) => open(key, payload, anchor, true), [open]);

  // Esc・外側クリック・アンカー消失・スクロール時の追従
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (boxRef.current?.contains(t)) return;
      if (state.anchor.contains(t)) return;
      close();
    };
    // スクロール: 消さずに位置を取り直す。アンカーが画面外へ出たら消す
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const s = stateRef.current;
        if (!s) return;
        if (!s.anchor.isConnected) { close(); return; }
        const r = s.anchor.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) { close(); return; }
        setState((cur) => (cur ? { ...cur, rect: { left: r.left, top: r.top, width: r.width, height: r.height } } : cur));
      });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [state, close]);

  useEffect(() => () => { clearTimer(openTimer); clearTimer(closeTimer); }, []);

  const layer =
    state && typeof document !== 'undefined'
      ? createPortal(
          <PopoverBox
            key={state.key}
            boxRef={boxRef}
            anchorKey={state.key}
            rect={state.rect}
            pinned={state.pinned}
            onMouseEnter={() => clearTimer(closeTimer)}
            onMouseLeave={scheduleClose}
          >
            {/* close は ref（タイマー）を触るが、renderContent はそれをボタンのイベントでしか呼ばない（描画中には呼ばない） */}
            {/* eslint-disable-next-line react-hooks/refs */}
            {renderContent(state.payload, { close, pinned: state.pinned })}
          </PopoverBox>,
          document.body,
        )
      : null;

  return { bind, layer, openKey, close, openPinned };
}

function PopoverBox({
  boxRef,
  anchorKey,
  rect,
  pinned,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  boxRef: React.MutableRefObject<HTMLDivElement | null>;
  anchorKey: string;
  rect: PreviewRect;
  pinned: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: ReactNode;
}) {
  const [boxHeight, setBoxHeight] = useState(HOVER_POPOVER_MAX_HEIGHT);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // R-80: 位置は視覚pxで決め、style へはレイアウトpx（zoom=1 なら同値）。箱の実寸も視覚pxへ直して判定する
  const zoom = rootZoom();
  const boxVisual = { width: HOVER_POPOVER_WIDTH * zoom, height: boxHeight * zoom };
  const placement = computePopoverPlacement(rect, { width: vw, height: vh }, boxVisual);

  useLayoutEffect(() => {
    const h = boxRef.current?.offsetHeight;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h && h !== boxHeight) setBoxHeight(h);
  }, [children, boxHeight, boxRef]);

  const style: CSSProperties = {
    position: 'fixed',
    left: toLayoutPx(placement.left, zoom),
    top: toLayoutPx(placement.top, zoom),
    width: HOVER_POPOVER_WIDTH,
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: HOVER_POPOVER_MAX_HEIGHT,
    overflowY: 'auto',
    zIndex: HOVER_POPOVER_Z,
    background: 'var(--bg-card, #fff)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
    padding: 8,
    fontSize: 12,
    lineHeight: 1.6,
    // 257 と違い**押せる**（pointer-events は既定の auto）
  };
  return (
    <div
      ref={boxRef}
      role="dialog"
      data-hover-popover={anchorKey}
      data-hover-popover-side={placement.side}
      data-hover-popover-pinned={pinned ? '1' : '0'}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
