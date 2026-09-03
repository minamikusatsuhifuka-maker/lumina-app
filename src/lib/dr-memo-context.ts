// 208（案A）: 「今開いているリサーチのお題」を追従カテゴリメモに渡す小さな受け渡し口。
//
// 追従ボタンはダッシュボード共通の段組み（useFloatingSlot）に載るため、部品はレイアウト側（FloatingToolbar）に
// 1つだけ置く。ディープリサーチ画面はマウント中だけここへお題を書き、離れたら null に戻す。
// パネルは保存時に読むだけ（購読はボタン脇の表示用）。React の state ではなくモジュール変数＋イベントで
// 持つのは、ページと共通部品の間に Provider を増やさないため。

import { normalizeContextRef } from '@/lib/dr-memo';

const EVENT = 'lumina:drmemo-context';
let current: string | null = null;

export function setDrMemoContext(topic: string | null | undefined): void {
  const v = normalizeContextRef(topic);
  if (v === current) return;
  current = v;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

export function getDrMemoContext(): string | null {
  return current;
}

export function subscribeDrMemoContext(cb: (value: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb(current);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
