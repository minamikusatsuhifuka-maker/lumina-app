'use client';

// 297: 「🎯 用途」ボタンから開く割り当てパネル（マイフォルダの FolderPickerPopover と同じ操作感）。
// 既存カテゴリの複数選択・その場での新規作成をこの1枚で行う。チェックした時点で保存する。
// お気に入りとは無関係（用途はお気に入りを前提にしない）ので解除ボタンは持たない。
// `.page-enter` の transform 配下では position:fixed が効かないため createPortal で body に出す（R-19）。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PurposeCategory } from '@/lib/purpose-categories';
import { PURPOSE_ACCENT, PURPOSE_BADGE_STYLE } from './purposeStyles';

interface Props {
  anchorRect: DOMRect | null;
  categories: PurposeCategory[];
  /** いま選択されている用途カテゴリID */
  selectedIds: number[];
  onChange: (categoryIds: number[]) => void;
  onCreate: (name: string) => Promise<PurposeCategory | null>;
  onClose: () => void;
}

const PANEL_WIDTH = 260;

export default function PurposePickerPopover({ anchorRect, categories, selectedIds, onChange, onCreate, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined' || !anchorRect) return null;

  const margin = 8;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - PANEL_WIDTH - margin));
  const estimatedHeight = 300;
  const openUpward = anchorRect.bottom + estimatedHeight + margin > window.innerHeight && anchorRect.top > estimatedHeight + margin;
  const top = openUpward ? Math.max(margin, anchorRect.top - estimatedHeight - 6) : anchorRect.bottom + 6;

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const created = await onCreate(name);
    setCreating(false);
    if (created) {
      setNewName('');
      // 作ったカテゴリにそのまま入れる（作成→選択の二度手間を避ける）
      onChange([...selectedIds, created.id]);
    }
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }} />
      <div
        data-purpose-picker
        role="dialog"
        aria-label="用途カテゴリの割り当て"
        style={{
          position: 'fixed', left, top, width: PANEL_WIDTH, maxHeight: estimatedHeight, overflowY: 'auto', zIndex: 9999,
          background: 'var(--bg-card)', border: `1px solid ${PURPOSE_ACCENT}`, borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: PURPOSE_ACCENT }}>🎯 用途カテゴリを割り当て</div>
        {categories.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            まだ用途カテゴリがありません。下の欄に名前（例: note用・Kindle用・保留）を入れて作成すると、ここから選べるようになります。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categories.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  data-purpose-option={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: checked ? 'rgba(13,148,136,0.10)' : 'transparent' }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: PURPOSE_ACCENT }} />
                  <span style={PURPOSE_BADGE_STYLE}>🎯 {c.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{c.count_total}</span>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            data-purpose-picker-new-name
            value={newName}
            maxLength={30}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitNew(); } }}
            placeholder="新しい用途カテゴリ名"
            style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 11, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            data-purpose-picker-create
            onClick={() => void submitNew()}
            disabled={!newName.trim() || creating}
            style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, border: `1px solid ${newName.trim() ? PURPOSE_ACCENT : 'var(--border)'}`, background: newName.trim() ? PURPOSE_ACCENT : 'transparent', color: newName.trim() ? '#fff' : 'var(--text-muted)', cursor: newName.trim() && !creating ? 'pointer' : 'default', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {creating ? '作成中…' : '＋ 作成'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
