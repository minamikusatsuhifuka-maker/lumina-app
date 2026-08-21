import type { CSSProperties } from 'react';

// 249: カスタムフォルダの見た目を1箇所に集める（保存一覧・AI参照素材で同一）。
//
// 自動カテゴリ（📁・多色パレット）と視覚的に混ざらないよう、カスタムフォルダは
// お気に入りと同じ金色系で**単色**に統一する。色でフォルダを見分けるのではなく、
// 「金色＝院長が自分で入れたフォルダ」と読めることを優先した。
//
// 配色は両テーマ共通の固定色。明るい塗り（#fef3c7）に濃い文字（#92400e）で
// コントラスト比 6.37:1（WCAG AA の 4.5:1 を満たす・R-43）。

export const FOLDER_ACCENT = '#f59e0b';
export const FOLDER_BADGE_BG = '#fef3c7';
export const FOLDER_BADGE_FG = '#92400e';

/** カード上の所属フォルダバッジ */
export const FOLDER_BADGE_STYLE: CSSProperties = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 999,
  background: FOLDER_BADGE_BG,
  color: FOLDER_BADGE_FG,
  border: `1px solid ${FOLDER_ACCENT}`,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

/** フォルダ絞り込みカード（自動カテゴリの categoryCardStyle と同じ体裁） */
export function folderCardStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? FOLDER_ACCENT : 'var(--border)'}`,
    background: active ? 'rgba(245,158,11,0.12)' : 'var(--bg-card)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: 0,
  };
}
