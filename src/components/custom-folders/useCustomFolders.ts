'use client';

// 249: カスタムフォルダ（院長が名前を付けるお気に入りの分類）のクライアント状態。
// 📁保存一覧（scope='text_analysis'）と 🧠AI参照素材（scope='context'）で共用する。
// scope が違えばフォルダ体系は完全に別（APIがscopeで分けている）。

import { useCallback, useEffect, useState } from 'react';
import type { CustomFolder, FolderScope } from '@/lib/custom-folders';

export type { CustomFolder, FolderScope };

/** フォルダ絞り込みの選択値。null=絞り込みなし / 'unfiled'=お気に入りの未分類 / number=フォルダID */
export type FolderFilter = number | 'unfiled' | null;

export interface UseCustomFoldersResult {
  folders: CustomFolder[];
  /** お気に入りの総件数（フォルダ有無を問わない） */
  favoriteTotal: number;
  /** お気に入りだがどのフォルダにも入っていない件数 */
  unfiledFavoriteCount: number;
  loading: boolean;
  reload: () => Promise<void>;
  createFolder: (name: string) => Promise<CustomFolder | null>;
  renameFolder: (id: number, name: string) => Promise<boolean>;
  deleteFolder: (id: number) => Promise<boolean>;
  /** 並び替え（表示順のID配列をそのまま渡す） */
  reorderFolders: (ids: number[]) => Promise<boolean>;
  /** 記事の所属を folderIds の内容に置き換える（追加・変更・全解除の共通口） */
  assignItem: (itemId: number, folderIds: number[]) => Promise<boolean>;
}

/**
 * @param scope フォルダ体系の分離キー
 * @param onError 失敗時のメッセージ通知（各画面のトーストに流す）
 */
export function useCustomFolders(
  scope: FolderScope,
  onError?: (message: string) => void,
): UseCustomFoldersResult {
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [favoriteTotal, setFavoriteTotal] = useState(0);
  const [unfiledFavoriteCount, setUnfiledFavoriteCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const notify = useCallback(
    (message: string) => {
      if (onError) onError(message);
    },
    [onError],
  );

  const applySummary = useCallback(
    (data: {
      folders?: CustomFolder[];
      favorite_total?: number;
      unfiled_favorite_count?: number;
    }) => {
      if (Array.isArray(data.folders)) setFolders(data.folders);
      if (typeof data.favorite_total === 'number') setFavoriteTotal(data.favorite_total);
      if (typeof data.unfiled_favorite_count === 'number') {
        setUnfiledFavoriteCount(data.unfiled_favorite_count);
      }
    },
    [],
  );

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/custom-folders?scope=${scope}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applySummary(await res.json());
    } catch {
      // フォルダが取れなくても記事一覧は使えるため、ここでは黙って空のままにする
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [scope, applySummary]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createFolder = useCallback(
    async (name: string): Promise<CustomFolder | null> => {
      try {
        const res = await fetch('/api/custom-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notify(data?.error || 'フォルダを作成できませんでした');
          return null;
        }
        const folder = data.folder as CustomFolder;
        setFolders((prev) => [...prev, { ...folder, count: 0 }]);
        return folder;
      } catch {
        notify('フォルダを作成できませんでした');
        return null;
      }
    },
    [scope, notify],
  );

  const renameFolder = useCallback(
    async (id: number, name: string): Promise<boolean> => {
      const before = folders;
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
      try {
        const res = await fetch('/api/custom-folders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, action: 'rename', id, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setFolders(before);
          notify(data?.error || 'フォルダ名を変更できませんでした');
          return false;
        }
        return true;
      } catch {
        setFolders(before);
        notify('フォルダ名を変更できませんでした');
        return false;
      }
    },
    [scope, folders, notify],
  );

  const deleteFolder = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const res = await fetch(`/api/custom-folders?scope=${scope}&id=${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          notify(data?.error || 'フォルダを削除できませんでした');
          return false;
        }
        setFolders((prev) => prev.filter((f) => f.id !== id));
        // 削除で「未分類」に戻る記事があるため件数を取り直す
        void reload();
        return true;
      } catch {
        notify('フォルダを削除できませんでした');
        return false;
      }
    },
    [scope, notify, reload],
  );

  const reorderFolders = useCallback(
    async (ids: number[]): Promise<boolean> => {
      const before = folders;
      const byId = new Map(folders.map((f) => [f.id, f]));
      setFolders(ids.map((id) => byId.get(id)).filter((f): f is CustomFolder => !!f));
      try {
        const res = await fetch('/api/custom-folders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, action: 'reorder', ids }),
        });
        if (!res.ok) {
          setFolders(before);
          notify('並び順を変更できませんでした');
          return false;
        }
        return true;
      } catch {
        setFolders(before);
        notify('並び順を変更できませんでした');
        return false;
      }
    },
    [scope, folders, notify],
  );

  const assignItem = useCallback(
    async (itemId: number, folderIds: number[]): Promise<boolean> => {
      try {
        const res = await fetch('/api/custom-folders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, action: 'assign', itemId, folderIds }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notify(data?.error || '分類を保存できませんでした');
          return false;
        }
        // サーバーが返す最新の件数でフォルダ一覧を同期する
        applySummary(data);
        return true;
      } catch {
        notify('分類を保存できませんでした');
        return false;
      }
    },
    [scope, notify, applySummary],
  );

  return {
    folders,
    favoriteTotal,
    unfiledFavoriteCount,
    loading,
    reload,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    assignItem,
  };
}
