'use client';

type Props = {
  loading: boolean;
  progress: number; // 0〜100
  label?: string;
};

export function ProgressBar({ loading, progress, label }: Props) {
  if (!loading) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      {/* ラベル */}
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 120 }}>
        {label || 'AI処理中...'}
      </span>

      {/* バー */}
      <div style={{
        flex: 1, height: 8, background: 'var(--border)',
        borderRadius: 99, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-secondary, #00d4b8))',
          borderRadius: 99,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* パーセント */}
      <span style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent)',
        minWidth: 40, textAlign: 'right',
      }}>
        {Math.round(progress)}%
      </span>
    </div>
  );
}
