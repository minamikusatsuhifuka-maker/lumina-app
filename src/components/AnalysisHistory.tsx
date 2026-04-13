'use client';

import { useState, useEffect, useCallback } from 'react';

export type AnalysisPageType = 'seo' | 'conversion' | 'competitor' | 'contacts';

interface SaveRecord<T = unknown> {
  id: number;
  page_type: AnalysisPageType;
  title: string | null;
  data: T;
  created_at: string;
}

interface Props<T> {
  pageType: AnalysisPageType;
  currentData: T | null;
  canSave: boolean;
  buildTitle: (data: T) => string;
  buildMarkdown: (data: T) => string;
  themeColor?: string;
}

export function AnalysisHistory<T>({
  pageType,
  currentData,
  canSave,
  buildTitle,
  buildMarkdown,
  themeColor = '#6c63ff',
}: Props<T>) {
  const [saves, setSaves] = useState<SaveRecord<T>[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchSaves = useCallback(async () => {
    try {
      const res = await fetch(`/api/analysis-saves?page_type=${pageType}&limit=5`);
      if (!res.ok) return;
      const json = await res.json();
      setSaves(json.saves ?? []);
    } catch {
      // 無視
    }
  }, [pageType]);

  useEffect(() => {
    fetchSaves();
  }, [fetchSaves]);

  const save = async () => {
    if (!canSave || !currentData) return;
    setSaving(true);
    try {
      const res = await fetch('/api/analysis-saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_type: pageType,
          title: buildTitle(currentData),
          data: currentData,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '保存に失敗しました');
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      await fetchSaves();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const downloadMd = (s: SaveRecord<T>) => {
    const md = buildMarkdown(s.data);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageType}-${s.id}-${s.created_at.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteSave = async (id: number) => {
    if (!confirm('この履歴を削除しますか？')) return;
    try {
      await fetch(`/api/analysis-saves?id=${id}`, { method: 'DELETE' });
      await fetchSaves();
    } catch {
      // 無視
    }
  };

  return (
    <>
      {/* 保存ボタン */}
      {canSave && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={save}
            disabled={saving || savedFlash}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: savedFlash ? '1px solid rgba(16,185,129,0.3)' : 'none',
              cursor: saving || savedFlash ? 'default' : 'pointer',
              background: savedFlash
                ? 'rgba(16,185,129,0.1)'
                : `linear-gradient(135deg, ${themeColor}, #00d4b8)`,
              color: savedFlash ? '#10b981' : '#fff',
              fontWeight: 700,
              fontSize: 13,
              boxShadow: savedFlash ? 'none' : `0 4px 14px ${themeColor}40`,
              transition: 'all 0.2s',
            }}
          >
            {savedFlash ? '✅ 保存済み' : saving ? '保存中…' : '💾 この分析を保存'}
          </button>
        </div>
      )}

      {/* 履歴セクション */}
      {saves.length > 0 && (
        <div
          style={{
            marginBottom: 24,
            padding: 18,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📚 過去の分析履歴
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                background: 'var(--bg-primary)',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              最新{saves.length}件
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {saves.map((s) => {
              const isExpanded = expandedId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--bg-primary)',
                    overflow: 'hidden',
                    transition: 'all 0.15s',
                  }}
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.title || '(無題)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(s.created_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  {isExpanded && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadMd(s);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            border: `1px solid ${themeColor}`,
                            background: `${themeColor}10`,
                            color: themeColor,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          📥 MDでダウンロード
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSave(s.id);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.06)',
                            color: '#ef4444',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🗑 削除
                        </button>
                      </div>
                      <pre
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-primary)',
                          padding: 12,
                          borderRadius: 8,
                          maxHeight: 320,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'inherit',
                          lineHeight: 1.6,
                          margin: 0,
                        }}
                      >
                        {buildMarkdown(s.data)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
