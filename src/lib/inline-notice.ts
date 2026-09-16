// 333: 画面内（in-flow）の案内帯の判断を1箇所に集める（R-133 の横展開・純関数＝単体テストで機械判定できる）。
//
// ── なぜ in-flow なのか ────────────────────────────────────
// 共通トースト（`components/ui/Toast.tsx`）は `position: fixed` で画面の右下に出る。
// 332で、iPhone幅では操作行に重なって**ボタンが押せなくなる**ことが実測で分かり、
// 「警告・案内は操作要素に重ねない」を R-133 として台帳に入れた。
// 333ではその横展開として、案内が下部の要素に重なりうる画面（📚画像ギャラリー・🗂保存一覧・
// マンダラ詳細）を、同じ in-flow の帯に寄せる。浮かせない＝出ても何も覆わない。
//
// ── 自動で消すかどうか（332の判断を踏襲）────────────────
// 成功だけ数秒で消す（覆っていないので消えて困らない）。警告・エラーは**自分で閉じるまで残す**
// ——読み終える前に消えるのが一番困るため。

export type InlineNoticeKind = 'success' | 'warning' | 'error' | 'info';

export interface InlineNoticeState {
  text: string;
  kind: InlineNoticeKind;
}

/** 成功の帯が自動的に消えるまで(ms)。警告・エラー・情報は消さない */
export const INLINE_NOTICE_SUCCESS_MS = 3000;

/** 自動で消してよいか（成功だけ）。消す＝覆っていないことが前提（R-133） */
export function inlineNoticeAutoDismissMs(kind: InlineNoticeKind): number | null {
  return kind === 'success' ? INLINE_NOTICE_SUCCESS_MS : null;
}

/** 帯の見た目（トーストと同じ配色＝同じ意味の色が画面で食い違わない） */
export const INLINE_NOTICE_ICON: Record<InlineNoticeKind, string> = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: '💬',
};

export const INLINE_NOTICE_COLOR: Record<InlineNoticeKind, string> = {
  success: '#1D9E75',
  warning: '#B45309',
  error: '#ef4444',
  info: '#378ADD',
};

export const INLINE_NOTICE_BG: Record<InlineNoticeKind, string> = {
  success: 'rgba(29,158,117,0.12)',
  warning: 'rgba(239,159,39,0.12)',
  error: 'rgba(239,68,68,0.12)',
  info: 'rgba(55,138,221,0.12)',
};
