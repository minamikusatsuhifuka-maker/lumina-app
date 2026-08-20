// 247: 生成結果の自動ストック保存の設定（既定ON）。
//
// 方針:
// - 対象は院長指定の2画面のみ: 📝テキスト分析 と 🔭ディープリサーチ。
//   「生成したら勝手にDBへ書く」を全画面に広げない（CLAUDE.md の原則の例外として、
//   対象を絞ったうえで設定でOFFにできる形にしてある）。
// - 保存先は手動の「💾ストック保存」とまったく同じ場所・同じAPI。区別しない（院長指示）。
// - 保存はテーマ・文字サイズ・追従ボタンと同じ localStorage（このブラウザ単位）。
// - 失敗しても生成結果は画面に残す（R-39）。画面側が ⚠️＋手動再試行を出す。

import { useCallback, useEffect, useState } from 'react';

export const AUTO_STOCK_KEY = 'lumina_auto_stock_save';
// 設定変更を同一タブ内の購読者へ即時通知するためのイベント（shortcuts.ts と同方式）
export const AUTO_STOCK_EVENT = 'auto-stock-save-change';

/** 既定ON（'0' が保存されているときのみOFF） */
export function isAutoStockSaveEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_STOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoStockSaveEnabled(on: boolean) {
  try {
    localStorage.setItem(AUTO_STOCK_KEY, on ? '1' : '0');
  } catch {
    // 保存失敗時もタブ内の挙動は揃える（イベントは飛ばす）
  }
  window.dispatchEvent(new CustomEvent(AUTO_STOCK_EVENT, { detail: { enabled: on } }));
}

/**
 * 設定画面用。SSRとの描画差異を作らないため、確定するまで mounted=false を返す
 * （呼び出し側は mounted で「読み込み中…」を出す）。
 */
export function useAutoStockSave(): {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  mounted: boolean;
} {
  const [enabled, setEnabledState] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabledState(isAutoStockSaveEnabled());
    setMounted(true);
    const onChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabledState(on);
    };
    window.addEventListener(AUTO_STOCK_EVENT, onChange);
    return () => window.removeEventListener(AUTO_STOCK_EVENT, onChange);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setAutoStockSaveEnabled(on);
  }, []);

  return { enabled, setEnabled, mounted };
}
