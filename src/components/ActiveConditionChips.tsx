'use client';

// 293 §6: 適用中の条件を一覧表示し、条件ごとに個別解除・すべて解除できる共通部品。
// 見た目は 192 の「🏷️ タグ条件: [chip ✕] …」（context-library/ContextLibraryPanel）と同じ形に揃える
//（新しい表示形式を増やさない・§6-3）。📚リサーチ保存と🗂テキスト分析の保存一覧で共用。
// 条件の中身（何が効いているか・外すと何が起きるか）は呼び出し側が ActiveCondition で渡す（この部品は状態を持たない）。

import type { ActiveCondition } from '@/lib/library-filters';

export function ActiveConditionChips({
  conditions,
  onClearAll,
  heading = '🔎 適用中の条件:',
}: {
  conditions: ActiveCondition[];
  onClearAll: () => void;
  heading?: string;
}) {
  if (conditions.length === 0) return null;
  return (
    <div
      data-active-conditions={conditions.length}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{heading}</span>
      {conditions.map((c) => (
        <span
          key={c.key}
          data-active-condition={c.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--border-accent, var(--border))',
            background: 'var(--accent-soft, rgba(108,99,255,0.08))',
            color: 'var(--text-primary)',
            fontSize: 12,
            maxWidth: 320,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
          <button
            type="button"
            data-active-condition-remove={c.key}
            onClick={c.onRemove}
            title="この条件を外す"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        data-active-conditions-clear
        onClick={onClearAll}
        style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
      >
        すべて解除
      </button>
    </div>
  );
}
