'use client';

// 297: 🎯用途カテゴリの一覧・絞り込み・管理（作成／名前の変更／削除）。3画面で共用。
//
// ⭐マイフォルダ（テーマ別・金色・📂）とは**別の枠**に置き、見出しに役割（用途）を明記し、色を青緑に分ける。
// 「フォルダ」という語は使わない（§3-1）。並び替えは持たない（用途は数個の想定。要望が出たら足す）。
// 削除の確認は1回（R-56）で、そのカテゴリに入っている件数と「記事は削除されません」を明記する。

import { useEffect, useState } from 'react';
import type { PurposeCategory } from '@/lib/purpose-categories';
import { purposeDeleteConfirmMessage } from '@/lib/purpose-categories';
import type { PurposeFilter } from './usePurposeCategories';
import { PURPOSE_ACCENT, purposeChipStyle } from './purposeStyles';

interface Props {
  /** どの画面か（/dashboard/saved は両パネルを同時に持つため識別が要る） */
  scope: 'text_analysis' | 'library' | 'context';
  categories: PurposeCategory[];
  /** 絞り込みなしのときの母数（この画面の記事の総数） */
  totalCount: number;
  value: PurposeFilter;
  onChange: (next: PurposeFilter) => void;
  onCreate: (name: string) => Promise<PurposeCategory | null>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  /** 開閉状態の記憶キー（画面ごとに別） */
  storageKey: string;
}

export default function PurposeCategoryBar({ scope, categories, totalCount, value, onChange, onCreate, onRename, onDelete, storageKey }: Props) {
  const [open, setOpen] = useState(true);
  const [manageMode, setManageMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setOpen(saved === '1');
    } catch { /* 記憶できない環境では既定のまま */ }
  }, [storageKey]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  const commitRename = async (id: number) => {
    const name = editingValue.trim();
    setEditingId(null);
    const current = categories.find((c) => c.id === id);
    if (!name || !current || name === current.name) return;
    await onRename(id, name);
  };

  const handleDelete = async (c: PurposeCategory) => {
    // 件数は取得済みの一覧（実テーブルとJOINした件数）から出す。確認は1回だけ（R-56）
    if (!window.confirm(purposeDeleteConfirmMessage(c.name, c.count_total))) return;
    const done = await onDelete(c.id);
    if (done && value === c.id) onChange(null);
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
      data-purpose-bar={scope}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(13,148,136,0.35)`, background: 'rgba(13,148,136,0.04)' }}
    >
      <style>{`
        .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
        @media (max-width: 640px) { .pc-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span data-purpose-heading style={{ fontSize: 12, fontWeight: 700, color: PURPOSE_ACCENT }}>
          🎯 用途カテゴリ（note用・Kindle用など、使いみちで分ける）
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            data-purpose-manage-toggle
            onClick={() => { setManageMode((v) => !v); setEditingId(null); }}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${manageMode ? PURPOSE_ACCENT : 'var(--border)'}`, background: manageMode ? 'rgba(13,148,136,0.12)' : 'transparent', color: manageMode ? PURPOSE_ACCENT : 'var(--text-secondary)', cursor: 'pointer' }}
            title="用途カテゴリの作成・名前の変更・削除"
          >
            🛠 用途を管理
          </button>
          <button
            type="button"
            data-purpose-bar-toggle
            onClick={toggleOpen}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            {open ? '▲ 閉じる' : `▼ 開く（${categories.length}）`}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="pc-grid">
            <button type="button" data-purpose-filter="all" onClick={() => onChange(null)} style={purposeChipStyle(value === null)}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>🎯</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>絞り込みなし</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: PURPOSE_ACCENT }}>{totalCount}</span>
            </button>
            {categories.map((c) => {
              const active = value === c.id;
              const isEditing = editingId === c.id;
              return (
                <div
                  key={c.id}
                  data-purpose-card={c.id}
                  data-purpose-count={c.count}
                  onClick={() => { if (!isEditing) onChange(active ? null : c.id); }}
                  style={purposeChipStyle(active)}
                  title={`この画面 ${c.count}件／3画面合計 ${c.count_total}件`}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>🎯</span>
                  {isEditing ? (
                    <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        data-purpose-rename-input
                        value={editingValue}
                        maxLength={30}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        onBlur={() => void commitRename(c.id)}
                        style={{ width: '100%', padding: '4px 6px', fontSize: 12, fontWeight: 600, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: `1px solid ${PURPOSE_ACCENT}`, borderRadius: 4, outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  )}
                  {manageMode && !isEditing && (
                    <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" data-purpose-rename={c.id} onClick={() => { setEditingId(c.id); setEditingValue(c.name); }} title="名前を変更" style={iconBtn}>✏️</button>
                      <button type="button" data-purpose-delete={c.id} onClick={() => void handleDelete(c)} title="この用途カテゴリを削除（記事は消えません）" style={iconBtn}>🗑</button>
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 700, color: PURPOSE_ACCENT, flexShrink: 0 }}>{c.count}</span>
                </div>
              );
            })}
          </div>

          {manageMode && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                data-purpose-bar-new-name
                value={newName}
                maxLength={30}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitNew(); } }}
                placeholder="新しい用途カテゴリ名（例: note用）"
                style={{ width: 220, padding: '6px 8px', fontSize: 11, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                data-purpose-bar-create
                onClick={() => void submitNew()}
                disabled={!newName.trim() || creating}
                style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: `1px solid ${newName.trim() ? PURPOSE_ACCENT : 'var(--border)'}`, background: newName.trim() ? PURPOSE_ACCENT : 'transparent', color: newName.trim() ? '#fff' : 'var(--text-muted)', cursor: newName.trim() && !creating ? 'pointer' : 'default', fontWeight: 600 }}
              >
                {creating ? '作成中…' : '＋ 用途カテゴリを作成'}
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>削除しても記事は消えません（用途の割り当てが外れるだけ）</span>
            </div>
          )}

          {categories.length === 0 && !manageMode && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              まだ用途カテゴリがありません。記事の「🎯 用途」から、または「🛠 用途を管理」から作成できます（例: note用・Kindle用・保留）。
            </div>
          )}
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px 3px', fontSize: 11, lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted)' };
