'use client';

import { useEffect, useState } from 'react';

// 機能ページ上部に表示する「現在の背景情報」エリア
// featureKey に対応するデフォルト背景情報をAPIから取得して表示
// onChange で「実際にAIに渡す」コンテキストの配列を親に伝える

export interface DefaultContextItem {
  id: number;
  contextSaveId: number | null;
  topic: string;
  contextText: string;
  source: 'live' | 'snapshot';
  snapshotAt?: string;
}

interface Props {
  featureKey: string;
  onChange?: (activeContexts: DefaultContextItem[]) => void;
}

export default function DefaultContextBar({ featureKey, onChange }: Props) {
  const [items, setItems] = useState<DefaultContextItem[]>([]);
  const [activeIds, setActiveIds] = useState<Set<number>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureKey]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feature-default-contexts?feature=${encodeURIComponent(featureKey)}`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: DefaultContextItem[] = data.items ?? [];
      setItems(fetched);
      // 初期状態: すべてON、削除なし
      const ids = new Set(fetched.map(i => i.id));
      setActiveIds(ids);
      setRemovedIds(new Set());
      onChange?.(fetched);
    } catch {
      // 無視
    } finally {
      setLoading(false);
    }
  };

  const updateParent = (nextActive: Set<number>, nextRemoved: Set<number>) => {
    const active = items.filter(i => nextActive.has(i.id) && !nextRemoved.has(i.id));
    onChange?.(active);
  };

  const toggleActive = (id: number) => {
    setActiveIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      updateParent(next, removedIds);
      return next;
    });
  };

  const removeOnce = (id: number) => {
    setRemovedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      updateParent(activeIds, next);
      return next;
    });
  };

  const refreshSnapshot = async () => {
    try {
      await fetch('/api/cron/feature-contexts-snapshot', { method: 'POST' });
    } catch {}
    await load();
  };

  if (loading) return null;

  const visibleItems = items.filter(i => !removedIds.has(i.id));
  if (visibleItems.length === 0) return null;

  // 合計トークン量の簡易概算（日本語 1.5char/token）
  const totalChars = visibleItems
    .filter(i => activeIds.has(i.id))
    .reduce((sum, i) => sum + (i.contextText?.length ?? 0), 0);
  const estimatedTokens = Math.round(totalChars / 1.5);
  const overLimit = estimatedTokens > 50000;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
        border: '1px solid var(--border-accent, rgba(108,99,255,0.3))',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' as const, gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          📌 現在のAI参照素材（デフォルト読み込み済み）
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: overLimit ? '#ef4444' : 'var(--text-muted)' }}>
            約 {estimatedTokens.toLocaleString()} トークン
            {overLimit && ' ⚠️ 多すぎ'}
          </span>
          <button
            type="button"
            onClick={refreshSnapshot}
            title="スナップショットを最新化"
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            🔄 最新化
          </button>
          <a
            href="/dashboard/context-library"
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              textDecoration: 'none',
            }}
          >
            ⚙️ 設定を編集
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {visibleItems.map((item) => {
          const isActive = activeIds.has(item.id);
          const isSnapshot = item.source === 'snapshot';
          const isExpanded = expanded === item.id;
          return (
            <div
              key={item.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 10px',
                background: 'var(--bg-primary)',
                border: `1px solid ${isSnapshot ? '#f59e0b' : 'var(--border)'}`,
                borderRadius: 8,
                opacity: isActive ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleActive(item.id)}
                  style={{ accentColor: '#6c63ff' }}
                />
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {isSnapshot ? '⚠️ ' : '✅ '}{item.topic}
                  {isSnapshot && (
                    <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 8 }}>
                      (元データ削除済み・コピーから復元)
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeOnce(item.id)}
                  title="一時的に外す（次回起動時はまた表示）"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  ×
                </button>
              </div>
              {isExpanded && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)',
                    padding: 8,
                    borderRadius: 6,
                    whiteSpace: 'pre-wrap' as const,
                    maxHeight: 240,
                    overflowY: 'auto',
                    lineHeight: 1.6,
                  }}
                >
                  {item.contextText}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 選択されたデフォルト背景情報をシステムプロンプト用テキストへ整形するユーティリティ
export function buildDefaultContextText(items: DefaultContextItem[]): string {
  if (!items || items.length === 0) return '';
  return items
    .map(c => `【${c.topic}】\n${(c.contextText ?? '').slice(0, 2000)}`)
    .join('\n\n---\n\n');
}
