import type { CSSProperties } from 'react';

// 297: 🎯用途カテゴリの見た目を1箇所に集める（3画面で同一）。
//
// ⭐マイフォルダ（金色 #f59e0b・📂）と一目で見分けるため、用途は**青緑（teal）単色・🎯**に統一する。
// 明るい塗り（#ccfbf1）に濃い文字（#115e59）でコントラスト比 7.9:1（WCAG AA 4.5:1 を満たす・R-43）。
// 「フォルダ」という語は用途カテゴリの画面文言に使わない（§3-1）。

export const PURPOSE_ACCENT = '#0d9488';
export const PURPOSE_BADGE_BG = '#ccfbf1';
export const PURPOSE_BADGE_FG = '#115e59';

/** カード上の所属用途バッジ */
export const PURPOSE_BADGE_STYLE: CSSProperties = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 999,
  background: PURPOSE_BADGE_BG,
  color: PURPOSE_BADGE_FG,
  border: `1px solid ${PURPOSE_ACCENT}`,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

/** 用途の絞り込みチップ（マイフォルダのカードと同じ体裁・色だけ変える） */
export function purposeChipStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? PURPOSE_ACCENT : 'var(--border)'}`,
    background: active ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: 0,
  };
}
