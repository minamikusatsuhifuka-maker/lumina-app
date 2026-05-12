'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ALL_SHORTCUTS = [
  { id: 'deepresearch', label: 'ディープリサーチ', icon: '🔍', href: '/dashboard/deepresearch' },
  { id: 'text-analysis', label: 'テキスト分析', icon: '📝', href: '/dashboard/text-analysis' },
  { id: 'write', label: '文章作成', icon: '✍️', href: '/dashboard/write' },
  { id: 'sns-post', label: 'SNS投稿', icon: '📱', href: '/dashboard/sns-post' },
  { id: 'context-library', label: 'コンテキスト', icon: '🧠', href: '/dashboard/context-library' },
  { id: 'knowledge-tree', label: '知識ツリー', icon: '🌳', href: '/dashboard/knowledge-tree' },
  { id: 'note', label: 'note検索', icon: '📓', href: '/dashboard/note' },
  { id: 'web', label: 'Web情報収集', icon: '🌐', href: '/dashboard/websearch' },
  { id: 'fact-check', label: 'ファクトチェック', icon: '✅', href: '/dashboard/fact-check' },
  { id: 'glossary', label: '専門用語集', icon: '📚', href: '/dashboard/research-glossary' },
  { id: 'analysis', label: 'AI分析', icon: '🧩', href: '/dashboard/analysis' },
  { id: 'competitor', label: '競合分析', icon: '⚔️', href: '/dashboard/competitor' },
  { id: 'architecture', label: 'アーキテクチャ', icon: '🏗', href: '/dashboard/architecture' },
  { id: 'business-studio', label: '収益化', icon: '💰', href: '/dashboard/business-studio' },
  { id: 'hr-studio', label: '人材育成', icon: '🌱', href: '/dashboard/hr-studio' },
  { id: 'medical-studio', label: '医療文書', icon: '🏥', href: '/dashboard/medical-studio' },
  { id: 'pricing-strategy', label: '価格戦略', icon: '💴', href: '/dashboard/pricing-strategy' },
  { id: 'kindle', label: 'Kindle生成', icon: '📖', href: '/dashboard/kindle' },
  { id: 'kindle-studio', label: 'Kindle出版', icon: '📚', href: '/dashboard/kindle-studio' },
  { id: 'reviews', label: '口コミ管理', icon: '⭐', href: '/dashboard/reviews' },
  { id: 'analytics', label: 'アナリティクス', icon: '📈', href: '/dashboard/analytics' },
  { id: 'clinic-settings', label: 'クリニック設定', icon: '⚙️', href: '/dashboard/clinic-settings' },
  { id: 'batch-research', label: 'バッチリサーチ', icon: '⚡', href: '/dashboard/deepresearch?tab=batch' },
  { id: 'automation', label: '自動化戦略', icon: '🚀', href: '/dashboard/automation-strategy' },
];

const DEFAULT_SHORTCUTS = [
  'deepresearch',
  'text-analysis',
  'business-studio',
  'hr-studio',
  'medical-studio',
];
const STORAGE_KEY = 'xlumina_shortcuts_v2';

export default function ShortcutBar() {
  const router = useRouter();
  const [shortcuts, setShortcuts] = useState<string[]>(DEFAULT_SHORTCUTS);
  const [isEditing, setIsEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setShortcuts(parsed);
      }
    } catch {
      /* skip */
    }
  }, []);

  const save = (next: string[]) => {
    setShortcuts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* skip */
    }
  };

  const handleDragStart = (index: number, id: string) => {
    dragIndex.current = index;
    setDragId(id);
  };

  const handleDragEnter = (index: number, id: string) => {
    dragOverIndex.current = index;
    setDragOverId(id);
  };

  const handleDragEnd = () => {
    if (dragIndex.current === null || dragOverIndex.current === null) return;
    const next = [...shortcuts];
    const [removed] = next.splice(dragIndex.current, 1);
    next.splice(dragOverIndex.current, 0, removed);
    save(next);
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDragId(null);
    setDragOverId(null);
  };

  const toggle = (id: string) => {
    save(
      shortcuts.includes(id)
        ? shortcuts.filter((s) => s !== id)
        : [...shortcuts, id],
    );
  };

  const activeShortcuts = shortcuts
    .map((id) => ALL_SHORTCUTS.find((s) => s.id === id))
    .filter((s): s is (typeof ALL_SHORTCUTS)[number] => Boolean(s));

  return (
    <div style={{ marginBottom: 16 }}>
      {/* ショートカットバー本体 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          padding: '8px 12px',
          background: 'var(--bg-secondary, #f9fafb)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 10,
        }}
      >
        {activeShortcuts.map((sc, index) => (
          <div
            key={sc.id}
            draggable={isEditing}
            onDragStart={() => handleDragStart(index, sc.id)}
            onDragEnter={() => handleDragEnter(index, sc.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{
              position: 'relative',
              opacity: dragId === sc.id ? 0.4 : 1,
              transform:
                dragOverId === sc.id && dragId !== sc.id
                  ? 'scale(1.08)'
                  : 'scale(1)',
              transition: 'transform 0.1s',
            }}
          >
            <button
              type="button"
              onClick={() => !isEditing && router.push(sc.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--bg-primary, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-primary, #374151)',
                cursor: isEditing ? 'grab' : 'pointer',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isEditing) {
                  (e.currentTarget as HTMLElement).style.background =
                    'var(--bg-hover, #f3f4f6)';
                  (e.currentTarget as HTMLElement).style.borderColor =
                    '#9ca3af';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  'var(--bg-primary, #fff)';
                (e.currentTarget as HTMLElement).style.borderColor =
                  'var(--border, #e5e7eb)';
              }}
            >
              <span style={{ fontSize: 13 }}>{sc.icon}</span>
              <span>{sc.label}</span>
              {isEditing && (
                <span
                  style={{ fontSize: 10, color: '#9ca3af', marginLeft: 1 }}
                >
                  ⠿
                </span>
              )}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => toggle(sc.id)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  fontSize: 9,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            background: isEditing ? '#4f46e5' : 'transparent',
            color: isEditing ? '#fff' : '#9ca3af',
            border: `1px solid ${isEditing ? '#4f46e5' : '#e5e7eb'}`,
            borderRadius: 6,
            fontSize: 11,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isEditing ? '✓ 完了' : '⚙ 編集'}
        </button>
      </div>

      {/* 編集モード：追加パレット */}
      {isEditing && (
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            background: 'var(--bg-primary, #fff)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 10,
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted, #6b7280)',
              marginBottom: 8,
            }}
          >
            追加するメニューを選択・ドラッグで並び替え
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {ALL_SHORTCUTS.map((sc) => {
              const active = shortcuts.includes(sc.id);
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => toggle(sc.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: active ? '#ede9fe' : '#f9fafb',
                    border: `1px solid ${active ? '#a78bfa' : '#e5e7eb'}`,
                    color: active ? '#5b21b6' : '#374151',
                  }}
                >
                  <span>{sc.icon}</span>
                  <span>{sc.label}</span>
                  {active && <span style={{ fontSize: 9 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
