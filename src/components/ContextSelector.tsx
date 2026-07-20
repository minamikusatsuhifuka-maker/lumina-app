'use client';

import { useEffect, useState } from 'react';

export interface ContextItem {
  id: number;
  title: string;
  content: string;
  category: string;
  source: string;
  feature_tags?: string[];
  created_at: string;
}

interface ContextSelectorProps {
  // 'medical' | 'hr' | 'business' | 'kindle' | 'nexus' | 'blog' | 'all' など
  featureKey: string;
  onSelect: (contexts: ContextItem[]) => void;
  selectedIds?: number[];
}

// 各機能ページに置いて、保存済み背景情報を選択しAIに渡すための共通UI
// 選択された背景情報の配列を onSelect コールバックで親へ通知する
export default function ContextSelector({
  featureKey,
  onSelect,
  selectedIds = [],
}: ContextSelectorProps) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [selected, setSelected] = useState<number[]>(selectedIds);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void loadContexts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureKey]);

  const loadContexts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/context?feature=${encodeURIComponent(featureKey)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ContextItem[] };
      setItems(data.items ?? []);
    } catch (err) {
      console.error('[ContextSelector] 取得エラー:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItem = (id: number) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(next);
    onSelect(items.filter((item) => next.includes(item.id)));
  };

  const selectedCount = selected.length;

  // 表示する内容がない場合は完全に非表示
  if (!isLoading && items.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          background:
            selectedCount > 0 ? 'rgba(234,88,12,0.1)' : 'var(--bg-secondary)',
          border: `1px solid ${selectedCount > 0 ? '#ea580c' : 'var(--border)'}`,
          borderRadius: 8,
          fontSize: 13,
          cursor: 'pointer',
          color: selectedCount > 0 ? '#ea580c' : 'var(--text-secondary)',
          fontWeight: selectedCount > 0 ? 600 : 400,
        }}
      >
        🧠 AI参照素材
        {selectedCount > 0 && (
          <span
            style={{
              background: '#ea580c',
              color: '#fff',
              borderRadius: '50%',
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
            }}
          >
            {selectedCount}
          </span>
        )}
        <span style={{ fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: 6,
            padding: 12,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {isLoading ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                padding: 10,
              }}
            >
              読み込み中...
            </p>
          ) : items.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                padding: 10,
              }}
            >
              AI参照素材がありません。ディープリサーチから保存できます。
            </p>
          ) : (
            <>
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                AIに読み込ませる素材を選択してください
              </p>
              {items.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      marginBottom: 4,
                      background: isSelected
                        ? 'rgba(234,88,12,0.06)'
                        : 'transparent',
                      border: `1px solid ${
                        isSelected ? 'rgba(234,88,12,0.2)' : 'transparent'
                      }`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItem(item.id)}
                      style={{ marginTop: 2, accentColor: '#ea580c' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          marginBottom: 2,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {item.source === 'deepresearch' && '🔍 '}
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {(item.content ?? '').slice(0, 80)}...
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                        }}
                      >
                        {new Date(item.created_at).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 選択された背景情報をシステムプロンプト用テキストへ整形するユーティリティ
export function buildContextText(contexts: ContextItem[]): string {
  if (!contexts || contexts.length === 0) return '';
  return contexts
    .map((c) => `【${c.title}】\n${(c.content ?? '').slice(0, 2000)}`)
    .join('\n\n---\n\n');
}
