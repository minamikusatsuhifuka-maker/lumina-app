'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 305: 🔲 マンダラ 81マス表示（9×9 を 3×3 のブロックとして描く）
//
// - ブロックの位置＝親マスの位置（左上の親 → 左上のブロック）。中央ブロック＝第1階層の9マス（301 と同じ描画・density だけ compact）
// - 外周ブロックの中身は mandalaGridSlots(cells, parent.id)（＝アウトライン関数から中央を差し込んだ9枠・R-74）。
//   中央は親マスそのもの（同じ cell.id・導出・別色で「親」）。押すと親の編集パネルが開く
// - 未展開ブロック（子が1行も無い）はブロック全体を薄く見せ、空枠を押すと8マスを作ってから編集を開く（親側の onExpand）
// - 狭幅（ブロック単位モード）: 3×3 を1ブロックずつ切り替える（3×3 のミニ選択＋‹ ›）。R-64: WebKit で実測
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, type CSSProperties } from 'react';
import MandalaGrid, { type PopoverBind } from '@/components/mandala/MandalaGrid';
import {
  MANDALA_CENTER,
  MANDALA_OUTLINE_POSITIONS,
  MANDALA_POSITION_LABELS,
  cellDisplayTitle,
  isBlockExpanded,
  mandalaOutlineNested,
  type MandalaCell,
  type MandalaLinkCounts,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';

export default function Mandala81({
  cells,
  selectedCellId,
  onSelect,
  linkCounts,
  selectMode,
  checkedIds,
  onToggleSelect,
  popoverBind,
  onExpand,
  narrow,
  articleCounts,
}: {
  cells: readonly MandalaCell[];
  /** 309: マスごとの起こした記事数 */
  articleCounts?: ReadonlyMap<string, number>;
  selectedCellId: string | null;
  onSelect: (cell: MandalaCell) => void;
  linkCounts: ReadonlyMap<string, MandalaLinkCounts>;
  selectMode: boolean;
  checkedIds: ReadonlySet<string>;
  onToggleSelect: (cell: MandalaCell) => void;
  popoverBind: PopoverBind;
  onExpand: (parentCellId: string, position: number) => void;
  /** 狭幅（ブロック単位モード）。親が matchMedia で決める */
  narrow: boolean;
}) {
  // 描画順はアウトライン関数から（§2-7・R-74）: 親の position ごとのブロック
  const nested = mandalaOutlineNested(cells);
  const parentByPos = new Map(nested.map((n) => [n.position, n.cell]));
  const [focusBlock, setFocusBlock] = useState<number>(MANDALA_CENTER);

  const blockOf = (position: number) => {
    if (position === MANDALA_CENTER) {
      return (
        <MandalaGrid
          cells={cells}
          selectedCellId={selectedCellId}
          onSelect={onSelect}
          linkCounts={linkCounts}
          selectMode={selectMode}
          checkedIds={checkedIds}
          onToggleSelect={onToggleSelect}
          popoverBind={popoverBind}
          articleCounts={articleCounts}
          density="compact"
          blockAttrs={{ 'data-mandala-block': MANDALA_CENTER, 'data-mandala-block-expanded': '1' }}
        />
      );
    }
    const parent = parentByPos.get(position);
    if (!parent) return null;
    const expanded = isBlockExpanded(cells, parent.id);
    return (
      <div data-mandala-block-wrap={position} style={{ opacity: expanded ? 1 : 0.6, minWidth: 0 }}>
        <MandalaGrid
          cells={cells}
          parentCellId={parent.id}
          selectedCellId={selectedCellId}
          onSelect={onSelect}
          linkCounts={linkCounts}
          selectMode={selectMode}
          checkedIds={checkedIds}
          onToggleSelect={onToggleSelect}
          popoverBind={popoverBind}
          articleCounts={articleCounts}
          density="compact"
          onExpand={onExpand}
          blockAttrs={{ 'data-mandala-block': position, 'data-mandala-block-expanded': expanded ? '1' : '0' }}
        />
        {!expanded && !selectMode && (
          <div data-mandala-block-hint={position} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
            未展開（枠を押すと8マスを作ります）
          </div>
        )}
      </div>
    );
  };

  if (narrow) {
    // ブロック単位モード: 3×3 のミニ選択で1ブロックずつ
    const order = [...MANDALA_OUTLINE_POSITIONS];
    order.splice(MANDALA_CENTER, 0, MANDALA_CENTER);
    const idx = order.indexOf(focusBlock);
    const go = (d: number) => setFocusBlock(order[(idx + d + order.length) % order.length]);
    const focusParent = focusBlock === MANDALA_CENTER ? null : parentByPos.get(focusBlock) ?? null;
    const navBtn: CSSProperties = { padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };
    return (
      <div data-mandala-81 data-mandala-81-mode="block" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div data-mandala-block-nav style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-mandala-block-prev onClick={() => go(-1)} style={navBtn} aria-label="前のブロック">‹</button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 2 }}>
            {order.map((p) => {
              const active = p === focusBlock;
              const expanded = p === MANDALA_CENTER || (parentByPos.get(p) ? isBlockExpanded(cells, parentByPos.get(p)!.id) : false);
              return (
                <button
                  key={p}
                  type="button"
                  data-mandala-block-pick={p}
                  aria-pressed={active}
                  onClick={() => setFocusBlock(p)}
                  aria-label={`${MANDALA_POSITION_LABELS[p]}のブロック`}
                  style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? `${ACCENT}33` : expanded ? `${ACCENT}12` : 'transparent', cursor: 'pointer', padding: 0 }}
                />
              );
            })}
          </div>
          <button type="button" data-mandala-block-next onClick={() => go(1)} style={navBtn} aria-label="次のブロック">›</button>
          <span data-mandala-block-label style={{ fontSize: 12, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {focusBlock === MANDALA_CENTER ? '中央（第1階層）' : `${MANDALA_POSITION_LABELS[focusBlock]}: ${cellDisplayTitle(focusParent)}`}
          </span>
        </div>
        {blockOf(focusBlock)}
      </div>
    );
  }

  const order = [...MANDALA_OUTLINE_POSITIONS];
  order.splice(MANDALA_CENTER, 0, MANDALA_CENTER);
  return (
    <div
      data-mandala-81
      data-mandala-81-mode="full"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, maxWidth: 1180, minWidth: 0 }}
    >
      {order.map((p) => (
        <div key={p} style={{ minWidth: 0, padding: 4, borderRadius: 10, border: p === MANDALA_CENTER ? `1px solid ${ACCENT}` : '1px solid var(--border)' }}>
          {blockOf(p)}
        </div>
      ))}
    </div>
  );
}
