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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  HOVER_PREVIEW_DELAY_MS,
  isHoverPreviewEnabled,
  HOVER_PREVIEW_EVENT,
  toPreviewText,
} from '@/lib/hover-preview';

const WIDTH = 380;
const MAX_HEIGHT = 260;
const OFFSET = 16;

type State = {
  x: number;
  y: number;
  text: string | null;
  loading: boolean;
};

export interface HoverPreviewApi {
  /** その端末・設定でプレビューを使うか（false ならイベントも張らない） */
  active: boolean;
  /** カードに展開するイベントハンドラ。getText は本文を返す（同期でも非同期でもよい） */
  bind: (getText: () => string | null | Promise<string | null>) => {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseMove?: (e: React.MouseEvent) => void;
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
  const timerRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(canHover && isHoverPreviewEnabled());
    };
    update();
    window.addEventListener(HOVER_PREVIEW_EVENT, update);
    return () => window.removeEventListener(HOVER_PREVIEW_EVENT, update);
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
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

  useEffect(() => clearTimer, []);

  /** カーソルを止めてから出すまでの予約。同じ処理を2箇所に書かないためここに寄せる */
  const schedule = (x: number, y: number, getText: () => string | null | Promise<string | null>) => {
    clearTimer();
    const seq = ++seqRef.current;
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        // 取得の前に「読み込み中」を出す（本文が手元にある画面では一瞬で置き換わる）
        setState({ x, y, text: null, loading: true });
        let text: string | null = null;
        try {
          text = await getText();
        } catch {
          text = null;
        }
        if (seq !== seqRef.current) return; // 別のカードへ移った後なら捨てる
        const preview = toPreviewText(text);
        setState(preview ? { x, y, text: preview, loading: false } : null);
      })();
    }, HOVER_PREVIEW_DELAY_MS);
  };

  const bind: HoverPreviewApi['bind'] = (getText) => {
    if (!active) return {};
    return {
      onMouseEnter: (e: React.MouseEvent) => schedule(e.clientX, e.clientY, getText),
      // 出る前にカーソルが動いたら位置を追う（出た後は動かさない＝ちらつかせない）
      onMouseMove: (e: React.MouseEvent) => {
        if (timerRef.current === null) return;
        schedule(e.clientX, e.clientY, getText);
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
  // 画面端で見切れないよう、はみ出す側は反転させる
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const flipX = state.x + OFFSET + WIDTH > vw - 8;
  const flipY = state.y + OFFSET + MAX_HEIGHT > vh - 8;
  const left = flipX ? Math.max(8, state.x - OFFSET - WIDTH) : state.x + OFFSET;
  const top = flipY ? Math.max(8, state.y - OFFSET - MAX_HEIGHT) : state.y + OFFSET;

  return (
    <div
      data-hover-preview
      style={{
        position: 'fixed',
        left,
        top,
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
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
      {state.loading ? (
        <span style={{ color: 'var(--text-muted)' }}>読み込み中…</span>
      ) : (
        state.text
      )}
    </div>
  );
}
