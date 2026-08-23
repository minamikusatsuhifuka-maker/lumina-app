'use client';

// 256: カードにカーソルを当てると本文の冒頭が出るプレビュー。
// 🗂保存一覧 / 📚リサーチ保存 / 🧠AI参照素材 の3画面で同じ部品を使う。
//
// 設計の要点:
// - **タッチ端末では出さない**。ホバーが無い端末で無理に出すと、タップ操作を妨げる
//   （要件: モバイルで誤爆して操作を妨げないことを最優先）。判定は
//   `(hover: hover) and (pointer: fine)` で、UA判定はしない。
// - **本文の取り方は画面側に任せる**（`getText` を渡してもらう）。すでに手元にある画面は
//   そのまま返し、持っていない画面は自前のキャッシュ付き取得を通す＝
//   ホバーのたびにAPIを叩かない。
// - ポップアップは `pointer-events: none` で、下のボタン（分類・削除・選択）を覆わない。
// - `.page-enter` の transform 配下では position:fixed が効かないため createPortal（R-19）。
// - スクロールしたら消す（一覧が動いたあとに前の位置へ残らない）。
//
// 257で変えたこと:
// - **位置の基準をカーソルからカードの矩形へ**。256はカーソル座標＋16pxで出し、
//   画面端では「カーソルを基準に箱ごと反転」していたため、箱の高さ・幅ぶん
//   （実測260〜396px）カードから離れた場所へ飛んでいた。今はカードの右→左→下→上の
//   順に**隣接**させ、三角のポインタでどのカードから出ているかを示す。
// - **先読み**: カーソルが入った 80ms 後に本文の取得だけ先に始め、表示は 280ms 後。
//   出たときには本文が揃っているので「読み込み中…」がほぼ出ない（＝チラつかない）。

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  computeArrowOffset,
  computePreviewPlacement,
  HOVER_PREVIEW_DELAY_MS,
  HOVER_PREVIEW_MAX_HEIGHT,
  HOVER_PREVIEW_PREFETCH_MS,
  HOVER_PREVIEW_WIDTH,
  isHoverPreviewEnabled,
  HOVER_PREVIEW_EVENT,
  toPreviewText,
  type PreviewRect,
} from '@/lib/hover-preview';
import { hasFinePointer } from '@/lib/pointer-device';

const ARROW = 8;

type State = {
  /** ホバー中のカードの矩形（ビューポート基準＝position:fixed と同じ座標系） */
  card: PreviewRect;
  text: string | null;
  loading: boolean;
};

export interface HoverPreviewApi {
  /** その端末・設定でプレビューを使うか（false ならイベントも張らない） */
  active: boolean;
  /** カードに展開するイベントハンドラ。getText は本文を返す（同期でも非同期でもよい） */
  bind: (getText: () => string | null | Promise<string | null>) => {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
  };
  /** 画面のどこか1箇所に置くポップアップ本体 */
  layer: ReactNode;
}

export function useHoverPreview(): HoverPreviewApi {
  // 「ホバーがある端末か」と「設定ON か」の両方を満たしたときだけ動かす。
  // SSR とズレないよう、確定はマウント後（初期値 false ＝何も出さない）
  const [active, setActive] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const update = () => {
      // 258: 端末判定は lib/pointer-device.ts に一本化（258で「クリアして貼付」ボタンの
      // 出し分けにも同じ判定が要ったため。同じ問いを2箇所で書かない）
      const canHover = hasFinePointer();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(canHover && isHoverPreviewEnabled());
    };
    update();
    window.addEventListener(HOVER_PREVIEW_EVENT, update);
    return () => window.removeEventListener(HOVER_PREVIEW_EVENT, update);
  }, []);

  const clearTimers = () => {
    for (const ref of [showTimerRef, prefetchTimerRef]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    }
  };

  const hide = useCallback(() => {
    clearTimers();
    seqRef.current += 1; // 取得中の結果が後から届いても捨てる
    setState(null);
  }, []);

  // スクロール・ウィンドウ変化・タブ非表示では消す（前の位置に取り残さない）
  useEffect(() => {
    if (!state) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('blur', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', onScroll);
    };
  }, [state, hide]);

  useEffect(() => clearTimers, []);

  /**
   * カーソルが入ったときの予約。
   * 取得（先読み・80ms後）と表示（280ms後）を別々のタイマーで持つ。
   */
  const schedule = (el: HTMLElement, getText: () => string | null | Promise<string | null>) => {
    clearTimers();
    const seq = ++seqRef.current;

    // 先読みの結果は「もう届いているか」を同期で知れる形で持つ
    // （届いていれば「読み込み中…」を挟まずいきなり本文を出せる）
    const holder: { done: boolean; value: string | null; promise: Promise<string | null> | null } = {
      done: false,
      value: null,
      promise: null,
    };
    const start = () => {
      if (holder.promise) return holder.promise;
      holder.promise = (async () => {
        try {
          return await getText();
        } catch {
          return null;
        }
      })().then(v => {
        holder.done = true;
        holder.value = v;
        return v;
      });
      return holder.promise;
    };

    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      if (seq !== seqRef.current) return;
      void start();
    }, HOVER_PREVIEW_PREFETCH_MS);

    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      if (seq !== seqRef.current) return;
      // 一覧が再描画されてカードが消えていたら出さない
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const card: PreviewRect = { left: r.left, top: r.top, width: r.width, height: r.height };

      const promise = start();
      if (holder.done) {
        // 本文が既に手元にある（リサーチ保存など）／先読みが間に合った場合は一気に出す
        const preview = toPreviewText(holder.value);
        setState(preview ? { card, text: preview, loading: false } : null);
        return;
      }
      // 間に合わなかったときだけ枠を先に出す（待たされている感じを減らす）
      setState({ card, text: null, loading: true });
      void promise.then(v => {
        if (seq !== seqRef.current) return;
        const preview = toPreviewText(v);
        setState(prev => (prev ? (preview ? { ...prev, text: preview, loading: false } : null) : null));
      });
    }, HOVER_PREVIEW_DELAY_MS);
  };

  const bind: HoverPreviewApi['bind'] = (getText) => {
    if (!active) return {};
    return {
      onMouseEnter: (e: React.MouseEvent) => {
        // 位置はカードの矩形から決めるのでカーソル座標は使わない。
        // 要素の参照だけ掴んで、表示の直前に測る（グリッドの再描画にも追随する）
        const el = e.currentTarget as HTMLElement;
        schedule(el, getText);
      },
      onMouseLeave: hide,
    };
  };

  const layer =
    state && typeof document !== 'undefined'
      ? createPortal(<PreviewBox state={state} />, document.body)
      : null;

  return { active, bind, layer };
}

function PreviewBox({ state }: { state: State }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 本文が短いと箱は 260px より低くなる。三角の位置を正しく出すため実寸を測る
  const [boxHeight, setBoxHeight] = useState(HOVER_PREVIEW_MAX_HEIGHT);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const placement = computePreviewPlacement(state.card, { width: vw, height: vh });

  useLayoutEffect(() => {
    const h = boxRef.current?.offsetHeight;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h && h !== boxHeight) setBoxHeight(h);
  }, [state.card, state.text, state.loading, boxHeight]);

  const arrowOffset = computeArrowOffset(
    state.card,
    placement,
    { width: HOVER_PREVIEW_WIDTH, height: boxHeight },
    ARROW,
  );

  // 三角のポインタ: カード側の辺に、カードの方を向けて置く
  const arrowStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
    const line = `${ARROW}px solid var(--border)`;
    const clear = `${ARROW}px solid transparent`;
    if (placement.side === 'right') {
      return { ...base, left: -ARROW, top: arrowOffset, borderTop: clear, borderBottom: clear, borderRight: line };
    }
    if (placement.side === 'left') {
      return { ...base, right: -ARROW, top: arrowOffset, borderTop: clear, borderBottom: clear, borderLeft: line };
    }
    if (placement.side === 'bottom') {
      return { ...base, top: -ARROW, left: arrowOffset, borderLeft: clear, borderRight: clear, borderBottom: line };
    }
    return { ...base, bottom: -ARROW, left: arrowOffset, borderLeft: clear, borderRight: clear, borderTop: line };
  })();

  return (
    <div
      ref={boxRef}
      data-hover-preview
      data-hover-preview-side={placement.side}
      style={{
        position: 'fixed',
        left: placement.left,
        top: placement.top,
        width: HOVER_PREVIEW_WIDTH,
        maxHeight: HOVER_PREVIEW_MAX_HEIGHT,
        overflow: 'hidden',
        zIndex: 9997,
        // 下のボタン（分類・削除・選択）を覆わない
        pointerEvents: 'none',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        padding: 12,
        fontSize: 12,
        lineHeight: 1.8,
        color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {/* カードとの繋がりを示す三角（枠と同じ色。pointer-events は親から継承で none） */}
      <span data-hover-preview-arrow style={arrowStyle} />
      {state.loading ? (
        <span style={{ color: 'var(--text-muted)' }}>読み込み中…</span>
      ) : (
        state.text
      )}
    </div>
  );
}
