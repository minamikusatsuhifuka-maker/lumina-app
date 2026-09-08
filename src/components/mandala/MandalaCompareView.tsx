'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 302 §3: 同一チャート内の複数マスを横並びで比較（閲覧のみ・編集は301のパネルへ）
//
// 新規に組まない（R-91）: 271→289→290→291 の比較UIの共通部品（CompareGrid: 同期スクロール・sticky列ヘッダー・
// 高さプリセット・列数ピッカー）と判断（lib/batch-compare.ts: 列数の解決・列クラス・保持）を**そのまま**使う。
// LibraryCompareView は「リサーチ保存の行（title/content/種別・上限4件・コピー/DL）」に結びついた部品で、
// マス（位置ラベル・上限9件・編集への導線）には型も操作も合わないため、290/291 と同じく
// **判断ロジックと CompareGrid の部品を共有し、列の中身だけをここで描く**。
// 列数は resolveCompareColumns が 4 で頭打ち → 5件以上は4列で折り返す（幅の段階は compareGridClass の CSS 側）。
// 本文は MarkdownBody（R-97）。文字数は CharCountBadge。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState } from 'react';
import { MarkdownBody } from '@/components/MarkdownBody';
import { CharCountBadge } from '@/components/LibraryItemRow';
import {
  type CompareColumnChoice,
  type CompareHeightPreset,
  compareGridClass,
  loadColumnChoice,
  loadHeightPreset,
  resolveCompareColumns,
  saveColumnChoice,
  saveHeightPreset,
} from '@/lib/batch-compare';
import { useFinePointer } from '@/lib/pointer-device';
import {
  CompareColumnShell,
  CompareColumnsPicker,
  CompareHeightPicker,
  CompareSyncToggle,
  compareCompactBtnStyle,
  useSyncedScroll,
} from '@/components/deepresearch/CompareGrid';
import { MANDALA_COMPARE_MAX, MANDALA_POSITION_LABELS, cellDisplayTitle, type MandalaCell } from '@/lib/mandala-shared';

export default function MandalaCompareView({
  cells,
  onClose,
  onEdit,
  labelOf,
}: {
  /** 選んだ順・埋まっている実在マスだけ（compareCellsOf で絞ったもの） */
  cells: MandalaCell[];
  onClose: () => void;
  /** 比較画面から該当マスの編集（301のサイドパネル）を開く導線 */
  onEdit: (cell: MandalaCell) => void;
  /** 305: 列の位置ラベル（第2階層は「親 › 子」）。省略時は自マスの位置ラベル */
  labelOf?: (cell: MandalaCell) => string;
}) {
  const { fine, mounted } = useFinePointer();
  const [syncScroll, setSyncScroll] = useState(true);
  // 289 の列数・高さは localStorage を共有（バッチ比較・モデル比較・リサーチ保存と同じ値）
  const [colChoice, setColChoice] = useState<CompareColumnChoice>('auto');
  const [heightPreset, setHeightPreset] = useState<CompareHeightPreset>('high');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { setColRef, handleScroll } = useSyncedScroll(syncScroll);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColChoice(loadColumnChoice());
    setHeightPreset(loadHeightPreset());
  }, []);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const cols = resolveCompareColumns(cells.length, mounted ? fine : true, colChoice);
  const applyColChoice = (c: CompareColumnChoice) => {
    setColChoice(c);
    saveColumnChoice(c);
  };
  const applyHeight = (h: CompareHeightPreset) => {
    setHeightPreset(h);
    saveHeightPreset(h);
  };

  return (
    <div ref={rootRef} data-mandala-compare style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          ⇔ 選択した{cells.length}マスを横並びで比較（最大{MANDALA_COMPARE_MAX}件・1行最大4列）
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(!mounted || fine) && <CompareColumnsPicker value={colChoice} onChange={applyColChoice} />}
          <CompareHeightPicker value={heightPreset} onChange={applyHeight} />
          <CompareSyncToggle checked={syncScroll} onChange={setSyncScroll} />
          <button
            type="button"
            data-compare-close
            onClick={onClose}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
          >
            ✕ 閉じる
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        列は選んだ順。各列の見出しは位置ラベルとマスのタイトルです。比較は閲覧のみ（✏️で編集パネルを開けます）。
        {mounted && !fine && '（この端末では1列ずつ表示します）'}
      </div>

      {cells.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          比較するマスがありません。埋まっているマスを2つ以上選んでください。
        </div>
      ) : (
        <div className={compareGridClass(cols, colChoice)} data-compare-cols={cols} data-compare-cols-mode={colChoice === 'auto' ? 'auto' : 'manual'} data-compare-height={heightPreset}>
          {cells.map((cell, i) => {
            const pos = labelOf ? labelOf(cell) : (MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position));
            return (
              <CompareColumnShell
                key={cell.id}
                index={i}
                heightPreset={heightPreset}
                colRef={setColRef(i)}
                onScroll={() => handleScroll(i)}
                extraAttrs={{ 'data-compare-item': cell.id, 'data-compare-position': cell.position }}
                header={
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cellDisplayTitle(cell)}>
                      <span data-compare-position-label style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(108,99,255,0.12)', color: '#6c63ff', marginRight: 6 }}>
                        {pos}
                      </span>
                      {cellDisplayTitle(cell)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <CharCountBadge n={cell.body.length} unit="字" compact />
                      <button type="button" data-mandala-compare-edit={cell.id} onClick={() => onEdit(cell)} style={compareCompactBtnStyle} title="このマスを編集パネルで開く">
                        ✏️ 編集
                      </button>
                    </div>
                  </>
                }
              >
                {cell.body.trim() ? (
                  <MarkdownBody text={cell.body} style={{ padding: 12, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }} />
                ) : (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>（本文がありません・タイトルのみ）</div>
                )}
              </CompareColumnShell>
            );
          })}
        </div>
      )}
    </div>
  );
}
