'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/admin', label: '管理ダッシュボード', icon: '📊' },
  { href: '/admin/philosophy', label: '理念管理', icon: '📖' },
  { href: '/admin/staff', label: 'スタッフ管理', icon: '👥' },
  { href: '/admin/surveys', label: 'アンケート管理', icon: '📝' },
  { href: '/admin/exams', label: '試験管理', icon: '📋' },
  { href: '/admin/grade', label: '等級制度', icon: '🏅' },
  { href: '/admin/grade/compare', label: '等級比較表', icon: '📊' },
  { href: '/admin/grade/philosophy', label: '成長哲学', icon: '🌟' },
  { href: '/admin/grade/definitions', label: '職種・役職定義', icon: '📌' },
  { href: '/admin/grade/mindset', label: 'マインド成長', icon: '🌱' },
  { href: '/admin/evaluation', label: '評価制度', icon: '📋' },
  { href: '/admin/handbook', label: 'ハンドブック', icon: '📖' },
  { href: '/admin/strategy', label: '経営戦略', icon: '🗺' },
  { href: '/admin/tasks', label: 'タスク管理', icon: '✅' },
];

const subLinks = [
  { href: '/dashboard', label: '通常ダッシュボード', icon: '🏠' },
];

export function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <nav style={{
      width: 220, background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border)',
      padding: '20px 12px', display: 'flex',
      flexDirection: 'column', gap: 4,
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, textDecoration: 'none' }}>
        <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #ec4899)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>A</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>LUMINA Admin</span>
      </Link>

      {navItems.map(item => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
            fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
            background: isActive ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            border: isActive ? '1px solid var(--border)' : '1px solid transparent',
          }}>
            <span>{item.icon}</span>{item.label}
          </Link>
        );
      })}

      <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

      {subLinks.map(item => (
        <Link key={item.href} href={item.href} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
          fontSize: 13, fontWeight: 500, color: 'var(--text-muted)',
          border: '1px solid transparent',
        }}>
          <span>{item.icon}</span>{item.label}
        </Link>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #6c63ff, #ec4899)', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600 }}>
            {userName?.charAt(0).toUpperCase()}
          </span>
          {userName}
          <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(236,72,153,0.15)', color: '#ec4899' }}>Admin</span>
        </div>
      </div>
    </nav>
  );
}
