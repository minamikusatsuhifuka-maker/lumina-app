'use client';

import Link from 'next/link';
import { useStats } from '@/hooks/useStats';

const STAT_CARDS = [
  { key: 'writings',  icon: '✍️', label: '作成した文章',    href: '/dashboard/write',    color: '#6c63ff' },
  { key: 'library',   icon: '📚', label: '保存したアイテム', href: '/dashboard/library',  color: '#1D9E75' },
  { key: 'memory',    icon: '🧠', label: 'AIメモリ',        href: '/dashboard/memory',   color: '#EF9F27' },
  { key: 'glossary',  icon: '📖', label: '用語解説',        href: '/dashboard/glossary', color: '#378ADD' },
  { key: 'templates', icon: '📋', label: 'テンプレート',    href: '/dashboard/write',    color: '#D4537E' },
  { key: 'workflows', icon: '⚡', label: 'ワークフロー実行', href: '/dashboard/workflow', color: '#854F0B' },
] as const;

export function DashboardStats() {
  const { stats } = useStats();
  const totals = stats?.totals ?? {};

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
      {STAT_CARDS.map(card => (
        <Link key={card.key} href={card.href} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 18px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          textDecoration: 'none', transition: 'background 0.15s',
        }}>
          <span style={{ fontSize: 26 }}>{card.icon}</span>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.color, fontFamily: 'monospace' }}>
              {totals[card.key] ?? 0}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{card.label}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
