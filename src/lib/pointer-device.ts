// 258: 「カーソルのある端末か」の判定を1箇所に集める。
//
// ── なぜUA判定をしないか ───────────────────────────────────
// 256のホバープレビューで既に採った方針と同じ。UA文字列は端末が増えるたびに破綻し、
// 「iPadOSはMacを名乗る」ような例外を追い続けることになる。
// 見たいのは端末名ではなく**入力手段**（カーソルがあるか・正確に指せるか）なので、
// CSSのメディア特性で聞く。
//
// ── 何に使うか ────────────────────────────────────────────
// - 256: ホバープレビューを出すか（カーソルが無い端末では出さない）
// - 258: 「📋 クリアして貼付」ボタンを出すか（iOSは押すと確認が何段も出るので出さない）
//        / 「貼り付けで置き換える」の**未設定時の既定**（カーソルの無い端末ではON）
//
// ── SSRとの付き合い方 ─────────────────────────────────────
// localStorage と同じで、matchMedia はクライアントでしか読めない。
// サーバーでは**カーソルあり（＝デスクトップ）**として扱う。デスクトップは現状維持が要件で、
// 変化するのはタッチ端末の側だけ——「消える」より「出てこない」方が事故が小さい。

import { useEffect, useState } from 'react';

/** カーソルがあり、正確に指せる端末（＝マウス・トラックパッド） */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * カーソルのある端末か。matchMedia が使えない環境（SSR・古いブラウザ）は true を返す
 * ＝ デスクトップ扱い（現状維持）。
 */
export function hasFinePointer(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(FINE_POINTER_QUERY).matches;
  } catch {
    return true;
  }
}

/** カーソルの無い端末（スマホ・タブレット）か */
export function isCoarsePointer(): boolean {
  return !hasFinePointer();
}

/**
 * 画面から使う版。SSRとの描画差異を作らないため、確定するまで mounted=false を返す
 * （呼び出し側は mounted を見てから出し分ける）。端末の向き変更・外付けマウス接続でも
 * 追随するよう、メディアクエリの変化を購読する。
 */
export function useFinePointer(): { fine: boolean; mounted: boolean } {
  const [fine, setFine] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let mql: MediaQueryList | null = null;
    const update = () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFine(hasFinePointer());
    };
    update();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      mql = window.matchMedia(FINE_POINTER_QUERY);
      mql.addEventListener('change', update);
    } catch {
      mql = null;
    }
    return () => mql?.removeEventListener('change', update);
  }, []);

  return { fine, mounted };
}
