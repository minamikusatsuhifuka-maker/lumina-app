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

/** 246: 他の浮遊ボタン（48px）より一回り大きくして目立たせる。モバイルのタップ域も余裕を持たせる */
const BUTTON_SIZE = 52;

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
      className="lumina-fab-in"
      style={{
        position: 'fixed',
        right: 16,
        bottom,
        zIndex: 9998,
        // 246: 他の浮遊ボタン（48px）より一回り大きく。段の間隔は56pxなので重ならない
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        // 246: 背景をブランド色の**単色**に。💬アシスタントは紫のグラデーションなので、
        // 隣り合っても「単色 vs グラデ」＋サイズ差で見分けられる。
        // var(--accent) はテーマごとに定義済み（dark #6c63ff / light #5b52e8 / midnight #8b5cf6）
        background: 'var(--accent, #6c63ff)',
        // 白の細いリングで、明るい背景でも暗い背景でも輪郭が立つ
        border: '2px solid rgba(255,255,255,0.3)',
        color: '#fff',
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 影を強めて浮き上がらせる（内側の1pxは輪郭の締め）
        boxShadow: '0 6px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.42), 0 0 0 1px rgba(0,0,0,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)';
      }}
    >
      ↑
    </button>
  );
}
