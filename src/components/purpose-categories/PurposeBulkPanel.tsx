'use client';

// 298: 選択した記事に用途カテゴリをまとめて「付ける」「外す」パネル。
// 形は 297 の1件用（PurposePickerPopover）に揃える（学習コストを増やさない）。
//
// 混在した状態（あるカテゴリに入っている記事と入っていない記事が同時に選ばれている）の扱いは**案B**:
// チェックは「どのカテゴリを対象にするか」だけを表し、現在の所属は表さない。「＋ 付ける」「− 外す」を
// 明示のボタンにして、現在の状態を問わずその操作を行う（3状態のチェックは「一部」の意味が読めず誤解のもと）。
// 付ける／外すとも確認ダイアログは出さない（記事を消さない・押し直せば戻せる。R-56 は削除に対するもの）。
// 二重発火は ref で同期的に遮断する（R-87）。結果は「何件に付いた／外れた・何件は変化なし・何件失敗」を出す（R-39・偽の成功を出さない）。

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PurposeCategory } from '@/lib/purpose-categories';
import { type PurposeBulkMode, purposeBulkResultMessage } from '@/lib/purpose-categories-shared';
import type { PurposeBulkOutcome } from './usePurposeCategories';
import { PURPOSE_ACCENT, PURPOSE_BADGE_STYLE } from './purposeStyles';

interface Props {
  anchorRect: DOMRect | null;
  categories: PurposeCategory[];
  /** 選択中の記事数（📚は成果物＝行の数） */
  selectedCount: number;
  onApply: (mode: PurposeBulkMode, categoryIds: number[]) => Promise<PurposeBulkOutcome | null>;
  onCreate: (name: string) => Promise<PurposeCategory | null>;
  onClose: () => void;
}

const PANEL_WIDTH = 300;

export default function PurposeBulkPanel({ anchorRect, categories, selectedCount, onApply, onCreate, onClose }: Props) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<PurposeBulkMode | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // R-87: 非同期を始めるボタンの二重発火は ref で同期的に閉じる（state の更新を待たない）
  const busyRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined' || !anchorRect) return null;

  const margin = 8;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - PANEL_WIDTH - margin));
  const estimatedHeight = 360;
  const openUpward = anchorRect.bottom + estimatedHeight + margin > window.innerHeight && anchorRect.top > estimatedHeight + margin;
  const top = openUpward ? Math.max(margin, anchorRect.top - estimatedHeight - 6) : anchorRect.bottom + 6;

  const toggle = (id: number) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const run = async (mode: PurposeBulkMode) => {
    if (busyRef.current || chosen.length === 0) return;
    busyRef.current = true;
    setBusy(mode);
    setResult(null);
    try {
      const out = await onApply(mode, chosen);
      if (out) setResult(purposeBulkResultMessage(mode, out));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const created = await onCreate(name);
    setCreating(false);
    if (created) {
      setNewName('');
      setChosen((prev) => [...prev, created.id]);
    }
  };

  const disabled = busy !== null || chosen.length === 0;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }} />
      <div
        data-purpose-bulk-panel
        role="dialog"
        aria-label="選択した記事に用途カテゴリを付け外し"
        style={{
          position: 'fixed', left, top, width: PANEL_WIDTH, maxHeight: estimatedHeight, overflowY: 'auto', zIndex: 9999,
          background: 'var(--bg-card)', border: `1px solid ${PURPOSE_ACCENT}`, borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div data-purpose-bulk-count={selectedCount} style={{ fontSize: 12, fontWeight: 700, color: PURPOSE_ACCENT }}>
          🎯 選択中の {selectedCount}件 に用途カテゴリを付け外し
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          対象のカテゴリにチェックを入れて「付ける」か「外す」を押します（チェックは現在の所属ではなく操作の対象です）。記事は削除されません。
        </div>
        {categories.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            まだ用途カテゴリがありません。下の欄に名前（例: note用・Kindle用・保留）を入れて作成してください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categories.map((c) => {
              const checked = chosen.includes(c.id);
              return (
                <label
                  key={c.id}
                  data-purpose-bulk-option={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: checked ? 'rgba(13,148,136,0.10)' : 'transparent' }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} disabled={busy !== null} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: PURPOSE_ACCENT }} />
                  <span style={PURPOSE_BADGE_STYLE}>🎯 {c.name}</span>
                  <span data-purpose-bulk-option-count={c.count} title={`この画面 ${c.count}件／3画面合計 ${c.count_total}件`} style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{c.count}件</span>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            data-purpose-bulk-add
            onClick={() => void run('add')}
            disabled={disabled}
            style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 6, border: 'none', background: disabled ? 'var(--border)' : PURPOSE_ACCENT, color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            {busy === 'add' ? '⏳ 付けています…' : `＋ ${selectedCount}件に付ける`}
          </button>
          <button
            type="button"
            data-purpose-bulk-remove
            onClick={() => void run('remove')}
            disabled={disabled}
            title={`選んだカテゴリを ${selectedCount}件 から外します（記事は削除されません）`}
            style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 6, border: `1px solid ${disabled ? 'var(--border)' : PURPOSE_ACCENT}`, background: 'transparent', color: disabled ? 'var(--text-muted)' : PURPOSE_ACCENT, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            {busy === 'remove' ? '⏳ 外しています…' : `− ${selectedCount}件から外す`}
          </button>
        </div>
        {result && (
          <div data-purpose-bulk-result role="status" style={{ fontSize: 11, lineHeight: 1.6, padding: '6px 8px', borderRadius: 6, background: 'rgba(13,148,136,0.08)', color: 'var(--text-primary)' }}>
            {result}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            data-purpose-bulk-new-name
            value={newName}
            maxLength={30}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitNew(); } }}
            placeholder="新しい用途カテゴリ名"
            style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 11, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            data-purpose-bulk-create
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
