'use client';

// 249: 「☆お気に入り」から開く分類パネル。
// 既存フォルダの複数選択・その場での新規作成・お気に入り解除をこの1枚で行う。
// チェックした時点で保存する（保存ボタンを押し忘れて分類が消えるのを避ける）。
//
// `.page-enter` の transform 配下では position:fixed が効かないため createPortal で body に出す（R-19）。

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CustomFolder } from './useCustomFolders';
import { FOLDER_BADGE_STYLE } from './folderStyles';

interface Props {
  /** 開いた元のボタン（この矩形に合わせて表示位置を決める） */
  anchorRect: DOMRect | null;
  folders: CustomFolder[];
  /** いま選択されているフォルダID */
  selectedIds: number[];
  /** その記事がお気に入りかどうか（解除ボタンの表示切替） */
  isFavorite: boolean;
  onChange: (folderIds: number[]) => void;
  onCreate: (name: string) => Promise<CustomFolder | null>;
  onUnfavorite: () => void;
  onClose: () => void;
}

const PANEL_WIDTH = 260;

export default function FolderPickerPopover({
  anchorRect,
  folders,
  selectedIds,
  isFavorite,
  onChange,
  onCreate,
  onUnfavorite,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape で閉じる（クリック外は下の透明オーバーレイで拾う）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined' || !anchorRect) return null;

  // 画面内に収める（右端・下端をはみ出す場合は内側へ寄せる）
  const margin = 8;
  const left = Math.max(
    margin,
    Math.min(anchorRect.left, window.innerWidth - PANEL_WIDTH - margin),
  );
  const estimatedHeight = 320;
  const openUpward =
    anchorRect.bottom + estimatedHeight + margin > window.innerHeight &&
    anchorRect.top > estimatedHeight + margin;
  const top = openUpward
    ? Math.max(margin, anchorRect.top - estimatedHeight - 6)
    : anchorRect.bottom + 6;

  const toggle = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const created = await onCreate(name);
    setCreating(false);
    if (created) {
      setNewName('');
      // 作ったフォルダにそのまま入れる（作成→選択の二度手間を避ける）
      onChange([...selectedIds, created.id]);
    }
  };

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
      />
      <div
        ref={panelRef}
        data-folder-picker
        style={{
          position: 'fixed',
          top,
          left,
          width: PANEL_WIDTH,
          maxHeight: estimatedHeight,
          overflowY: 'auto',
          zIndex: 9999,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          ⭐ マイフォルダに分類
        </div>

        {folders.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            まだフォルダがありません。下の欄に名前を入れて作成すると、ここから選べるようになります。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {folders.map((f) => {
              const checked = selectedIds.includes(f.id);
              return (
                <label
                  key={f.id}
                  data-folder-option={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: checked ? 'rgba(245,158,11,0.12)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(f.id)}
                    style={{ cursor: 'pointer', accentColor: '#f59e0b' }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.count}</span>
                </label>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <input
            data-folder-new-name
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitNew();
              }
            }}
            placeholder="新しいフォルダ名"
            maxLength={30}
            style={{
              flex: 1,
              minWidth: 0,
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
            data-folder-create
            onClick={() => void submitNew()}
            disabled={!newName.trim() || creating}
            style={{
              ...smallBtn,
              background: newName.trim() ? '#f59e0b' : 'var(--bg-secondary)',
              color: newName.trim() ? '#fff' : 'var(--text-muted)',
              borderColor: newName.trim() ? '#f59e0b' : 'var(--border)',
              cursor: newName.trim() && !creating ? 'pointer' : 'default',
            }}
          >
            {creating ? '…' : '＋作成'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 6,
            borderTop: '1px solid var(--border)',
            paddingTop: 8,
          }}
        >
          {isFavorite && (
            <button
              type="button"
              data-folder-unfavorite
              onClick={() => {
                onUnfavorite();
                onClose();
              }}
              style={{ ...smallBtn, flex: 1 }}
              title="お気に入りを解除します（分類も外れます）"
            >
              ☆ お気に入り解除
            </button>
          )}
          <button type="button" onClick={onClose} style={{ ...smallBtn, flex: 1 }}>
            閉じる
          </button>
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          フォルダを選ばなくてもお気に入りのままです（
          <span style={FOLDER_BADGE_STYLE}>未分類</span> として絞り込めます）
        </div>
      </div>
    </>,
    document.body,
  );
}

const smallBtn: CSSProperties = {
  fontSize: 11,
  padding: '5px 10px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
