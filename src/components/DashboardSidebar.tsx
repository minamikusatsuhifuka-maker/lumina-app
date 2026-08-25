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
  resolveHomeHrefs,
  type NavItem,
} from '@/lib/nav-items';
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
function EditableHome({ pathname }: { pathname: string }) {
  const { navLabels } = useTheme();
  const labelOf = (i: NavItem) => navLabelOf(navLabels, i.href, i.label);
  const iconOf = (i: NavItem) => navIconOf(navLabels, i.href, i.icon);
  const [homeHrefs, setHomeHrefs] = useState<string[]>(DEFAULT_HOME_HREFS);
  const [isEditing, setIsEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // localStorage はクライアントで読む（SSRのちらつき・エラー回避）。
  // 262: 解決規則は resolveHomeHrefs（nav-items.ts）に一本化（🎛表示設定と共有）
  useEffect(() => {
    try {
      setHomeHrefs(resolveHomeHrefs(localStorage.getItem(HOME_STORAGE_KEY)));
    } catch {
      /* localStorage 自体が使えない環境は既定のまま */
    }
  }, []);

  const save = (next: string[]) => {
    setHomeHrefs(next);
    try {
      localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* skip */
    }
  };

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
                onRemove={() => save(homeHrefs.filter((h) => h !== item.href))}
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
                  onClick={() => save([...homeHrefs, c.href])}
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
            </Link>
          );
        })
      )}
    </div>
  );
}

export function DashboardSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const { navLabels } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ページ遷移時にモバイルメニューを閉じる
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sidebarContent = (
    <>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, textDecoration: 'none' }}>
        <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>x</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>xLUMINA</span>
      </Link>
      {/* ホームはユーザー編集可（追加/並び替え/削除）。他カテゴリは固定。 */}
      <EditableHome pathname={pathname} />
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
