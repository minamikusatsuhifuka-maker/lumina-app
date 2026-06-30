import type { CSSProperties } from 'react';

// テキスト分析（SavedAnalysisList）とコンテキストライブラリ（ContextLibraryPanel）の
// 保存カード操作ボタン共通の見た目。両画面で同一スタイルを保ち、将来のズレを防ぐため共通化。
// （旧 SavedAnalysisList.listBtnStyle と同一値）
export function cardActionBtnStyle(): CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };
}
