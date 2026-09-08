'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ 3×3 グリッド（§3-3）
//
// - 描画順は lib/mandala-shared.mandalaGridSlots()（＝アウトライン関数から中央を差し込んだ9枠）。
//   ここで別の順序を組まない（表示と目次を同じ関数から・R-74）
// - 各枠: タイトル1行（省略記号で幅固定・R-109）／本文の冒頭プレビュー2〜3行／文字数バッジ（CharCountBadge 再利用）
// - 空のマスは破線＋「＋」で一目で分かる
// - 枠の中に操作要素（ボタン）を置かない＝当たり判定は読む領域だけ（R-81）。押すと編集パネルが開く
// - 第2階層の中央（導出枠・§4-3②）は押せない（保存されない）。本便では第1階層のみ描く
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { CharCountBadge } from '@/components/LibraryItemRow';
import {
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  cellPreviewText,
  isCellFilled,
  mandalaGridSlots,
  type MandalaCell,
  type MandalaGridSlot,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';

function CellCard({
  slot,
  selected,
  onSelect,
}: {
  slot: MandalaGridSlot;
  selected: boolean;
  onSelect: (cell: MandalaCell) => void;
}) {
  const { cell, position, derived, derivedTitle } = slot;
  const isCenter = position === MANDALA_CENTER;
  const label = MANDALA_POSITION_LABELS[position] ?? String(position);
  const filled = isCellFilled(cell);
  const clickable = !!cell && !derived;
  const title = derived ? derivedTitle ?? '' : cell?.title.trim() ?? '';
  const preview = cell && !derived ? cellPreviewText(cell.body) : '';

  const activate = () => {
    if (clickable && cell) onSelect(cell);
  };

  return (
    <div
      data-mandala-cell={position}
      data-mandala-cell-id={cell?.id ?? ''}
      data-mandala-cell-filled={filled ? '1' : '0'}
      data-mandala-cell-derived={derived ? '1' : undefined}
      data-mandala-selected={selected ? '1' : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={`${label}: ${title || '空のマス'}`}
      aria-pressed={clickable ? selected : undefined}
      title={clickable ? (filled ? 'このマスを編集' : 'このマスに書く') : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      style={{
        minHeight: 150,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 12,
        boxSizing: 'border-box',
        minWidth: 0,
        cursor: clickable ? 'pointer' : 'default',
        border: filled || derived ? `1px solid ${isCenter ? ACCENT : 'var(--border)'}` : '1px dashed var(--border)',
        outline: selected ? `2px solid ${ACCENT}` : 'none',
        outlineOffset: 2,
        background: isCenter ? `${ACCENT}14` : 'var(--bg-secondary)',
        opacity: filled || isCenter || derived ? 1 : 0.85,
        transition: 'box-shadow 0.12s, transform 0.12s',
      }}
      onMouseEnter={(e) => {
        if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* 位置ラベル＋文字数（読む領域・操作要素なし） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 999,
            background: isCenter ? ACCENT : 'var(--bg-primary)',
            color: isCenter ? '#fff' : 'var(--text-muted)',
            border: isCenter ? `1px solid ${ACCENT}` : '1px solid var(--border)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isCenter ? (derived ? '親マス' : 'テーマ') : label}
        </span>
        <span style={{ flex: 1 }} />
        {cell && !derived && filled && <CharCountBadge n={cell.body.length} unit="字" compact />}
      </div>

      {filled || derived ? (
        <>
          <div
            data-mandala-cell-title
            title={title || undefined}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {title || '（無題）'}
          </div>
          {!derived && (
            <div
              data-mandala-cell-preview
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                overflowWrap: 'anywhere',
                minHeight: 0,
              }}
            >
              {preview || <span style={{ color: 'var(--text-muted)' }}>（本文なし）</span>}
            </div>
          )}
        </>
      ) : (
        <div
          data-mandala-cell-empty
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ fontSize: 28, lineHeight: 1, fontWeight: 300 }}>＋</span>
          <span style={{ fontSize: 11 }}>{isCenter ? 'テーマを書く' : '空のマス'}</span>
        </div>
      )}
    </div>
  );
}

export default function MandalaGrid({
  cells,
  parentCellId = null,
  selectedCellId,
  onSelect,
}: {
  cells: readonly MandalaCell[];
  /** null＝第1階層。第2階層（303）は親マスの id を渡す（中央は導出・押せない） */
  parentCellId?: string | null;
  selectedCellId: string | null;
  onSelect: (cell: MandalaCell) => void;
}) {
  // 描画順はアウトライン関数から（§4-3⑤・R-74）
  const slots = mandalaGridSlots(cells, parentCellId);
  return (
    <div
      data-mandala-grid
      data-mandala-grid-depth={parentCellId ? '2' : '1'}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
        maxWidth: 960,
      }}
    >
      {slots.map((slot) => (
        <CellCard
          key={slot.position}
          slot={slot}
          selected={!!slot.cell && slot.cell.id === selectedCellId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
