'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Command = {
  id: string;
  label: string;
  icon: string;
  category: string;
  href?: string;
  action?: string;
};

const COMMANDS: Command[] = [
  // ページ移動
  { id: 'nav-dashboard',     label: 'ダッシュボードへ',        icon: '🏠', category: 'ページ移動', href: '/dashboard' },
  { id: 'nav-intelligence',  label: 'Intelligence Hub',         icon: '🧠', category: 'ページ移動', href: '/dashboard/intelligence' },
  { id: 'nav-websearch',     label: 'Web情報収集へ',            icon: '🌐', category: 'ページ移動', href: '/dashboard/websearch' },
  { id: 'nav-deepresearch',  label: 'ディープリサーチへ',       icon: '🔭', category: 'ページ移動', href: '/dashboard/deepresearch' },
  { id: 'nav-write',         label: '文章作成へ',               icon: '✍️', category: 'ページ移動', href: '/dashboard/write' },
  { id: 'nav-analysis',      label: 'AI分析エンジンへ',         icon: '🧩', category: 'ページ移動', href: '/dashboard/analysis' },
  { id: 'nav-strategy',      label: '経営インテリジェンスへ',   icon: '💼', category: 'ページ移動', href: '/dashboard/strategy' },
  { id: 'nav-brainstorm',    label: 'ブレストへ',               icon: '💡', category: 'ページ移動', href: '/dashboard/brainstorm' },
  { id: 'nav-library',       label: 'ライブラリへ',             icon: '📚', category: 'ページ移動', href: '/dashboard/library' },
  { id: 'nav-workflow',      label: 'ワークフローへ',           icon: '⚡', category: 'ページ移動', href: '/dashboard/workflow' },
  { id: 'nav-glossary',      label: '用語解説へ',               icon: '📖', category: 'ページ移動', href: '/dashboard/glossary' },
  { id: 'nav-memory',        label: 'AIメモリへ',               icon: '🧠', category: 'ページ移動', href: '/dashboard/memory' },
  { id: 'nav-minutes',       label: '議事録整理へ',             icon: '📝', category: 'ページ移動', href: '/dashboard/minutes' },
  { id: 'nav-alerts',        label: '定期アラートへ',           icon: '🔔', category: 'ページ移動', href: '/dashboard/alerts' },
  { id: 'nav-industry',      label: '業界レポートへ',           icon: '📊', category: 'ページ移動', href: '/dashboard/industry' },
  { id: 'nav-guide',         label: '活用ガイドへ',             icon: '📘', category: 'ページ移動', href: '/dashboard/guide' },

  // クイックアクション
  { id: 'action-new-write',    label: '新しい文章を作成',        icon: '✍️', category: 'クイックアクション', href: '/dashboard/write' },
  { id: 'action-new-search',   label: 'Web検索を開始',           icon: '🔍', category: 'クイックアクション', href: '/dashboard/websearch' },
  { id: 'action-new-workflow',  label: 'ワークフローを実行',     icon: '⚡', category: 'クイックアクション', href: '/dashboard/workflow' },
  { id: 'action-library',      label: 'ライブラリを開く',        icon: '📚', category: 'クイックアクション', href: '/dashboard/library' },
  { id: 'action-memory',       label: 'AIメモリを確認',          icon: '🧠', category: 'クイックアクション', href: '/dashboard/memory' },
  { id: 'action-new-memory',   label: 'AIメモリを追加',          icon: '🧠', category: 'クイックアクション', href: '/dashboard/memory' },
  { id: 'action-glossary',     label: '用語を解説する',          icon: '📖', category: 'クイックアクション', href: '/dashboard/glossary' },
  { id: 'action-stats',        label: '使用状況を確認',          icon: '📊', category: 'クイックアクション', href: '/dashboard/stats' },
  { id: 'action-settings',     label: '設定を開く',              icon: '⚙️', category: 'クイックアクション', href: '/dashboard/guide' },

  // テーマ切り替え
  { id: 'theme-dark',     label: 'ダークモードに切替',   icon: '🌙', category: 'テーマ', action: 'theme-dark' },
  { id: 'theme-light',    label: 'ライトモードに切替',   icon: '☀️', category: 'テーマ', action: 'theme-light' },
  { id: 'theme-midnight', label: 'ミッドナイトに切替',   icon: '🌃', category: 'テーマ', action: 'theme-midnight' },
  { id: 'theme-nature',   label: 'ネイチャーに切替',     icon: '🌿', category: 'テーマ', action: 'theme-nature' },
];

const HISTORY_KEY = 'lumina-cmd-history';
const MAX_HISTORY = 5;

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(id: string) {
  const prev = getHistory().filter(h => h !== id);
  const next = [id, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd+K / Ctrl+K でトグル
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
        setActiveIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 開いた時にフォーカス
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  // 最近使ったコマンドを取得
  const recentCommands: Command[] = isOpen && !query.trim()
    ? getHistory()
        .map(id => COMMANDS.find(c => c.id === id))
        .filter((c): c is Command => !!c)
    : [];

  // フィルタリング（カテゴリも検索対象）
  const filteredCommands = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  // 最近使ったコマンド + 通常コマンドをグルーピング
  const allCommands: Command[] = [
    ...recentCommands.map(c => ({ ...c, category: '🕐 最近使った機能' })),
    ...filteredCommands,
  ];

  const grouped = allCommands.reduce<{ category: string; commands: Command[] }[]>((acc, cmd) => {
    const group = acc.find(g => g.category === cmd.category);
    if (group) group.commands.push(cmd);
    else acc.push({ category: cmd.category, commands: [cmd] });
    return acc;
  }, []);

  // フラットインデックス用
  const flatList = grouped.flatMap(g => g.commands);

  const executeAction = useCallback((action: string) => {
    // テーマ切り替え: data-theme属性を変更してlocalStorageに保存
    const themeMap: Record<string, string> = {
      'theme-dark': 'dark',
      'theme-light': 'light',
      'theme-midnight': 'midnight',
      'theme-nature': 'nature',
    };
    const theme = themeMap[action];
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('lumina-theme', theme);
    }
  }, []);

  const execute = useCallback((cmd: Command) => {
    setIsOpen(false);
    setQuery('');
    saveHistory(cmd.id);
    if (cmd.action) {
      executeAction(cmd.action);
    } else if (cmd.href) {
      router.push(cmd.href);
    }
  }, [router, executeAction]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[activeIndex]) execute(flatList[activeIndex]);
    }
  };

  // queryが変わったらactiveIndexをリセット
  useEffect(() => { setActiveIndex(0); }, [query]);

  // アクティブアイテムをスクロール追従
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  let flatIdx = -1;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' }}
      onClick={() => setIsOpen(false)}
    >
      <div
        style={{ width: '100%', maxWidth: 560, background: 'var(--bg-secondary)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 検索バー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <input
            ref={inputRef}
            autoFocus
            placeholder="ページ移動・機能・テーマを検索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Esc</kbd>
        </div>

        {/* コマンドリスト */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {grouped.map(({ category, commands }) => (
            <div key={category}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '8px 16px 3px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                {category}
              </div>
              {commands.map(cmd => {
                flatIdx++;
                const idx = flatIdx;
                const isActive = activeIndex === idx;
                return (
                  <div
                    key={`${cmd.id}-${category}`}
                    data-idx={idx}
                    onClick={() => execute(cmd)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', cursor: 'pointer', fontSize: 14,
                      background: isActive ? 'var(--accent-soft)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      transition: 'background 0.08s',
                    }}
                  >
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{cmd.icon}</span>
                    <span style={{ fontWeight: isActive ? 600 : 400 }}>{cmd.label}</span>
                    {cmd.action && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>アクション</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatList.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
              「{query}」に一致するコマンドが見つかりません
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 10 }}>↑↓</kbd> 移動</span>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 10 }}>Enter</kbd> 実行</span>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 10 }}>Esc</kbd> 閉じる</span>
          <span style={{ marginLeft: 'auto' }}><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 10 }}>⌘K</kbd> で開く</span>
        </div>
      </div>
    </div>
  );
}
