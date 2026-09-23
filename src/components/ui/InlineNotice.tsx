'use client';

// 333: 画面内（in-flow）の案内帯。R-133 の共通部品。
//
// - 332で🗂テキスト分析の操作行の下に置いたものを部品に切り出し（R-91）、
//   📚画像ギャラリー・🗂保存一覧・マンダラ詳細でも同じものを使う。
// - `position` は static のまま＝**何も覆わない**。出ると下の要素が押し下がるだけ。
// - ✕ で閉じられる。成功だけ数秒で自動的に消す（lib/inline-notice.ts の判断）。
// - 338/R-137: 出てもスクロール位置を変えない。333 で付けていた「出たときに画面内へ寄せる」動きは、長い一覧の途中で
//   📋 コピーを押すと画面が一覧の先頭へ飛ぶ原因になった（院長の実測 2026/9/24）。操作の結果は押した場所で知らせ、
//   帯は「見に行けば読める」だけの存在にする（focus() も呼ばない）。
// - `useInlineNotice()` は共通トーストの `showToast(message, type)` と**同じ呼び出し方**を返すので、
//   画面側は呼び出し箇所を書き換えずに置き換えられる（R-88: ハンドラを複製しない）。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INLINE_NOTICE_BG,
  INLINE_NOTICE_COLOR,
  INLINE_NOTICE_ICON,
  inlineNoticeAutoDismissMs,
  type InlineNoticeKind,
  type InlineNoticeState,
} from '@/lib/inline-notice';

export function useInlineNotice(): {
  notice: InlineNoticeState | null;
  /** 共通トーストと同じ signature（置き換えても呼び出し側を書き換えずに済む） */
  showToast: (message: string, type?: InlineNoticeKind) => void;
  clearNotice: () => void;
} {
  const [notice, setNotice] = useState<InlineNoticeState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearNotice = useCallback(() => setNotice(null), []);
  const showToast = useCallback((message: string, type: InlineNoticeKind = 'success') => {
    setNotice({ text: message, kind: type });
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!notice) return;
    const ms = inlineNoticeAutoDismissMs(notice.kind);
    if (ms === null) return;
    timerRef.current = window.setTimeout(() => setNotice(null), ms);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [notice]);

  return { notice, showToast, clearNotice };
}

export default function InlineNotice({
  notice,
  onClose,
  marker,
  style,
}: {
  notice: InlineNoticeState | null;
  onClose: () => void;
  /** E2E・CSS の目印（画面ごとに変える。既定は共通の目印だけ） */
  marker?: string;
  style?: React.CSSProperties;
}) {
  if (!notice) return null;
  const color = INLINE_NOTICE_COLOR[notice.kind];
  return (
    <div
      data-inline-notice={marker ?? '1'}
      data-inline-notice-kind={notice.kind}
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: INLINE_NOTICE_BG[notice.kind],
        border: `1px solid ${color}40`,
        color,
        ...style,
      }}
    >
      <span style={{ flexShrink: 0 }}>{INLINE_NOTICE_ICON[notice.kind]}</span>
      <span style={{ minWidth: 0, flex: 1 }}>{notice.text}</span>
      <button
        type="button"
        data-inline-notice-close
        onClick={onClose}
        title="この案内を閉じます"
        aria-label="案内を閉じる"
        style={{
          flexShrink: 0,
          padding: '0 6px',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'inherit',
          background: 'transparent',
          border: '1px solid currentColor',
          borderRadius: 6,
          opacity: 0.7,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}
