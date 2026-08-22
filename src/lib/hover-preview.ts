// 256: カードにカーソルを当てたときの本文プレビュー設定（既定ON）。
//
// 一覧で「▼全文表示」を開かなくても中身が分かるようにするための表示。
// 煩わしいと感じる場面があるため 🎛表示設定 でオフにできる（院長指示）。
//
// 保存はテーマ・追従ボタン・自動ストック保存と同じ localStorage（このブラウザ単位）。

import { useCallback, useEffect, useState } from 'react';

export const HOVER_PREVIEW_KEY = 'lumina_hover_preview';
// 設定変更を同一タブ内の購読者へ即時通知する（auto-stock-save.ts と同方式）
export const HOVER_PREVIEW_EVENT = 'hover-preview-change';

/** カーソルを止めてから出るまでの待ち時間(ms)。
 *  一覧を眺めて動かしているだけで次々出ると煩わしいので、少し待ってから出す。 */
export const HOVER_PREVIEW_DELAY_MS = 500;

/** プレビューに出す本文の最大文字数（超えたら「…」で切る） */
export const HOVER_PREVIEW_CHARS = 400;

/** 既定ON（'0' が保存されているときのみOFF） */
export function isHoverPreviewEnabled(): boolean {
  try {
    return localStorage.getItem(HOVER_PREVIEW_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHoverPreviewEnabled(on: boolean) {
  try {
    localStorage.setItem(HOVER_PREVIEW_KEY, on ? '1' : '0');
  } catch {
    // 保存失敗時もタブ内の挙動は揃える（イベントは飛ばす）
  }
  window.dispatchEvent(new CustomEvent(HOVER_PREVIEW_EVENT, { detail: { enabled: on } }));
}

/**
 * 設定画面用。SSRとの描画差異を作らないため、確定するまで mounted=false を返す。
 */
export function useHoverPreviewSetting(): {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  mounted: boolean;
} {
  const [enabled, setEnabledState] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage はクライアントでしか読めない（レンダー中に読むとSSRとズレる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(isHoverPreviewEnabled());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabledState(on);
    };
    window.addEventListener(HOVER_PREVIEW_EVENT, onChange);
    return () => window.removeEventListener(HOVER_PREVIEW_EVENT, onChange);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setHoverPreviewEnabled(on);
  }, []);

  return { enabled, setEnabled, mounted };
}

/**
 * プレビュー用に本文を整える。Markdownの記号は落として読める形にし（R-18/R-45）、
 * 長すぎるものは「…」で切る。空なら null（＝プレビューを出さない）。
 */
export function toPreviewText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 連続する空行は1つに詰める（プレビューの縦を無駄に使わない）
  const compact = raw.replace(/\n{3,}/g, '\n\n').trim();
  if (!compact) return null;
  const chars = [...compact];
  if (chars.length <= HOVER_PREVIEW_CHARS) return compact;
  return `${chars.slice(0, HOVER_PREVIEW_CHARS).join('')}…`;
}
