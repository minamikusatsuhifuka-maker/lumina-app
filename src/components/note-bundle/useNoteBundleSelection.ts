'use client';

// 180: note記事まとめ生成の横断選択ストア（🧠AI参照素材 / 🗂テキスト分析の両一覧で共用）。
// /dashboard/saved は両パネルを display:none で同時マウントするため、
// コンポーネントローカルの state ではタブまたぎの選択保持ができない。
// → モジュールレベルのストア + useSyncExternalStore で、タブ・ページまたぎで選択を共有する。

import { useSyncExternalStore } from 'react';
import {
  MAX_BUNDLE_SOURCES,
  makeBundleKey,
  type BundleSource,
} from '@/lib/note-bundle';

export interface BundleSelectedItem {
  source: BundleSource;
  id: number;
  topic: string;
}

interface BundleSelectionState {
  selectMode: boolean;
  // key = makeBundleKey(source,id)。挿入順を保つ（選択順で表示）
  items: ReadonlyMap<string, BundleSelectedItem>;
  // 187: 最後にチェック操作したカードのキー（「→次へ」ボタンをそのカード直下に追従させる）
  lastToggledKey: string | null;
}

let state: BundleSelectionState = { selectMode: false, items: new Map(), lastToggledKey: null };
const listeners = new Set<() => void>();

function emit(next: BundleSelectionState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BundleSelectionState {
  return state;
}

// 選択トグル。上限（両ソース合計）超過時は 'limit' を返し、呼び出し側が各自のトーストで通知する。
export function toggleBundleItem(item: BundleSelectedItem): 'added' | 'removed' | 'limit' {
  const key = makeBundleKey(item.source, item.id);
  const next = new Map(state.items);
  if (next.has(key)) {
    next.delete(key);
    // 解除も「最後に操作したカード」（ボタンは常に最後に触ったカードの下へ・187）
    emit({ ...state, items: next, lastToggledKey: key });
    return 'removed';
  }
  if (next.size >= MAX_BUNDLE_SOURCES) return 'limit';
  next.set(key, item);
  emit({ ...state, items: next, lastToggledKey: key });
  return 'added';
}

export function setBundleSelectMode(on: boolean) {
  // モード終了時は選択もクリア（179の「✕選択をやめる」と同挙動）
  emit({ selectMode: on, items: on ? state.items : new Map(), lastToggledKey: on ? state.lastToggledKey : null });
}

export function clearBundleSelection() {
  emit({ ...state, items: new Map(), lastToggledKey: null });
}

export function useNoteBundleSelection() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const countBySource = (source: BundleSource) => {
    let n = 0;
    s.items.forEach((it) => {
      if (it.source === source) n++;
    });
    return n;
  };
  return {
    selectMode: s.selectMode,
    items: s.items,
    lastToggledKey: s.lastToggledKey,
    selectedList: Array.from(s.items.values()),
    isSelected: (source: BundleSource, id: number) => s.items.has(makeBundleKey(source, id)),
    countBySource,
    toggle: toggleBundleItem,
    setSelectMode: setBundleSelectMode,
    clear: clearBundleSelection,
  };
}
