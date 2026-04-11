'use client';

interface FreshnessIndicatorProps {
  savedAt: string;
  showWarning?: boolean;
}

export function FreshnessIndicator({ savedAt, showWarning = false }: FreshnessIndicatorProps) {
  const now = new Date();
  const saved = new Date(savedAt);
  const diffMs = now.getTime() - saved.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let color: string;
  let emoji: string;
  let label: string;
  let warning = '';

  if (days <= 7) {
    color = '#22c55e';
    emoji = '🟢';
    label = `${days}日前`;
  } else if (days <= 30) {
    color = '#eab308';
    emoji = '🟡';
    label = `${days}日前`;
  } else if (days <= 90) {
    color = '#f97316';
    emoji = '🟠';
    label = `${days}日前`;
    warning = '情報が古くなっている可能性があります';
  } else {
    color = '#ef4444';
    emoji = '🔴';
    label = `${days}日前`;
    warning = '情報が非常に古くなっています。更新を検討してください';
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 10px',
          borderRadius: 12,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          fontSize: 12,
          fontWeight: 600,
          color,
        }}
      >
        <span>{emoji}</span>
        {label}
      </span>
      {showWarning && warning && (
        <span style={{ fontSize: 11, color: '#f97316', fontWeight: 500 }}>
          ⚠ {warning}
        </span>
      )}
    </span>
  );
}
