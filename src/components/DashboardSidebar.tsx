'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@/components/SignOutButton';
import { ThemeSelector } from './ThemeSelector';

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: '🏠' },
  { href: '/dashboard/intelligence', label: 'Intelligence Hub', icon: '🧠' },
  { href: '/dashboard/analysis', label: 'AI分析エンジン', icon: '🧩' },
  { href: '/dashboard/strategy', label: '経営インテリジェンス', icon: '💼' },
  { href: '/dashboard/personas', label: 'AIペルソナ', icon: '🤖' },
  { href: '/dashboard/research', label: '文献検索', icon: '🔬' },
  { href: '/dashboard/websearch', label: 'Web情報収集', icon: '🌐' },
  { href: '/dashboard/deepresearch', label: 'ディープリサーチ', icon: '🔭' },
  { href: '/dashboard/write', label: '文章作成', icon: '✍️' },
  { href: '/dashboard/alerts', label: '定期アラート', icon: '🔔' },
  { href: '/dashboard/genspark', label: 'Gensparkへ出力', icon: '🎯' },
  { href: '/dashboard/library', label: 'ライブラリ', icon: '📚' },
  { href: '/dashboard/guide', label: '活用ガイド', icon: '📖' },
  { href: '/dashboard/glossary', label: '用語解説', icon: '📘' },
];

export function DashboardSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <nav style={{
      width: 220, background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border)',
      padding: '20px 12px', display: 'flex',
      flexDirection: 'column', gap: 4,
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto'
    }}>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, textDecoration: 'none' }}>
        <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>L</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>LUMINA</span>
      </Link>
      {navItems.map(item => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
            fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
            background: isActive ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            border: isActive ? '1px solid var(--border)' : '1px solid transparent',
          }}>
            <span>{item.icon}</span>{item.label}
          </Link>
        );
      })}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600 }}>
            {userName?.charAt(0).toUpperCase()}
          </span>
          {userName}
        </div>
        <a href="/dashboard/pricing" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 13, color: '#f5a623', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', marginBottom: 4 }}>
          💳 Pro にアップグレード
        </a>
        <ThemeSelector />
        <SignOutButton />
      </div>
    </nav>
  );
}
