'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@/components/SignOutButton';
import { ThemeSelector } from './ThemeSelector';

type NavItem = { href: string; label: string; icon: string };
type NavCategory = { category: string; items: NavItem[] };

const navCategories: NavCategory[] = [
  {
    category: '情報収集・調査',
    items: [
      { href: '/dashboard/intelligence', label: 'Intelligence Hub', icon: '🧠' },
      { href: '/dashboard/websearch', label: 'Web情報収集', icon: '🌐' },
      { href: '/dashboard/note', label: 'note検索', icon: '📓' },
      { href: '/dashboard/deepresearch', label: 'ディープリサーチ', icon: '🔭' },
      { href: '/dashboard/research', label: '文献検索', icon: '🔬' },
      { href: '/dashboard/alerts', label: '定期アラート', icon: '🔔' },
    ],
  },
  {
    category: 'AI分析・戦略',
    items: [
      { href: '/dashboard/analysis', label: 'AI分析エンジン', icon: '🧩' },
      { href: '/dashboard/strategy', label: '経営インテリジェンス', icon: '💼' },
      { href: '/dashboard/industry', label: '業界レポート', icon: '📊' },
      { href: '/dashboard/personas', label: 'AIペルソナ', icon: '🤖' },
      { href: '/dashboard/brainstorm', label: 'ブレスト', icon: '💡' },
    ],
  },
  {
    category: 'コンテンツ作成',
    items: [
      { href: '/dashboard/write', label: '文章作成', icon: '✍️' },
      { href: '/dashboard/minutes', label: '議事録整理', icon: '📝' },
      { href: '/dashboard/genspark', label: 'Gensparkへ出力', icon: '🎯' },
      { href: '/dashboard/workflow', label: 'ワークフロー', icon: '⚡' },
      { href: '/dashboard/hp-generator', label: 'HP内容生成', icon: '🏠' },
    ],
  },
  {
    category: '管理・設定',
    items: [
      { href: '/dashboard/library', label: 'ライブラリ', icon: '📚' },
      { href: '/dashboard/memory', label: 'AIメモリ', icon: '🧠' },
      { href: '/dashboard/glossary', label: '用語解説', icon: '📘' },
      { href: '/dashboard/guide', label: '活用ガイド', icon: '📖' },
      { href: '/dashboard/stats', label: '使用状況', icon: '📊' },
      { href: '/dashboard', label: 'ダッシュボード', icon: '🏠' },
    ],
  },
];

export function DashboardSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ページ遷移時にモバイルメニューを閉じる
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sidebarContent = (
    <>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, textDecoration: 'none' }}>
        <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>x</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>xLUMINA</span>
      </Link>
      {navCategories.map(cat => (
        <div key={cat.category} style={{ marginBottom: 8 }}>
          <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7 }}>
            {cat.category}
          </div>
          {cat.items.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
                fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                background: isActive ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                border: isActive ? '1px solid var(--border)' : '1px solid transparent',
              }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            );
          })}
        </div>
      ))}
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
    </>
  );

  return (
    <>
      {/* モバイル：ハンバーガーボタン */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mobile-hamburger"
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 51,
          width: 36, height: 36, borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
          cursor: 'pointer', display: 'none', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: 'var(--text-primary)',
        }}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* モバイル：オーバーレイ */}
      {mobileOpen && (
        <div
          className="mobile-overlay"
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* サイドバー本体 */}
      <nav
        className={`sidebar-nav ${mobileOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 220, background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          padding: '20px 12px', display: 'flex',
          flexDirection: 'column', gap: 4,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}
      >
        {sidebarContent}
      </nav>

      {/* レスポンシブCSS */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-hamburger { display: flex !important; }
          .sidebar-nav {
            position: fixed !important;
            top: 0; left: 0; z-index: 45;
            transform: translateX(-100%);
            transition: transform 0.2s ease;
          }
          .sidebar-nav.sidebar-open {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
