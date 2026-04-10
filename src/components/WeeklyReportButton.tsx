'use client';

import { useState } from 'react';

export function WeeklyReportButton() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      await fetch('/api/weekly-report', { method: 'POST' });
      setDone(true);
    } finally { setLoading(false); }
  };

  return (
    <button onClick={generate} disabled={loading || done} style={{
      padding: '5px 14px', borderRadius: 8, border: '1px solid var(--border)',
      background: 'var(--bg-secondary)', color: done ? '#22c55e' : 'var(--text-secondary)',
      fontSize: 12, cursor: loading || done ? 'default' : 'pointer', fontWeight: 500,
      opacity: loading ? 0.6 : 1,
    }}>
      {done ? '✅ レポート保存済み' : loading ? '生成中...' : '📅 週次レポートを今すぐ生成'}
    </button>
  );
}
