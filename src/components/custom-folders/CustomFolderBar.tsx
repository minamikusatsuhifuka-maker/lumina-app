'use client';

// 249: マイフォルダの一覧・絞り込み・管理（リネーム／削除／並び替え）。
// 📁保存一覧と🧠AI参照素材で共用し、体裁は既存の「カテゴリ概覧」に合わせる。
//
// 自動カテゴリ（AIが決める・1件1つ）とは別軸。ここに出るのは院長が作ったフォルダだけで、
// 記事は複数のフォルダに同時に属せる。

import { useEffect, useState } from 'react';
import type { CustomFolder, FolderFilter, FolderScope } from './useCustomFolders';
import { FOLDER_ACCENT, folderCardStyle } from './folderStyles';

interface Props {
  /** どちらの画面のフォルダ体系か（/dashboard/saved は両パネルを display:none で同時に持つため識別が要る） */
  scope: FolderScope;
  folders: CustomFolder[];
  favoriteTotal: number;
  unfiledFavoriteCount: number;
  value: FolderFilter;
  onChange: (next: FolderFilter) => void;
  onCreate: (name: string) => Promise<CustomFolder | null>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onReorder: (ids: number[]) => Promise<boolean>;
  /** 開閉状態の記憶キー（画面ごとに別） */
  storageKey: string;
}

export default function CustomFolderBar({
  scope,
  folders,
  favoriteTotal,
  unfiledFavoriteCount,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  storageKey,
}: Props) {
  // 既定は開く（フォルダを作った院長がすぐ使えるように）。開閉は localStorage で記憶する
  const [open, setOpen] = useState(true);
  const [manageMode, setManageMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // 初期値をレンダー時に localStorage から読むとSSRとズレる（ハイドレーション不一致）ため、
      // 既存の開閉記憶（カテゴリ概覧・cl_category_open）と同じくマウント後に1回だけ反映する
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setOpen(saved === '1');
    } catch {
      /* localStorage が使えない環境では既定のまま */
    }
  }, [storageKey]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* 記憶できなくても開閉自体は動く */
      }
      return next;
    });
  };

  const commitRename = async (id: number) => {
    const name = editingValue.trim();
    setEditingId(null);
    const current = folders.find((f) => f.id === id);
    if (!name || !current || name === current.name) return;
    await onRename(id, name);
  };

  const handleDelete = async (folder: CustomFolder) => {
    const ok = window.confirm(
      `フォルダ「${folder.name}」を削除します。\n\n` +
        `記事そのものは消えません（このフォルダの分類が外れるだけで、お気に入りのままです）。\n` +
        `よろしいですか？`,
    );
    if (!ok) return;
    const done = await onDelete(folder.id);
    // 見ていたフォルダを消したら絞り込みを解除する（空の一覧に取り残されないように）
    if (done && value === folder.id) onChange(null);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= folders.length) return;
    const ids = folders.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await onReorder(ids);
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const created = await onCreate(name);
    setCreating(false);
    if (created) setNewName('');
  };

  return (
    <div
      data-custom-folder-bar={scope}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <style>{`
        .cf-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        @media (max-width: 640px) {
          .cf-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          ⭐ マイフォルダ（自分で付けた分類）
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            data-folder-manage-toggle
            onClick={() => {
              setManageMode((v) => !v);
              setEditingId(null);
            }}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${manageMode ? FOLDER_ACCENT : 'var(--border)'}`,
              background: manageMode ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: manageMode ? FOLDER_ACCENT : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="フォルダ名の変更・削除・並び替え"
          >
            🛠 フォルダを管理
          </button>
          <button
            type="button"
            data-folder-bar-toggle
            onClick={toggleOpen}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {open ? '▲ 閉じる' : `▼ 開く（${folders.length}）`}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="cf-grid">
            <button
              type="button"
              data-folder-filter="all-favorites"
              onClick={() => onChange(null)}
              style={folderCardStyle(value === null)}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>⭐</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  flex: 1,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                絞り込みなし
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: FOLDER_ACCENT }}>
                {favoriteTotal}
              </span>
            </button>

            <button
              type="button"
              data-folder-filter="unfiled"
              onClick={() => onChange(value === 'unfiled' ? null : 'unfiled')}
              style={folderCardStyle(value === 'unfiled')}
              title="お気に入りだが、どのフォルダにも入れていないもの"
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>🗂</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  flex: 1,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                お気に入り（未分類）
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: FOLDER_ACCENT }}>
                {unfiledFavoriteCount}
              </span>
            </button>

            {folders.map((folder, index) => {
              const active = value === folder.id;
              const isEditing = editingId === folder.id;
              return (
                <div
                  key={folder.id}
                  data-folder-card={folder.id}
                  onClick={() => {
                    if (!isEditing) onChange(active ? null : folder.id);
                  }}
                  style={folderCardStyle(active)}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>📂</span>
                  {isEditing ? (
                    <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        data-folder-rename-input
                        value={editingValue}
                        maxLength={30}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(folder.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => void commitRename(folder.id)}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: `1px solid ${FOLDER_ACCENT}`,
                          borderRadius: 4,
                          outline: 'none',
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        flex: 1,
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {folder.name}
                    </span>
                  )}

                  {manageMode && !isEditing && (
                    <span
                      style={{ display: 'flex', gap: 2, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-folder-move-up={folder.id}
                        onClick={() => void move(index, -1)}
                        disabled={index === 0}
                        title="上へ"
                        style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        data-folder-move-down={folder.id}
                        onClick={() => void move(index, 1)}
                        disabled={index === folders.length - 1}
                        title="下へ"
                        style={{
                          ...iconBtn,
                          opacity: index === folders.length - 1 ? 0.3 : 1,
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        data-folder-rename={folder.id}
                        onClick={() => {
                          setEditingId(folder.id);
                          setEditingValue(folder.name);
                        }}
                        title="名前を変更"
                        style={iconBtn}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        data-folder-delete={folder.id}
                        onClick={() => void handleDelete(folder)}
                        title="このフォルダを削除（記事は消えません）"
                        style={iconBtn}
                      >
                        🗑
                      </button>
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: FOLDER_ACCENT,
                      flexShrink: 0,
                    }}
                  >
                    {folder.count}
                  </span>
                </div>
              );
            })}
          </div>

          {manageMode && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                data-folder-bar-new-name
                value={newName}
                maxLength={30}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitNew();
                  }
                }}
                placeholder="新しいフォルダ名"
                style={{
                  width: 200,
                  padding: '6px 8px',
                  fontSize: 11,
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                data-folder-bar-create
                onClick={() => void submitNew()}
                disabled={!newName.trim() || creating}
                style={{
                  fontSize: 11,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${newName.trim() ? FOLDER_ACCENT : 'var(--border)'}`,
                  background: newName.trim() ? FOLDER_ACCENT : 'transparent',
                  color: newName.trim() ? '#fff' : 'var(--text-muted)',
                  cursor: newName.trim() && !creating ? 'pointer' : 'default',
                  fontWeight: 600,
                }}
              >
                {creating ? '作成中…' : '＋ フォルダを作成'}
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                削除しても記事は消えません（分類が外れるだけ）
              </span>
            </div>
          )}

          {folders.length === 0 && !manageMode && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              まだフォルダがありません。記事の「☆ お気に入り」から、または「🛠
              フォルダを管理」から作成できます。
            </div>
          )}
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '2px 3px',
  fontSize: 11,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'var(--text-muted)',
};
