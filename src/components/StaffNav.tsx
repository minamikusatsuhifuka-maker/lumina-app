'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const items = [
  { href: '/staff', label: 'ホーム', icon: '🏠' },
  { href: '/staff/tasks', label: '私のタスク', icon: '✅' },
  { href: '/staff/strategy', label: '戦略・計画', icon: '🗺' },
  { href: '/staff/grade', label: '等級・評価', icon: '🏅' },
  { href: '/staff/surveys', label: 'アンケート', icon: '📝' },
  { href: '/staff/exams', label: '試験', icon: '📋' },
  { href: '/staff/handbook', label: 'ハンドブック', icon: '📖' },
  { href: '/staff/growth', label: '成長計画', icon: '✨' },
];

export function StaffNav() {
  const pathname = usePathname();
  return (
    <>
      {/* PC サイドバー */}
      <nav style={{ width: 180, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2 }} className="hidden-mobile">
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8,
              textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 400,
              background: active ? 'rgba(108,99,255,0.12)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              border: active ? '1px solid rgba(108,99,255,0.2)' : '1px solid transparent',
            }}><span>{item.icon}</span>{item.label}</Link>
          );
        })}
      </nav>
      {/* モバイル ボトムナビ */}
      <style>{`
        @media (min-width: 769px) { .staff-bottom-nav { display: none !important; } }
        @media (max-width: 768px) { .hidden-mobile { display: none !important; } }
      `}</style>
      <div className="staff-bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'var(--sidebar-bg)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '6px 0', overflowX: 'auto' }}>
        {items.slice(0, 5).map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', fontSize: 10, color: active ? '#6c63ff' : 'var(--text-muted)', padding: '4px 8px' }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
