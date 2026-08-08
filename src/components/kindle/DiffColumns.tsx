'use client';

// 236C: 左右2カラムの差分表示。
// 左＝原文／右＝変換後。削除＝赤（打ち消し）／追加＝緑／変更なし＝通常。
//
// 既存の ProofreadDiffPane は「候補の before/after が既知」という前提の位置ベース
// ハイライトのため、全文が入れ替わるテイスト変換には使えない。こちらは lib/text-diff.ts の
// 汎用差分（AI不使用・依存ゼロ）を描画する専用部品として新設した。
//
// テキストは React ノードとして描画するため自動エスケープされる（dangerouslySetInnerHTML 不使用）。

import { useMemo } from 'react';
import { buildDiffRows, describeDiffStats, type DiffRow, type InlinePart } from '@/lib/text-diff';

const CELL_BASE: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 13,
  lineHeight: 1.9,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  verticalAlign: 'top',
  width: '50%',
  borderBottom: '1px solid var(--border)',
};

function partStyle(op: InlinePart['op']): React.CSSProperties {
  if (op === 'removed') return { background: 'rgba(239,68,68,0.18)', color: '#dc2626', textDecoration: 'line-through' };
  if (op === 'added') return { background: 'rgba(34,197,94,0.18)', color: '#16a34a' };
  return {};
}

function Parts({ parts, fallback }: { parts?: InlinePart[]; fallback: string }) {
  if (!parts || parts.length === 0) return <>{fallback}</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={partStyle(p.op)}>
          {p.text}
        </span>
      ))}
    </>
  );
}

function rowCells(row: DiffRow) {
  // 行まるごとの追加/削除は、セル全体に淡い背景を敷いて左右の対応を見やすくする
  const leftBg = row.op === 'removed' ? 'rgba(239,68,68,0.06)' : row.op === 'added' ? 'var(--bg-secondary)' : undefined;
  const rightBg = row.op === 'added' ? 'rgba(34,197,94,0.06)' : row.op === 'removed' ? 'var(--bg-secondary)' : undefined;
  return { leftBg, rightBg };
}

export default function DiffColumns({
  original,
  revised,
  leftLabel = '原文',
  rightLabel = '変換後',
  maxHeight = 460,
}: {
  original: string;
  revised: string;
  leftLabel?: string;
  rightLabel?: string;
  maxHeight?: number;
}) {
  const { rows, stats } = useMemo(() => buildDiffRows(original, revised), [original, revised]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{describeDiffStats(stats)}</span>
        <span>
          <span style={{ background: 'rgba(239,68,68,0.18)', color: '#dc2626', textDecoration: 'line-through', padding: '0 4px', borderRadius: 3 }}>削除</span>
          {' / '}
          <span style={{ background: 'rgba(34,197,94,0.18)', color: '#16a34a', padding: '0 4px', borderRadius: 3 }}>追加</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {original.length.toLocaleString()}字 → {revised.length.toLocaleString()}字
        </span>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: '50%', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{leftLabel}</div>
          <div style={{ width: '50%', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', borderLeft: '1px solid var(--border)' }}>
            {rightLabel}
          </div>
        </div>
        <div style={{ maxHeight, overflowY: 'auto', background: 'var(--bg-primary)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              {rows.map((row, i) => {
                const { leftBg, rightBg } = rowCells(row);
                return (
                  <tr key={i}>
                    <td style={{ ...CELL_BASE, background: leftBg, color: 'var(--text-secondary)' }}>
                      {row.left === null ? (
                        <span style={{ color: 'var(--text-muted)' }}> </span>
                      ) : row.op === 'changed' ? (
                        <Parts parts={row.leftParts} fallback={row.left} />
                      ) : row.op === 'removed' ? (
                        <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>{row.left}</span>
                      ) : (
                        row.left
                      )}
                    </td>
                    <td style={{ ...CELL_BASE, background: rightBg, color: 'var(--text-secondary)', borderLeft: '1px solid var(--border)' }}>
                      {row.right === null ? (
                        <span style={{ color: 'var(--text-muted)' }}> </span>
                      ) : row.op === 'changed' ? (
                        <Parts parts={row.rightParts} fallback={row.right} />
                      ) : row.op === 'added' ? (
                        <span style={{ color: '#16a34a' }}>{row.right}</span>
                      ) : (
                        row.right
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
