'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ 3×3 グリッド（§3-3）＋ 302: リンク件数（🔗n）・一次情報（📔n）・比較の選択
//
// - 描画順は lib/mandala-shared.mandalaGridSlots()（＝アウトライン関数から中央を差し込んだ9枠）。
//   ここで別の順序を組まない（表示と目次を同じ関数から・R-74）
// - 各枠: タイトル1行（省略記号で幅固定・R-109）／本文の冒頭プレビュー2〜3行／文字数バッジ（CharCountBadge 再利用）
// - 空のマスは破線＋「＋」で一目で分かる
// - 枠の中に操作要素（ボタン）を置かない＝当たり判定は読む領域だけ（R-81）。押すと編集パネルが開く
// - 302: 🔗n はリンクが1件以上のときだけ。📔n（一次情報＝episode のリンク件数）は埋まったマスにだけ出し、0件は淡色。
//   件数は親が linkCountsByCell（純関数・R-74）で導出したものを受け取る（ここで数え直さない）
// - 302 §3-1 選択モード: 押すと編集ではなく選択がトグルする（チェックの見た目は枠内の印。操作要素ではない）。
//   空のマスは選べない（比較に出ない）。全選択は置かない（R-106）
// - 第2階層の中央（導出枠・§4-3②）は押せない（保存されない）。本便では第1階層のみ描く
// - 308: 区分（meta.tier）があるマスは「無料」「有料」の小さな帯（有料は琥珀の縁＝有料ラインの下と分かる）。
//   反応記録（meta.reaction）があるマスは 📈 バッジ（HoverPopover で4項目＋購入率＋一言＋日時）。
//   どちらも meta に無ければ何も増えない（既存チャート・§7）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { CharCountBadge } from '@/components/LibraryItemRow';
import type { HoverPopoverBindings } from '@/components/HoverPopover';
import { MANDALA_RESEARCH_STATE_LABELS, researchState } from '@/lib/mandala-research';
import {
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  MANDALA_TIER_LABELS,
  cellPreviewText,
  cellTier,
  hasReaction,
  isCellFilled,
  mandalaGridSlots,
  type MandalaCell,
  type MandalaGridSlot,
  type MandalaLinkCounts,
  type MandalaPopoverFrom,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';
/** 308: 有料側の色（琥珀）。「有料ラインの下」を一目で */
const PAID = '#B45309';

/** 304: バッジ（📔n・🔗n）にホバーポップアップを結線する関数。省略時はバッジは読むだけ（302 と同じ） */
export type PopoverBind = (cell: MandalaCell, from: MandalaPopoverFrom) => HoverPopoverBindings;

/** 305: 81マス表示のときの密度（タイトル1行＋小さなバッジのみ・本文プレビューなし・R-109） */
export type GridDensity = 'normal' | 'compact';

function CellCard({
  slot,
  selected,
  counts,
  selectMode,
  checked,
  onSelect,
  onToggleSelect,
  popoverBind,
  density,
  onExpand,
  articleCount = 0,
  nowMs = 0,
  xPostCount = 0,
}: {
  slot: MandalaGridSlot;
  /** 312: そのマスから起こした X 投稿の数（記録から導出）。0 なら出さない */
  xPostCount?: number;
  /** 311: 進行状況の判定に使う現在時刻（親が固定） */
  nowMs?: number;
  /** 309: そのマスから起こした note 記事の数（記事の側の記録から導出）。0 なら出さない */
  articleCount?: number;
  selected: boolean;
  counts: MandalaLinkCounts | undefined;
  selectMode: boolean;
  checked: boolean;
  onSelect: (cell: MandalaCell) => void;
  onToggleSelect: (cell: MandalaCell) => void;
  popoverBind?: PopoverBind;
  density: GridDensity;
  /** 305: 未展開ブロックの空枠（cell が無い第2階層）を押したとき */
  onExpand?: (position: number) => void;
}) {
  const { cell, position, derived, derivedTitle, derivedCell } = slot;
  const isCenter = position === MANDALA_CENTER;
  const compact = density === 'compact';
  const label = MANDALA_POSITION_LABELS[position] ?? String(position);
  const filled = isCellFilled(cell);
  // 305: 導出枠（外周ブロックの中央）は親マスそのもの＝押すと親の編集。選択モードでは選ばせない（中央ブロックで選べる＝重複させない）
  const selectable = selectMode && !!cell && !derived && filled;
  const canExpand = !cell && !derived && !!onExpand && !selectMode;
  const clickable = selectMode ? selectable : (!!cell && !derived) || (derived && !!derivedCell) || canExpand;
  const title = derived ? derivedTitle ?? '' : cell?.title.trim() ?? '';
  const preview = cell && !derived && !compact ? cellPreviewText(cell.body) : '';
  // 308: 区分と反応記録。導出枠（外周ブロックの中央＝親）も親の区分を出す
  const tierCell = cell ?? derivedCell ?? null;
  const tier = cellTier(tierCell);
  const reacted = !!cell && !derived && hasReaction(cell);
  // 311: 調査の進行状況（meta.research から導出）。now は親が固定して渡す（決定的）
  const research = cell && !derived ? researchState(cell.meta, nowMs) : 'none';

  const activate = () => {
    if (selectMode) {
      if (cell && !derived && selectable) onToggleSelect(cell);
      return;
    }
    if (derived) {
      if (derivedCell) onSelect(derivedCell);
      return;
    }
    if (!cell) {
      if (canExpand) onExpand?.(position);
      return;
    }
    onSelect(cell);
  };

  const hoverTitle = derived
    ? derivedCell && !selectMode ? '親マスを編集（中央ブロックと同じマス）' : undefined
    : !cell
      ? canExpand ? 'このブロックを展開して書く（8マスを作ります）' : undefined
      : selectMode
        ? selectable
          ? checked ? '選択を外す' : '比較するマスとして選ぶ'
          : '空のマスは比較できません'
        : filled ? 'このマスを編集' : 'このマスに書く';

  return (
    <div
      data-mandala-cell={position}
      data-mandala-cell-id={cell?.id ?? derivedCell?.id ?? ''}
      data-mandala-cell-filled={filled ? '1' : '0'}
      data-mandala-cell-derived={derived ? '1' : undefined}
      data-mandala-cell-unexpanded={!cell && !derived ? '1' : undefined}
      data-mandala-selected={selected ? '1' : undefined}
      data-mandala-cell-checked={selectMode ? (checked ? '1' : '0') : undefined}
      data-mandala-cell-unselectable={selectMode && cell && !selectable ? '1' : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={`${label}: ${title || '空のマス'}`}
      aria-pressed={clickable ? (selectMode ? checked : selected) : undefined}
      aria-disabled={selectMode && cell && !selectable ? true : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      style={{
        minHeight: compact ? 54 : 150,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 3 : 6,
        padding: compact ? '5px 6px' : '10px 12px',
        borderRadius: compact ? 8 : 12,
        boxSizing: 'border-box',
        minWidth: 0,
        cursor: clickable ? 'pointer' : selectMode && cell ? 'not-allowed' : 'default',
        border: filled || derived ? `1px solid ${isCenter ? (derived ? PAID : ACCENT) : tier === 'paid' ? 'rgba(180,83,9,0.55)' : 'var(--border)'}` : tier === 'paid' ? '1px dashed rgba(180,83,9,0.55)' : '1px dashed var(--border)',
        // 308: 有料側は左の縁を太くして「有料ラインの下」を一目で（区分の無いマスは従来どおり）
        borderLeftWidth: tier === 'paid' ? 4 : undefined,
        outline: selected || (selectMode && checked) ? `2px solid ${ACCENT}` : 'none',
        outlineOffset: 2,
        // 305: 外周ブロックの中央（導出＝親）はテーマ色に準じた別色（琥珀）で「親」と分かるようにする
        background: selectMode && checked ? `${ACCENT}1f` : derived ? 'rgba(180,83,9,0.10)' : isCenter ? `${ACCENT}14` : 'var(--bg-secondary)',
        opacity: selectMode && cell && !selectable ? 0.5 : filled || isCenter || derived ? 1 : 0.85,
        transition: 'box-shadow 0.12s, transform 0.12s',
      }}
      onMouseEnter={(e) => {
        if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* 位置ラベル＋件数バッジ＋文字数（読む領域・操作要素なし）。バッジは nowrap で幅固定（R-109）。
          305是正①: コンパクト（81）では行を折り返して**マスの幅内に収める**（隣のマスに重ねない）。位置ラベルの
          チップはテーマ／親マス以外は省き、並びは 文字数 > 🔗n > 📔n の優先で先頭から置く */}
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 3 : 6, minWidth: 0, flexWrap: compact ? 'wrap' : 'nowrap', overflow: 'hidden', rowGap: 2 }}>
        {selectMode && cell && !derived && (
          <span data-mandala-cell-check aria-hidden style={{ fontSize: 14, lineHeight: 1, color: checked ? ACCENT : 'var(--text-muted)', flexShrink: 0 }}>
            {checked ? '☑' : '☐'}
          </span>
        )}
        {(!compact || isCenter) && (
          <span
            data-mandala-cell-chip
            style={{
              fontSize: compact ? 9 : 10,
              fontWeight: 700,
              padding: compact ? '0 4px' : '1px 6px',
              borderRadius: 999,
              background: isCenter ? (derived ? '#B45309' : ACCENT) : 'var(--bg-primary)',
              color: isCenter ? '#fff' : 'var(--text-muted)',
              border: isCenter ? `1px solid ${derived ? '#B45309' : ACCENT}` : '1px solid var(--border)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {isCenter ? (derived ? '親マス' : 'テーマ') : label}
          </span>
        )}
        {/* 308 §2-3: 区分の帯（短い表示語・R-57）。有料は琥珀。title は付けない（R-110） */}
        {tier && (
          <span
            data-mandala-cell-tier={tier}
            style={{ fontSize: compact ? 9 : 10, fontWeight: 700, padding: compact ? '0 4px' : '1px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, background: tier === 'paid' ? 'rgba(180,83,9,0.14)' : 'rgba(29,158,117,0.12)', color: tier === 'paid' ? PAID : '#1D9E75', border: `1px solid ${tier === 'paid' ? 'rgba(180,83,9,0.45)' : 'rgba(29,158,117,0.35)'}` }}
          >
            {MANDALA_TIER_LABELS[tier]}
          </span>
        )}
        {!compact && <span style={{ flex: 1 }} />}
        {/* 308 §3-3: 反応記録がある埋まったマスに 📈（ホバーで4項目＋購入率＋一言＋日時）。304 のリンク一覧とは別のバッジ */}
        {reacted && cell && (() => {
          const b = popoverBind ? popoverBind(cell, 'reaction') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-reaction
              aria-label="反応記録あり。記録を表示"
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: '#1D9E75', cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              📈
            </span>
          );
        })()}
        {/* 311 §3-5: 調査中／失敗／中断（ホバーで開始時刻・経路・再発注）。印が無ければ出さない */}
        {research !== 'none' && cell && (() => {
          const b = popoverBind ? popoverBind(cell, 'research') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-research={research}
              aria-label={`${MANDALA_RESEARCH_STATE_LABELS[research]}。詳細を表示`}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: research === 'running' ? '#0E7490' : '#B45309', cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              {compact ? '🔍' : MANDALA_RESEARCH_STATE_LABELS[research]}
            </span>
          );
        })()}
        {/* 312 §3-4: 起こした X 投稿「🐦 n」（ホバーで一覧・投稿へ）。0件は出さない */}
        {xPostCount > 0 && cell && !derived && (() => {
          const b = popoverBind ? popoverBind(cell, 'xposts') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-xposts={xPostCount}
              aria-label={`このマスから起こしたX投稿${xPostCount}本。一覧を表示`}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: '#e0684b', cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              🐦{xPostCount}
            </span>
          );
        })()}
        {/* 309 §3-4: 起こした記事「📝 n」（ホバーで一覧・記事へ）。0件は出さない */}
        {articleCount > 0 && cell && !derived && (() => {
          const b = popoverBind ? popoverBind(cell, 'articles') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-articles={articleCount}
              aria-label={`このマスから起こした記事${articleCount}件。一覧を表示`}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: '#1D9E75', cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              📝{articleCount}
            </span>
          );
        })()}
        {/* 305是正①: コンパクトは優先順（文字数 > 🔗n > 📔n）で先に置く */}
        {compact && cell && !derived && filled && <CharCountBadge n={cell.body.length} unit="字" compact />}
        {compact && cell && !derived && (counts?.total ?? 0) > 0 && (() => {
          const n = counts?.total ?? 0;
          const b = popoverBind ? popoverBind(cell, 'links') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-links={n}
              aria-label={`リンク${n}件。リンク一覧を表示`}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: ACCENT, cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              🔗{n}
            </span>
          );
        })()}
        {/* 304: 件数のあるバッジはホバーでリンク一覧（HoverPopover）。title は付けない（aria-label で読み上げ・R-110）。
            クリックはピン留めで親（マスの編集）へ伝えない（R-81: バッジは操作要素）。選択モード中はクリックを奪わず
            （バッジ以外と同じく選択の切替へ伝える）ホバーだけ効かせる */}
        {cell && !derived && filled && (() => {
          const n = counts?.episode ?? 0;
          const b = n > 0 && popoverBind ? popoverBind(cell, 'episode') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-primary={n}
              aria-label={n > 0 ? `一次情報（エピソード記録）${n}件。リンク一覧を表示` : '一次情報（エピソード記録）のリンクがありません'}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: n > 0 ? '#B45309' : 'var(--text-muted)', opacity: n > 0 ? 1 : 0.55, cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              📔{n}
            </span>
          );
        })()}
        {!compact && cell && !derived && (counts?.total ?? 0) > 0 && (() => {
          const n = counts?.total ?? 0;
          const b = popoverBind ? popoverBind(cell, 'links') : undefined;
          const handlers = b ? (selectMode ? { ...b, onClick: undefined } : b) : {};
          return (
            <span
              data-mandala-cell-links={n}
              aria-label={`リンク${n}件。リンク一覧を表示`}
              role={b ? 'button' : undefined}
              tabIndex={b ? 0 : undefined}
              {...handlers}
              style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: ACCENT, cursor: b ? 'pointer' : 'default', padding: '0 2px', borderRadius: 4 }}
            >
              🔗{n}
            </span>
          );
        })()}
        {!compact && cell && !derived && filled && <CharCountBadge n={cell.body.length} unit="字" compact />}
      </div>

      {/* 304: マスの説明（title）は読む領域だけに付ける。バッジ行の祖先に title があると、バッジのホバーで
          InstantTooltip とポップアップが同時に出るため（R-110: title 併用禁止） */}
      {filled || derived ? (
        <div title={hoverTitle} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          <div
            data-mandala-cell-title
            title={title || undefined}
            style={{
              fontSize: compact ? 11 : 14,
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
          {/* 305是正②: コンパクトでは本文プレビュー（と「（本文なし）」）を出さない。本文の有無は文字数バッジで分かる */}
          {!derived && !compact && (
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
        </div>
      ) : (
        <div
          data-mandala-cell-empty
          title={hoverTitle}
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
          <span style={{ fontSize: compact ? 16 : 28, lineHeight: 1, fontWeight: 300 }}>＋</span>
          {!compact && <span style={{ fontSize: 11 }}>{selectMode ? '空のマス（比較不可）' : isCenter ? 'テーマを書く' : '空のマス'}</span>}
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
  linkCounts,
  selectMode = false,
  checkedIds,
  onToggleSelect,
  popoverBind,
  density = 'normal',
  onExpand,
  blockAttrs,
  articleCounts,
  nowMs,
  xPostCounts,
}: {
  cells: readonly MandalaCell[];
  /** 311: 進行状況の判定に使う現在時刻（省略時は印を出さない） */
  nowMs?: number;
  /** 312: マスごとの起こした X 投稿数 */
  xPostCounts?: ReadonlyMap<string, number>;
  /** 309: マスごとの起こした記事数（省略時は出さない） */
  articleCounts?: ReadonlyMap<string, number>;
  /** null＝第1階層。第2階層（303）は親マスの id を渡す（中央は導出・押せない） */
  parentCellId?: string | null;
  selectedCellId: string | null;
  onSelect: (cell: MandalaCell) => void;
  /** 302: マスごとのリンク件数（linkCountsByCell の結果）。省略時はバッジを出さない */
  linkCounts?: ReadonlyMap<string, MandalaLinkCounts>;
  /** 302 §3-1: 比較の選択モード。true の間はクリックで選択がトグルする */
  selectMode?: boolean;
  checkedIds?: ReadonlySet<string>;
  onToggleSelect?: (cell: MandalaCell) => void;
  /** 304: バッジのホバーポップアップ（省略時は付けない） */
  popoverBind?: PopoverBind;
  /** 305: 81マス表示のブロック内は compact（省略時は従来どおり normal＝9マスの描画は不変・R-88） */
  density?: GridDensity;
  /** 305: 未展開ブロック（第2階層で cell が無い枠）を押したとき。省略時は押せない */
  onExpand?: (parentCellId: string, position: number) => void;
  /** 305: ブロックの目印（data-mandala-block 等）を根の要素に付ける */
  blockAttrs?: Record<string, string | number | undefined>;
}) {
  // 描画順はアウトライン関数から（§4-3⑤・R-74）
  const slots = mandalaGridSlots(cells, parentCellId);
  return (
    <div
      data-mandala-grid
      data-mandala-grid-depth={parentCellId ? '2' : '1'}
      data-mandala-select-mode={selectMode ? '1' : undefined}
      data-mandala-grid-density={density}
      {...blockAttrs}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: density === 'compact' ? 4 : 10,
        maxWidth: density === 'compact' ? undefined : 960,
        minWidth: 0,
      }}
    >
      {slots.map((slot) => (
        <CellCard
          key={slot.position}
          slot={slot}
          selected={!selectMode && !!slot.cell && slot.cell.id === selectedCellId}
          counts={slot.cell ? linkCounts?.get(slot.cell.id) : undefined}
          selectMode={selectMode}
          checked={!!slot.cell && !!checkedIds?.has(slot.cell.id)}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect ?? (() => {})}
          popoverBind={popoverBind}
          density={density}
          onExpand={parentCellId && onExpand ? (pos) => onExpand(parentCellId, pos) : undefined}
          articleCount={slot.cell ? articleCounts?.get(slot.cell.id) ?? 0 : 0}
          nowMs={nowMs}
          xPostCount={slot.cell ? xPostCounts?.get(slot.cell.id) ?? 0 : 0}
        />
      ))}
    </div>
  );
}
