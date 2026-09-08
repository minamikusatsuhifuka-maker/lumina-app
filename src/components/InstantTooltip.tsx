'use client';

// 300: `title` 属性の説明を、カーソルが乗った**瞬間**に出す共通部品（全画面・1箇所マウント）。
//
// ── 仕組み ────────────────────────────────────────────────
// - document の pointermove（マウスのみ）で `closest('[title],[data-tip]')` を見て、ボタン等に乗った瞬間に
//   吹き出し（body 直下の1要素・position:fixed）へ文言を入れて出す。React の state を介さず DOM を直接更新する
//   ＝イベントと同じタイミングで出る（遅延ゼロ・タイマー無し）。
// - 乗っている間だけ `title` を `data-tip` に退避して外す（ブラウザ標準の遅い吹き出しが二重に出ないように）。
//   離れたら戻す。React が再描画で `title` を付け直していたら（例: ▼→▲で文言が変わる）そちらを尊重して上書きしない。
// - 消える: カーソルが離れた／クリックした（押した後は同じ要素の上にいる間は再表示しない）／スクロール／キー入力／
//   ウィンドウから出た。
// - 301追記: **クリックで消すときは `title` をその場で戻し、押した後の要素は退避しない**。`title` はアイコンボタンの
//   アクセシブルネームであり E2E のロケータ（`button[title*=…]`・13箇所）でもある。外したままにすると、同じボタンを
//   続けて2回押す操作（⌨小窓の開→閉など）で2回目の要素が見つからず、C21/C29 が本番で恒常失敗した。
//   吹き出しが出ていない間に title を外しておく理由は無い（外すのは「出している間の二重表示を防ぐ」ためだけ）。
// - 位置: lib/instant-tooltip.ts の純関数（下・入らなければ上・左右は画面端の内側）。
//   R-80: 視覚pxで決めて style に渡すときだけ toLayoutPx（273 の rootZoom/toLayoutPx を再利用）。
// - タッチ端末: useFinePointer が false なら何も付けない（タップで出っぱなしにしない）。pointerType も mouse 限定。
//
// 257のホバープレビュー（記事本文・意図的な遅延・既定OFF）とは別物で、あちらの設定は触らない。

import { useEffect } from 'react';
import { useFinePointer } from '@/lib/pointer-device';
import { rootZoom, toLayoutPx } from '@/lib/hover-preview';
import {
  INSTANT_TIP_ATTR,
  INSTANT_TIP_GAP,
  INSTANT_TIP_MARGIN,
  INSTANT_TIP_MAX_WIDTH,
  INSTANT_TIP_STASH_ATTR,
  computeTipPlacement,
  isTipText,
} from '@/lib/instant-tooltip';

const SELECTOR = `[title], [${INSTANT_TIP_STASH_ATTR}]`;

export function InstantTooltip() {
  const { fine, mounted } = useFinePointer();

  useEffect(() => {
    if (!mounted || !fine) return;
    if (typeof document === 'undefined') return;

    const tip = document.createElement('div');
    tip.setAttribute(INSTANT_TIP_ATTR, '');
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      zIndex: '10001',
      maxWidth: `${INSTANT_TIP_MAX_WIDTH}px`,
      padding: '5px 9px',
      borderRadius: '6px',
      background: '#1f2937',
      color: '#ffffff',
      fontSize: '12px',
      lineHeight: '1.45',
      whiteSpace: 'pre-line',
      wordBreak: 'break-word',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(tip);

    let anchor: HTMLElement | null = null;
    // 直近のカーソル位置（スクロール時に「まだ同じ要素の上か」を見るため）
    let lastX = -1;
    let lastY = -1;
    // クリックした要素。カーソルがその上に残っている間は再表示しない（押した後に残ると邪魔＝§3-3）
    let suppressed: HTMLElement | null = null;

    const stash = (el: HTMLElement) => {
      const t = el.getAttribute('title');
      if (t === null) return;
      if (isTipText(t)) el.setAttribute(INSTANT_TIP_STASH_ATTR, t);
      el.removeAttribute('title');
    };
    const restore = (el: HTMLElement) => {
      const t = el.getAttribute(INSTANT_TIP_STASH_ATTR);
      // React が再描画で title を付け直していたら（文言が変わった）そちらを尊重する
      if (t !== null && el.isConnected && !el.hasAttribute('title')) el.setAttribute('title', t);
      el.removeAttribute(INSTANT_TIP_STASH_ATTR);
    };
    const hide = () => {
      tip.hidden = true;
      tip.removeAttribute('data-instant-tip-for');
    };
    const show = (el: HTMLElement) => {
      const text = el.getAttribute(INSTANT_TIP_STASH_ATTR);
      if (!isTipText(text)) { hide(); return; }
      tip.textContent = text;
      tip.hidden = false;
      tip.setAttribute('data-instant-tip-for', el.getAttribute('data-instant-tip-key') ?? el.tagName.toLowerCase());
      // 一度左上に置いてから実寸を測る（画面端での折り返しの影響を受けないように）
      tip.style.left = '0px';
      tip.style.top = '0px';
      const zoom = rootZoom();
      const a = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const p = computeTipPlacement(
        { left: a.left, top: a.top, width: a.width, height: a.height },
        { width: window.innerWidth, height: window.innerHeight },
        { width: t.width, height: t.height },
        INSTANT_TIP_GAP * zoom,
        INSTANT_TIP_MARGIN * zoom,
      );
      tip.setAttribute('data-instant-tip-side', p.side);
      // R-80: 視覚px → レイアウトpx（zoom=1 なら同値）
      tip.style.left = `${toLayoutPx(p.left, zoom)}px`;
      tip.style.top = `${toLayoutPx(p.top, zoom)}px`;
    };
    const leaveAnchor = () => {
      if (anchor) restore(anchor);
      anchor = null;
      hide();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      lastX = e.clientX;
      lastY = e.clientY;
      const target = e.target as Element | null;
      const el = (target && typeof target.closest === 'function' ? target.closest(SELECTOR) : null) as HTMLElement | null;
      const next = el && el.tagName !== 'IFRAME' && !el.hasAttribute('data-no-instant-tip') ? el : null;
      if (next !== anchor) {
        if (anchor) restore(anchor);
        anchor = next;
        if (suppressed && suppressed !== next) suppressed = null;
        if (!next) { hide(); return; }
        // 押した後の要素は退避しない（title を持ったままにする＝アクセシブルネーム／ロケータを壊さない・301）
        if (suppressed === next) { hide(); return; }
        stash(next);
        show(next);
        return;
      }
      // 同じ要素の上: React が title を付け直していたら（文言更新）退避し直す。押した後は退避も表示もしない
      if (next && suppressed !== next && next.hasAttribute('title')) {
        stash(next);
        show(next);
      }
    };
    const onPress = () => {
      if (anchor) {
        suppressed = anchor;
        // 吹き出しを消すと同時に title を戻す（消えている間は外しておく理由が無い・301）
        restore(anchor);
      }
      hide();
    };
    // スクロール: カーソルの下がまだ同じ要素なら位置を取り直す（要素を画面内へ寄せてから乗った直後の scroll イベントで
    // 消えてしまわないように＝scroll は次フレームで遅れて届く）。要素が流れて行ったら消す
    const onScroll = () => {
      if (!anchor || tip.hidden) return;
      const under = lastX >= 0 ? document.elementFromPoint(lastX, lastY) : null;
      if (under && anchor.contains(under) && suppressed !== anchor) show(anchor);
      else hide();
    };
    const onKey = () => hide();
    const onWindowLeave = () => leaveAnchor();

    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('click', onPress, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey, true);
    document.documentElement.addEventListener('mouseleave', onWindowLeave);
    window.addEventListener('blur', onWindowLeave);

    return () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('click', onPress, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.removeEventListener('mouseleave', onWindowLeave);
      window.removeEventListener('blur', onWindowLeave);
      leaveAnchor();
      tip.remove();
    };
  }, [mounted, fine]);

  return null;
}
