'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「トップへ戻る」追従ボタン（指示書243②）
//
// 置き場所: 浮遊ボタン（📖📝💬）と同じ右下の縦一列。**常に一番上の段**に置く。
//   → スクロールで出入りしても、下にある浮遊ボタンの位置がずれない。
//
// スクロール対象の注意: dashboard は `.dashboard-main` が overflowY:auto で、
// ページ全体（window）ではなくこの要素がスクロールする画面がある。
// 一方 admin/staff など window スクロールの画面もあるため、**両方**を見る/両方を戻す。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';
import { useFloatingSlot, floatingBottom } from '@/components/ThemeProvider';

/** これ以上スクロールしたら表示する（最上部では出さない） */
const SHOW_AFTER_PX = 300;

// dashboard / admin / staff とも <main> が overflowY:auto。ここが実際のスクロール要素になる
function getScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('main');
}

/**
 * standalone: 浮遊ボタン（📖📝💬）が存在しない画面（admin / staff）で使う。
 * 段を数えず常に最下段へ置く。
 */
export function BackToTopButton({ standalone = false }: { standalone?: boolean }) {
  const slotBottom = useFloatingSlot('backToTop');
  const bottom = standalone ? floatingBottom(0) : slotBottom;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scroller = getScroller();
    const update = () => {
      const y = Math.max(window.scrollY || 0, scroller?.scrollTop ?? 0);
      setVisible(y > SHOW_AFTER_PX);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    scroller?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      scroller?.removeEventListener('scroll', update);
    };
  }, []);

  if (!visible) return null;

  const toTop = () => {
    // どちらがスクロールしていても最上部へ戻せるよう両方に指示する
    window.scrollTo({ top: 0, behavior: 'smooth' });
    getScroller()?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={toTop}
      aria-label="ページの先頭へ戻る"
      title="トップへ戻る"
      style={{
        position: 'fixed',
        right: 16,
        bottom,
        zIndex: 9998,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: '1px solid var(--border-accent, rgba(108,99,255,0.3))',
        background: 'var(--bg-secondary, #1a1a2e)',
        color: 'var(--text-primary, #fff)',
        fontSize: 20,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        transition: 'all 0.2s',
      }}
    >
      ↑
    </button>
  );
}
