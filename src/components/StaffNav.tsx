'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { category: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    category: 'ホーム',
    items: [
      { href: '/staff', label: 'ホーム', icon: '🏠' },
    ],
  },
  {
    category: '成長・学び',
    items: [
      { href: '/staff/growth', label: '成長計画', icon: '✨' },
      { href: '/staff/grade', label: '等級・評価', icon: '🏅' },
      { href: '/staff/circle', label: '成長の地図', icon: '🔵' },
      { href: '/staff/one-on-one', label: '1on1振り返り', icon: '🤝' },
    ],
  },
  {
    category: '業務・学習',
    items: [
      { href: '/staff/tasks', label: '私のタスク', icon: '✅' },
      { href: '/staff/exams', label: '試験', icon: '📋' },
      { href: '/staff/surveys', label: 'アンケート', icon: '📝' },
      { href: '/staff/near-miss', label: '気づきシェア', icon: '💛' },
    ],
  },
  {
    category: '理念・知識',
    items: [
      { href: '/staff/handbook', label: 'ハンドブック', icon: '📖' },
      { href: '/staff/strategy', label: '戦略・計画', icon: '🗺' },
      { href: '/staff/quotes', label: '金言', icon: '📚' },
    ],
  },
];

const allItems = navGroups.flatMap(g => g.items);

export function StaffNav() {
  const pathname = usePathname();
  return (
    <>
      {/* PC サイドバー */}
      <nav style={{
        width: 190, flexShrink: 0, borderRight: '1px solid var(--border)',
        padding: '16px 10px', display: 'flex', flexDirection: 'column',
        gap: 0, overflowY: 'auto',
      }} className="hidden-mobile">
        {navGroups.map((group, gi) => (
          <div key={group.category} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--text-primary)', opacity: 0.7,
              padding: '10px 10px 4px',
              textTransform: 'uppercase',
              borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
              marginTop: gi > 0 ? 6 : 0,
            }}>
              {group.category}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(108,99,255,0.12)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(108,99,255,0.2)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* モバイル ボトムナビ */}
      <style>{`
        @media (min-width: 769px) { .staff-bottom-nav { display: none !important; } }
        @media (max-width: 768px) { .hidden-mobile { display: none !important; } }
      `}</style>
      <div className="staff-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--sidebar-bg)', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around', padding: '6px 0', overflowX: 'auto',
      }}>
        {[
          { href: '/staff', label: 'ホーム', icon: '🏠' },
          { href: '/staff/growth', label: '成長', icon: '✨' },
          { href: '/staff/circle', label: '地図', icon: '🔵' },
          { href: '/staff/tasks', label: 'タスク', icon: '✅' },
          { href: '/staff/handbook', label: '知識', icon: '📖' },
        ].map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, textDecoration: 'none', fontSize: 10,
              color: active ? '#6c63ff' : 'var(--text-muted)', padding: '4px 8px',
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
