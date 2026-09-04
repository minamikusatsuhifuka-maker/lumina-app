'use client';

// 297: 🎯用途カテゴリのクライアント状態（3画面で共用・体系は1つ）。
// マイフォルダの useCustomFolders と同じ形（一覧・作成・リネーム・削除・所属の置き換え）にして
// 画面側の書き方を揃える。API は /api/purpose-categories（マイフォルダとは別）。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemScope, PurposeCategory } from '@/lib/purpose-categories';

export type { PurposeCategory };

/** 用途の絞り込みの選択値。null=絞り込みなし / number=カテゴリID */
export type PurposeFilter = number | null;

export interface UsePurposeCategoriesResult {
  categories: PurposeCategory[];
  loading: boolean;
  reload: () => Promise<void>;
  createCategory: (name: string) => Promise<PurposeCategory | null>;
  renameCategory: (id: number, name: string) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<boolean>;
  /** 記事の所属を categoryIds の内容に置き換える（追加・変更・全解除の共通口） */
  assignItem: (itemId: number | string, categoryIds: number[]) => Promise<boolean>;
}

export function usePurposeCategories(scope: ItemScope, onError?: (message: string) => void): UsePurposeCategoriesResult {
  const [categories, setCategories] = useState<PurposeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  // 一覧の更新は「最後に投げた要求の応答」だけを採用する。チェック→新規作成→追加チェックのように連続で保存すると、
  // 先に投げた assign の応答（新しいカテゴリを含まない一覧）が後から届いて新しい一覧を上書きし、バッジが消える（C105 で実測）
  const seq = useRef(0);
  const adopt = useCallback((my: number, list: unknown) => {
    if (my === seq.current && Array.isArray(list)) setCategories(list as PurposeCategory[]);
  }, []);

  const notify = useCallback((message: string) => { if (onError) onError(message); }, [onError]);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await fetch(`/api/purpose-categories?scope=${scope}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      adopt(my, data.categories);
    } catch {
      // 用途が取れなくても記事一覧は使える（付加情報の失敗で本体を壊さない・R-39）
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [scope, adopt]);

  useEffect(() => { void reload(); }, [reload]);

  const createCategory = useCallback(async (name: string): Promise<PurposeCategory | null> => {
    try {
      const res = await fetch('/api/purpose-categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '作成に失敗しました');
      await reload();
      return data.category as PurposeCategory;
    } catch (e) {
      notify(e instanceof Error ? e.message : '作成に失敗しました');
      return null;
    }
  }, [reload, notify]);

  const renameCategory = useCallback(async (id: number, name: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/purpose-categories', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', id, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '名前の変更に失敗しました');
      await reload();
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : '名前の変更に失敗しました');
      return false;
    }
  }, [reload, notify]);

  const deleteCategory = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/purpose-categories?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '削除に失敗しました');
      await reload();
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : '削除に失敗しました');
      return false;
    }
  }, [reload, notify]);

  const assignItem = useCallback(async (itemId: number | string, categoryIds: number[]): Promise<boolean> => {
    const my = ++seq.current;
    try {
      const res = await fetch('/api/purpose-categories', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', scope, itemId, categoryIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '用途の保存に失敗しました');
      adopt(my, data.categories);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : '用途の保存に失敗しました');
      return false;
    }
  }, [scope, notify, adopt]);

  return { categories, loading, reload, createCategory, renameCategory, deleteCategory, assignItem };
}
