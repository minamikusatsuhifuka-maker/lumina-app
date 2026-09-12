'use client';

import { formatDraftTime } from '@/lib/feature-drafts';

// 自動下書き（feature_result_drafts）から前回の実行結果を復元したときに表示する共通バナー
//
// ── 332【C】: 1行の細い帯にする ────────────────────────────
// 院長の実測（iPhone・2026/9/12）:「上部が縦に長く、本文が押し下げられる」。
// このバナーは狭幅で2行に折り返して 81.5px を占めていた（広幅 50px）。
// アイコン＋文言＋「✕ クリア」を**必ず1行**に並べ（折り返さない＝`nowrap`）、
// 入りきらない文言だけを省略記号で切る（全文は `title`＝300の即時ツールチップが出す・R-109/R-110）。
// 高さは広幅・狭幅とも現行の半分以下。ボタンは横書きのまま（R-124）。
export default function FeatureDraftBanner({
  restoredAt,
  onClear,
}: {
  restoredAt: string;
  onClear: () => void;
}) {
  const text = `🕘 前回の結果を復元しました（${formatDraftTime(restoredAt)}）`;
  return (
    <div
      data-draft-banner
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        // 332: 折り返さない＝どの幅でも1行（狭幅で2行になって帯が倍になっていた）
        flexWrap: 'nowrap',
        padding: '2px 10px',
        marginBottom: 10,
        background: 'rgba(108,99,255,0.08)',
        border: '1px solid rgba(108,99,255,0.3)',
        borderRadius: 8,
        fontSize: 11,
        lineHeight: 1.4,
        color: 'var(--text-secondary)',
      }}
    >
      <span
        title={text}
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={onClear}
        title="復元した下書きを削除して新規の状態に戻します"
        style={{
          padding: '0 8px',
          fontSize: 10,
          lineHeight: 1.4,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ✕ クリア
      </button>
    </div>
  );
}
