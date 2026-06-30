'use client';

import React from 'react';

// MEO/SEO ハブ（/dashboard/meo）共通の表示パーツ・スタイル。
// 147 の page.tsx と同じ見た目を踏襲し、148 の新タブから流用する。

export interface AdCheck {
  status?: 'ok' | 'warn';
  findings?: string[];
}

export const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 14,
};
export const badge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  marginTop: 4,
  boxSizing: 'border-box',
};
export const primaryBtn: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 18px',
  background: '#0f766e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};
export const smallBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 10px' }}>{children}</h2>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ ...card, background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c' }}>
      {message}
      {onRetry && (
        <button onClick={onRetry} style={{ ...smallBtn, marginLeft: 12 }}>
          再試行
        </button>
      )}
    </div>
  );
}

export function AdCheckBadge({ adCheck }: { adCheck?: AdCheck }) {
  if (!adCheck) return null;
  const warn = adCheck.status === 'warn';
  return (
    <span style={{ ...badge, color: warn ? '#b45309' : '#15803d', background: warn ? '#fef3c7' : '#dcfce7' }}>
      医療広告 {warn ? '△ 要確認' : '◎ OK'}
    </span>
  );
}

export function AdCheckFindings({ adCheck }: { adCheck?: AdCheck }) {
  if (!adCheck || adCheck.status !== 'warn' || !adCheck.findings?.length) return null;
  return (
    <ul style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>
      {adCheck.findings.map((f, j) => (
        <li key={j}>{f}</li>
      ))}
    </ul>
  );
}

export function scoreColor(n: number): string {
  if (n >= 80) return '#15803d';
  if (n >= 50) return '#b45309';
  return '#b91c1c';
}
