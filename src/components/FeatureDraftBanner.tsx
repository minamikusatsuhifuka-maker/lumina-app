'use client';

import { formatDraftTime } from '@/lib/feature-drafts';

// 自動下書き（feature_result_drafts）から前回の実行結果を復元したときに表示する共通バナー
export default function FeatureDraftBanner({
  restoredAt,
  onClear,
}: {
  restoredAt: string;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 14px',
        marginBottom: 16,
        background: 'rgba(108,99,255,0.08)',
        border: '1px solid rgba(108,99,255,0.3)',
        borderRadius: 10,
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}
    >
      <span>🕘 前回の結果を復元しました（{formatDraftTime(restoredAt)}）</span>
      <button
        type="button"
        onClick={onClear}
        title="復元した下書きを削除して新規の状態に戻します"
        style={{
          padding: '4px 12px',
          fontSize: 12,
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
