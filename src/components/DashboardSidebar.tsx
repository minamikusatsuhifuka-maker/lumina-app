'use client';
import { useState, useEffect, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
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
  parseHrefList,
  resolveHomeHrefs,
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

// 編集モードのホーム項目（ドラッグハンドル＋×削除）
function HomeEditRow({
  item,
  onRemove,
  label,
  icon,
}: {
  item: NavItem;
  onRemove: () => void;
  label: string;
  icon: string;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: item.href });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: item.href });
  const setRef = (el: HTMLElement | null) => {
    dragRef(el);
    dropRef(el);
  };
  return (
    <div
      ref={setRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--text-muted)',
        background: isOver ? 'var(--accent-soft)' : 'transparent',
        border: isOver ? '1px dashed var(--border)' : '1px solid transparent',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }} aria-label="ドラッグして並び替え">
        ⠿
      </span>
      <span>{icon}</span>
      <span style={navTextStyle} title={label === item.label ? undefined : `既定名: ${item.label}`}>
        {label}
      </span>
      <button
        onClick={onRemove}
        aria-label="ホームから削除"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 14, padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

// 「ホーム」カテゴリ（ユーザー編集可：追加／ドラッグ並び替え／削除。保存は localStorage・後方互換）
// 303: 並び（homeHrefs）と保存は親（DashboardSidebar）が持つ＝検索結果の「非表示」判定と同じ値を見る
function EditableHome({
  pathname,
  homeHrefs,
  onSave,
  todayYmd,
}: {
  pathname: string;
  homeHrefs: string[];
  onSave: (next: string[], removedHref?: string, addedHref?: string) => void;
  todayYmd: string;
}) {
  const { navLabels } = useTheme();
  const labelOf = (i: NavItem) => navLabelOf(navLabels, i.href, i.label);
  const iconOf = (i: NavItem) => navIconOf(navLabels, i.href, i.icon);
  const [isEditing, setIsEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const save = (next: string[], removedHref?: string, addedHref?: string) => onSave(next, removedHref, addedHref);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const activeHref = String(e.active.id);
    const overHref = e.over ? String(e.over.id) : null;
    if (!overHref || activeHref === overHref) return;
    const from = homeHrefs.indexOf(activeHref);
    const to = homeHrefs.indexOf(overHref);
    if (from < 0 || to < 0) return;
    const next = [...homeHrefs];
    next.splice(from, 1);
    next.splice(to, 0, activeHref);
    save(next);
  };

  const items = homeHrefs.map((h) => ITEM_BY_HREF.get(h)).filter((x): x is NavItem => !!x);
  const candidates = ALL_NAV_ITEMS.filter((i) => !homeHrefs.includes(i.href));
  const activeItem = activeId ? ITEM_BY_HREF.get(activeId) : null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
        <span
          data-nav-category="ホーム"
          style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {navCategoryLabelOf(navLabels, 'ホーム')}
        </span>
        <button
          onClick={() => {
            setIsEditing((v) => !v);
            setShowPicker(false);
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: 0 }}
        >
          {isEditing ? '完了' : '✏️編集'}
        </button>
      </div>

      {isEditing ? (
        <>
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {items.map((item) => (
              <HomeEditRow
                key={item.href}
                item={item}
                label={labelOf(item)}
                icon={iconOf(item)}
                onRemove={() => save(homeHrefs.filter((h) => h !== item.href), item.href)}
              />
            ))}
            <DragOverlay>
              {activeItem ? (
                <div style={{ ...itemLinkStyle(false), background: 'var(--bg-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  <span>{iconOf(activeItem)}</span>
                  <span style={navTextStyle}>{labelOf(activeItem)}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <button
            onClick={() => setShowPicker((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
          >
            ＋ メニューを追加
          </button>
          {showPicker && (
            <div style={{ marginTop: 4, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
              {candidates.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>追加できるメニューはありません</div>
              )}
              {candidates.map((c) => (
                <button
                  key={c.href}
                  onClick={() => save([...homeHrefs, c.href], undefined, c.href)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left' as const }}
                >
                  <span>{iconOf(c)}</span>
                  <span style={navTextStyle}>{labelOf(c)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        items.map((item) => {
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
        })
      )}
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
  const [homeHrefs, setHomeHrefs] = useState<string[]>(DEFAULT_HOME_HREFS);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<NavOrder>('standard');
  const [todayYmd, setTodayYmd] = useState('');
  useEffect(() => {
    // localStorage・現在日はクライアントでしか読めない（レンダー中に読むとSSRとズレる）＝マウント後に1回だけ反映する
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHomeHrefs(resolveHomeHrefs(localStorage.getItem(HOME_STORAGE_KEY), localStorage.getItem(HOME_REMOVED_STORAGE_KEY)));
      setOrder(parseNavOrder(localStorage.getItem(NAV_ORDER_STORAGE_KEY)));
    } catch {
      /* localStorage 自体が使えない環境は既定のまま */
    }
    setTodayYmd(jstDateString());
  }, []);
  // ホームの保存。外した定義上のホーム項目は墓標（sidebar_home_removed）に、戻したら墓標から消す（§5 合流の対象外にする）
  const saveHome = (next: string[], removedHref?: string, addedHref?: string) => {
    setHomeHrefs(next);
    try {
      localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(next));
      const removed = new Set(parseHrefList(localStorage.getItem(HOME_REMOVED_STORAGE_KEY)) ?? []);
      if (removedHref && DEFAULT_HOME_HREFS.includes(removedHref)) removed.add(removedHref);
      if (addedHref) removed.delete(addedHref);
      localStorage.setItem(HOME_REMOVED_STORAGE_KEY, JSON.stringify([...removed]));
    } catch {
      /* skip */
    }
  };
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
      <EditableHome pathname={pathname} homeHrefs={homeHrefs} onSave={saveHome} todayYmd={todayYmd} />
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
