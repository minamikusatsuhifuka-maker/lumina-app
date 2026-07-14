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
import { ThemeSelector } from './ThemeSelector';

type NavItem = { href: string; label: string; icon: string };
type NavCategory = { category: string; items: NavItem[] };

const navCategories: NavCategory[] = [
  {
    category: 'ホーム',
    items: [
      { href: '/dashboard', label: 'ダッシュボード', icon: '🏠' },
      { href: '/dashboard/orchestrator', label: 'AIオーケストレーター', icon: '🤖' },
      { href: '/dashboard/automation-strategy', label: '自動化戦略AI', icon: '🚀' },
      { href: '/dashboard/saved', label: '保存一覧', icon: '🗃' },
      { href: '/dashboard/memo', label: 'AIメモ', icon: '🧭' },
      { href: '/dashboard/guide', label: '使い方ガイド', icon: '📖' },
    ],
  },
  {
    category: '情報収集・調査',
    items: [
      { href: '/dashboard/intelligence', label: 'Intelligence Hub', icon: '🧠' },
      { href: '/dashboard/websearch', label: 'Web情報収集', icon: '🌐' },
      { href: '/dashboard/note', label: 'note検索', icon: '📓' },
      { href: '/dashboard/deepresearch', label: 'ディープリサーチ', icon: '🔭' },
      { href: '/dashboard/investment', label: '投資予測', icon: '📈' },
      { href: '/dashboard/buzz', label: 'バズり分析', icon: '📊' },
      { href: '/dashboard/buzz-patterns', label: 'バズりパターン辞書', icon: '📖' },
      { href: '/dashboard/note-article', label: 'note記事生成', icon: '✍️' },
      { href: '/dashboard/staff-training', label: 'スタッフ育成資料', icon: '📚' },
      { href: '/dashboard/library?tab=スタッフ育成資料', label: 'スタッフ育成ライブラリ', icon: '✍️' },
      { href: '/dashboard/knowledge-tree', label: '知識ツリー', icon: '🌳' },
      { href: '/dashboard/research-glossary', label: '専門用語集', icon: '📚' },
      { href: '/dashboard/context-library', label: 'コンテキストライブラリ', icon: '🧠' },
      { href: '/dashboard/research', label: '文献検索', icon: '🔬' },
      { href: '/dashboard/alerts', label: '定期アラート', icon: '🔔' },
      { href: '/dashboard/fact-check', label: 'ファクトチェック', icon: '✅' },
      { href: '/dashboard/citation', label: '引用元生成', icon: '📚' },
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
      { href: '/dashboard/architecture', label: 'アーキテクチャ設計', icon: '🏗' },
    ],
  },
  {
    category: 'コンテンツ作成',
    items: [
      { href: '/dashboard/text-analysis', label: 'テキスト分析', icon: '📝' },
      { href: '/dashboard/proofread', label: 'テキスト校正', icon: '🔎' },
      { href: '/dashboard/scheduling', label: '日程調整', icon: '🗓️' },
      { href: '/dashboard/write', label: '文章作成', icon: '✍️' },
      { href: '/dashboard/minutes', label: '議事録整理', icon: '📝' },
      { href: '/dashboard/genspark', label: 'Gensparkへ出力', icon: '🎯' },
      { href: '/dashboard/workflow', label: 'ワークフロー', icon: '⚡' },
      { href: '/dashboard/hp-generator', label: 'HP内容生成', icon: '🏠' },
      { href: '/dashboard/copy-generator', label: 'コピー生成', icon: '💬' },
      { href: '/dashboard/ab-test', label: 'ABテスト生成', icon: '🔀' },
      { href: '/dashboard/persona', label: 'ペルソナ生成', icon: '👤' },
      { href: '/dashboard/email-generator', label: 'ステップメール', icon: '📧' },
      { href: '/dashboard/lp-generator', label: 'LP自動生成', icon: '📊' },
      { href: '/dashboard/image-gen', label: '画像生成', icon: '🎨' },
      { href: '/dashboard/gallery', label: '画像ギャラリー', icon: '🖼️' },
      { href: '/dashboard/image-prompt', label: '画像プロンプト', icon: '🎨' },
      { href: '/dashboard/doc-prompt', label: '資料プロンプト', icon: '📋' },
      { href: '/dashboard/simplifier', label: '難易度変換', icon: '🎓' },
      { href: '/dashboard/video-script', label: '動画スクリプト', icon: '🎬' },
      { href: '/dashboard/infographic', label: 'インフォグラフィック', icon: '📊' },
      { href: '/dashboard/storytelling', label: 'ストーリーテリング', icon: '📖' },
      { href: '/dashboard/kindle', label: 'Kindle書籍生成', icon: '📚' },
      { href: '/dashboard/kindle-studio', label: 'Kindle出版スタジオ', icon: '📚' },
      { href: '/dashboard/avatar-studio', label: 'SNSアバタースタジオ', icon: '🎭' },
    ],
  },
  {
    category: '事業・育成・医療',
    items: [
      { href: '/dashboard/business-studio', label: '収益化スタジオ', icon: '💰' },
      { href: '/dashboard/hr-studio', label: '人材育成スタジオ', icon: '🌱' },
      { href: '/dashboard/medical-studio', label: '医療文書スタジオ', icon: '🏥' },
      { href: '/dashboard/nexus', label: 'nexusブランドスタジオ', icon: '🌐' },
      { href: '/dashboard/pricing-strategy', label: '価格戦略', icon: '💴' },
    ],
  },
  {
    category: '管理・設定',
    items: [
      { href: '/dashboard/library', label: 'ライブラリ', icon: '📚' },
      { href: '/dashboard/memory', label: 'AIメモリ', icon: '🧠' },
      { href: '/dashboard/glossary', label: '用語解説', icon: '📘' },
      { href: '/dashboard/analytics', label: 'アナリティクス', icon: '📈' },
      { href: '/dashboard/seo', label: 'SEO分析', icon: '🔍' },
      { href: '/dashboard/competitor', label: '競合分析', icon: '🔬' },
      { href: '/dashboard/conversion', label: 'CV分析', icon: '💰' },
      { href: '/dashboard/contacts', label: '問い合わせ管理', icon: '📞' },
      { href: '/dashboard/reviews', label: '口コミ管理', icon: '⭐' },
      { href: '/dashboard/meo', label: 'SEO/MEO対策', icon: '📍' },
      { href: '/dashboard/stats', label: '使用状況', icon: '📊' },
      { href: '/dashboard/api-usage', label: 'API使用量', icon: '💴' },
      { href: '/dashboard/integrations', label: '外部連携（SaaS）', icon: '🔗' },
    ],
  },
];

// 全メニューを単一ソースから取得（href をユニークIDとして扱い、二重定義しない）
const ALL_NAV_ITEMS: NavItem[] = (() => {
  const map = new Map<string, NavItem>();
  for (const c of navCategories) for (const it of c.items) if (!map.has(it.href)) map.set(it.href, it);
  return [...map.values()];
})();
const ITEM_BY_HREF = new Map(ALL_NAV_ITEMS.map((i) => [i.href, i]));
// 未設定ユーザーのデフォルト＝現状のホーム項目（後方互換）
const DEFAULT_HOME_HREFS: string[] =
  navCategories.find((c) => c.category === 'ホーム')?.items.map((i) => i.href) ?? [];
const HOME_STORAGE_KEY = 'sidebar_home_items';

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
function HomeEditRow({ item, onRemove }: { item: NavItem; onRemove: () => void }) {
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
      <span>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
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
  const [homeHrefs, setHomeHrefs] = useState<string[]>(DEFAULT_HOME_HREFS);
  const [isEditing, setIsEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // localStorage はクライアントで読む（SSRのちらつき・エラー回避）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HOME_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((h) => typeof h === 'string' && ITEM_BY_HREF.has(h));
          if (valid.length > 0) setHomeHrefs(valid);
        }
      }
    } catch {
      /* skip */
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
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, opacity: 0.7 }}>
          ホーム
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
              <HomeEditRow key={item.href} item={item} onRemove={() => save(homeHrefs.filter((h) => h !== item.href))} />
            ))}
            <DragOverlay>
              {activeItem ? (
                <div style={{ ...itemLinkStyle(false), background: 'var(--bg-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  <span>{activeItem.icon}</span>
                  {activeItem.label}
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
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={itemLinkStyle(isActive)}>
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })
      )}
    </div>
  );
}

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
      {/* ホームはユーザー編集可（追加/並び替え/削除）。他カテゴリは固定。 */}
      <EditableHome pathname={pathname} />
      {navCategories.filter(cat => cat.category !== 'ホーム').map(cat => (
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
