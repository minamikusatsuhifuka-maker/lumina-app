'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const ROUTE_MAP: Record<string, { label: string; parent?: string }> = {
  '/admin': { label: '管理ダッシュボード' },
  '/admin/staff': { label: 'スタッフ支援', parent: '/admin' },
  '/admin/staff/summary': { label: '成長サマリー', parent: '/admin/staff' },
  '/admin/staff-evaluation': { label: 'スタッフ評価', parent: '/admin' },
  '/admin/one-on-one': { label: '1on1ミーティング', parent: '/admin' },
  '/admin/one-on-one/staff': { label: 'スタッフ別サマリー', parent: '/admin/one-on-one' },
  '/admin/applicants': { label: '採用AI分析', parent: '/admin' },
  '/admin/grade': { label: '等級制度', parent: '/admin' },
  '/admin/grade/mindset': { label: 'マインド成長', parent: '/admin/grade' },
  '/admin/grade/compare': { label: '等級比較表', parent: '/admin/grade' },
  '/admin/grade/philosophy': { label: '成長哲学', parent: '/admin/grade' },
  '/admin/grade/definitions': { label: '職種・役職定義', parent: '/admin/grade' },
  '/admin/handbook': { label: 'ハンドブック', parent: '/admin' },
  '/admin/philosophy': { label: '理念管理', parent: '/admin' },
  '/admin/criteria': { label: 'AIの判断基準', parent: '/admin' },
  '/admin/red-zone': { label: '行動基準', parent: '/admin' },
  '/admin/employment-rules': { label: '就業規則', parent: '/admin' },
  '/admin/evaluation': { label: '評価制度', parent: '/admin' },
  '/admin/surveys': { label: 'アンケート管理', parent: '/admin' },
  '/admin/exams': { label: '試験管理', parent: '/admin' },
  '/admin/strategy': { label: '経営戦略', parent: '/admin' },
  '/admin/tasks': { label: 'タスク管理', parent: '/admin' },
};

function buildBreadcrumbs(pathname: string): { href: string; label: string }[] {
  // 動的ルート（/admin/staff/[id]など）を処理
  const segments = pathname.split('/').filter(Boolean);

  // 静的ルートを優先マッチ
  const staticMatch = ROUTE_MAP[pathname];
  if (staticMatch) {
    const crumbs: { href: string; label: string }[] = [];
    let current: string | undefined = pathname;
    while (current) {
      const info: { label: string; parent?: string } | undefined = ROUTE_MAP[current];
      if (!info) break;
      crumbs.unshift({ href: current, label: info.label });
      current = info.parent;
    }
    return crumbs;
  }

  // 動的ルート（[id]を含むURL）
  if (segments.length >= 3 && segments[0] === 'admin') {
    const parent = '/' + segments.slice(0, -1).join('/');
    const parentInfo = ROUTE_MAP[parent];
    const crumbs: { href: string; label: string }[] = [
      { href: '/admin', label: '管理ダッシュボード' },
    ];
    if (parentInfo) {
      crumbs.push({ href: parent, label: parentInfo.label });
    }
    crumbs.push({ href: pathname, label: '詳細' });
    return crumbs;
  }

  return [{ href: '/admin', label: '管理ダッシュボード' }];
}

export function AdminBreadcrumb() {
  const pathname = usePathname();
  if (pathname === '/admin') return null; // トップは不要

  const crumbs = buildBreadcrumbs(pathname);
  if (crumbs.length <= 1) return null;

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: 'var(--border)' }}>›</span>}
          {i === crumbs.length - 1 ? (
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{crumb.label}</span>
          ) : (
            <Link href={crumb.href} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
