'use client';
import { useState, useEffect, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@/components/SignOutButton';
// 251: サイドバーの表示名・アイコンの上書き（ThemeProvider が一元管理・localStorage保存）
import { useTheme } from './ThemeProvider';
import { navCategoryLabelOf, navIconOf, navLabelOf } from '@/lib/nav-labels';
// 251: メニュー定義は lib/nav-items.ts が正本（🎛表示設定のリネームUIと共有）
import {
  navCategories,
  ALL_NAV_ITEMS,
  ITEM_BY_HREF,
  DEFAULT_HOME_HREFS,
  HOME_STORAGE_KEY,
  HOME_REMOVED_STORAGE_KEY,
  HOME_LAYOUT_EVENT,
  homeHrefsOf,
  resolveHomeLayout,
  type HomeEntry,
  type NavItem,
} from '@/lib/nav-items';
// 303: メニュー検索・追加順・新着の印（純関数）
import {
  NAV_HIDDEN_LABEL,
  NAV_NEW_LABEL,
  NAV_ORDER_STORAGE_KEY,
  type NavOrder,
  filterNavCategories,
  formatAddedShort,
  formatAddedTitle,
  isNewMenu,
  parseNavOrder,
  sortByAddedDesc,
} from '@/lib/nav-search';
import { jstDateString } from '@/lib/jst';
import { ThemeSelector } from './ThemeSelector';

// 251: 変更後の名前が長くてもサイドバー(220px)を崩さないための省略表示。
// 上限12文字で切ってはいるが、文字サイズ4段階（最大140%）でも溢れないよう二重に守る。
const navTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function itemLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.15s',
    background: isActive ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'transparent',
    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
    border: isActive ? '1px solid var(--border)' : '1px solid transparent',
  };
}

// 「ホーム」カテゴリの描画（306: 編集はサイドバー内で行わず、専用ページ /dashboard/settings/menu に移した。
// ここは区切り見出し込みの並びを描くだけ。保存形式・合流・墓標は 303/306 の nav-items.ts が正本）
function HomeSection({
  pathname,
  entries,
  todayYmd,
}: {
  pathname: string;
  entries: HomeEntry[];
  todayYmd: string;
}) {
  const { navLabels } = useTheme();
  const labelOf = (i: NavItem) => navLabelOf(navLabels, i.href, i.label);
  const iconOf = (i: NavItem) => navIconOf(navLabels, i.href, i.icon);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
        <span
          data-nav-category="ホーム"
          style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {navCategoryLabelOf(navLabels, 'ホーム')}
        </span>
        <Link
          href="/dashboard/settings/menu"
          data-nav-home-edit
          title="ホームの並び・区切りを編集するページへ"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: 0, textDecoration: 'none' }}
        >
          ✏️編集
        </Link>
      </div>
      {entries.map((e) => {
        if (e.kind === 'divider') {
          // 306 §2-3: 区切り見出し。グループ見出しと同じ見た目・押せない
          return (
            <div
              key={`div:${e.id}`}
              data-nav-divider={e.id}
              style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {e.label || '（区切り）'}
            </div>
          );
        }
        const item = ITEM_BY_HREF.get(e.href);
        if (!item) return null;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-nav-href={item.href}
            style={itemLinkStyle(isActive)}
            title={labelOf(item) === item.label ? undefined : `既定名: ${item.label}`}
          >
            <span>{iconOf(item)}</span>
            <span style={navTextStyle}>{labelOf(item)}</span>
            <NewBadge item={item} todayYmd={todayYmd} />
          </Link>
        );
      })}
    </div>
  );
}

// 303 §4-3: 追加から14日以内の項目に付ける短い印。追加日は title（InstantTooltip が即時に出す・R-110）
function NewBadge({ item, todayYmd }: { item: NavItem; todayYmd: string }) {
  if (!todayYmd || !isNewMenu(item.addedAt, todayYmd)) return null;
  return (
    <span
      data-nav-new={item.href}
      title={formatAddedTitle(item.addedAt)}
      style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'rgba(180,83,9,0.14)', color: '#B45309', flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {NAV_NEW_LABEL}
    </span>
  );
}

// 303 §3-1: 検索結果の「ホームから外している項目」の印（R-109: 幅固定・省略記号）
function HiddenMark() {
  return (
    <span
      data-nav-hidden-mark
      style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', flexShrink: 0, maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {NAV_HIDDEN_LABEL}
    </span>
  );
}

export function DashboardSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const { navLabels } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const labelOf = (i: NavItem) => navLabelOf(navLabels, i.href, i.label);
  const iconOf = (i: NavItem) => navIconOf(navLabels, i.href, i.icon);

  // 303: ホームの並び（localStorage・262の resolveHomeHrefs で解決＋§5 の合流）、検索語、並び順、JST の今日
  const [homeEntries, setHomeEntries] = useState<HomeEntry[]>(() => DEFAULT_HOME_HREFS.map((href) => ({ kind: 'item', href })));
  const homeHrefs = homeHrefsOf(homeEntries);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<NavOrder>('standard');
  const [todayYmd, setTodayYmd] = useState('');
  useEffect(() => {
    // localStorage・現在日はクライアントでしか読めない（レンダー中に読むとSSRとズレる）＝マウント後に1回だけ反映する。
    // 306: ホーム編集ページ（同じ文書内）が保存したら HOME_LAYOUT_EVENT で即時に追従する（サイドバーが確認画面を兼ねる）
    const readHome = () => {
      try {
        setHomeEntries(resolveHomeLayout(localStorage.getItem(HOME_STORAGE_KEY), localStorage.getItem(HOME_REMOVED_STORAGE_KEY)));
      } catch {
        /* localStorage 自体が使えない環境は既定のまま */
      }
    };
    try {
      readHome();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrder(parseNavOrder(localStorage.getItem(NAV_ORDER_STORAGE_KEY)));
    } catch {
      /* localStorage 自体が使えない環境は既定のまま */
    }
    setTodayYmd(jstDateString());
    window.addEventListener(HOME_LAYOUT_EVENT, readHome);
    return () => window.removeEventListener(HOME_LAYOUT_EVENT, readHome);
  }, []);
  const applyOrder = (o: NavOrder) => {
    setOrder(o);
    try {
      localStorage.setItem(NAV_ORDER_STORAGE_KEY, o);
    } catch {}
  };

  // ページ遷移時にモバイルメニューを閉じる
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const searchHits = query.trim() ? filterNavCategories(navCategories, query, labelOf, homeHrefs, ITEM_BY_HREF) : null;
  const renderLink = (item: NavItem, extra?: { hidden?: boolean; showDate?: boolean }) => {
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        data-nav-href={item.href}
        style={itemLinkStyle(isActive)}
        title={labelOf(item) === item.label ? undefined : `既定名: ${item.label}`}
      >
        <span>{iconOf(item)}</span>
        <span style={navTextStyle}>{labelOf(item)}</span>
        {extra?.hidden && <HiddenMark />}
        <NewBadge item={item} todayYmd={todayYmd} />
        {extra?.showDate && (
          <span data-nav-added-date={item.addedAt} title={formatAddedTitle(item.addedAt)} style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatAddedShort(item.addedAt)}
          </span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, textDecoration: 'none' }}>
        <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>x</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>xLUMINA</span>
      </Link>
      {/* 303 §3-1/§4-2: 検索欄と並び順の切替（ロゴ直下・スクロールしても見える sticky）。見た目の幅・文字サイズ・余白は変えない */}
      <div
        data-nav-search-bar
        style={{ position: 'sticky', top: -20, zIndex: 2, background: 'var(--sidebar-bg)', padding: '4px 0 6px', marginBottom: 8 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
          <input
            data-nav-search
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="🔍 メニューを検索"
            aria-label="メニューを検索"
            style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          {query && (
            <button
              type="button"
              data-nav-search-clear
              onClick={() => setQuery('')}
              aria-label="検索を消す"
              title="検索を消す（Esc）"
              style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
            >
              ✕
            </button>
          )}
        </div>
        <div data-nav-order-toggle style={{ display: 'flex', gap: 2, padding: '4px 4px 0' }}>
          {([
            { key: 'standard', label: '標準', tip: '標準の並び（カテゴリ順）' },
            { key: 'added', label: '追加順', tip: '追加した順（新しい順・カテゴリ見出しなし）' },
          ] as { key: NavOrder; label: string; tip: string }[]).map((o) => (
            <button
              key={o.key}
              type="button"
              data-nav-order={o.key}
              aria-pressed={order === o.key}
              onClick={() => applyOrder(o.key)}
              title={o.tip}
              style={{ flex: 1, fontSize: 10, fontWeight: order === o.key ? 700 : 500, padding: '3px 0', borderRadius: 6, border: `1px solid ${order === o.key ? 'var(--accent, #6c63ff)' : 'var(--border)'}`, background: order === o.key ? 'var(--accent-soft, rgba(108,99,255,0.12))' : 'transparent', color: order === o.key ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {searchHits ? (
        // ── 検索中: 一致項目のあるカテゴリだけ（見出しも）。ホームから外している項目は「非表示」印付きで出す ──
        <div data-nav-search-results>
          {searchHits.length === 0 ? (
            <div data-nav-search-empty style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span>該当なし</span>
              <button type="button" data-nav-search-reset onClick={() => setQuery('')} style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                入力を消す
              </button>
            </div>
          ) : (
            searchHits.map((cat) => (
              <div key={cat.category} data-nav-search-category={cat.category} style={{ marginBottom: 8 }}>
                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {navCategoryLabelOf(navLabels, cat.category)}
                </div>
                {cat.hits.map((h) => renderLink(h.item, { hidden: h.hidden }))}
              </div>
            ))
          )}
        </div>
      ) : order === 'added' ? (
        // ── 追加順: 新しい順に平坦（グループ見出しは出さない＝追加順とカテゴリ順は両立しないため）。日付を添える ──
        <div data-nav-added-list>
          {sortByAddedDesc(ALL_NAV_ITEMS).map((item) => renderLink(item, { showDate: true }))}
        </div>
      ) : (
        <>
      {/* ホームはユーザー編集可（追加/並び替え/削除）。他カテゴリは固定。 */}
      <HomeSection pathname={pathname} entries={homeEntries} todayYmd={todayYmd} />
      {navCategories.filter(cat => cat.category !== 'ホーム').map(cat => (
        <div key={cat.category} style={{ marginBottom: 8 }}>
          <div
            data-nav-category={cat.category}
            style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {navCategoryLabelOf(navLabels, cat.category)}
          </div>
          {cat.items.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-nav-href={item.href}
                title={
                  navLabelOf(navLabels, item.href, item.label) === item.label
                    ? undefined
                    : `既定名: ${item.label}`
                }
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
                  fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                  background: isActive ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                <span>{navIconOf(navLabels, item.href, item.icon)}</span>
                <span style={navTextStyle}>{navLabelOf(navLabels, item.href, item.label)}</span>
                <NewBadge item={item} todayYmd={todayYmd} />
              </Link>
            );
          })}
        </div>
      ))}
        </>
      )}
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
            /* globals.css の「nav { display:none !important }」に勝つため明示（詳細度: .sidebar-nav > nav）。
               これが無いとドロワー本体が描画されず開かない。 */
            display: flex !important;
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
