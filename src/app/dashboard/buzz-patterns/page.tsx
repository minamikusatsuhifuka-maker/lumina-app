'use client';
import { useState, useEffect, useMemo } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';

const CATEGORIES = [
  'すべて',
  '🏗 構成',
  '🎯 見出し',
  '💡 フック',
  '🧠 心理トリガー',
  '📊 マーケティング',
  '🎭 文体・口調',
  '📚 ストーリーテリング',
  '🎁 ベネフィット提示',
  '🏆 信頼性演出',
  '⏰ 緊急性・希少性',
];

const FRAMEWORKS = [
  'すべて',
  '影響力の武器',
  '行動経済学',
  'コピーライティング',
  '心理学',
  'マーケティング',
];

type PatternRow = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags?: string;
  group_name?: string;
  is_favorite?: 0 | 1 | boolean;
  metadata?: any;
  created_at?: string;
};

// metadata は JSON 文字列の場合と既にオブジェクトの場合がある
function parseMeta(metadata: any): any {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

export default function BuzzPatternsPage() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('すべて');
  const [frameworkFilter, setFrameworkFilter] = useState('すべて');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<PatternRow | null>(null);

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/library?type=buzz-pattern');
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.items || [];
      setPatterns(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return patterns.filter((p) => {
      if (kw) {
        const hay = `${p.title || ''}\n${p.content || ''}\n${p.tags || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      const meta = parseMeta(p.metadata);
      if (categoryFilter !== 'すべて' && meta?.category !== categoryFilter) return false;
      if (frameworkFilter !== 'すべて' && meta?.framework !== frameworkFilter) return false;
      if (favoriteOnly && !p.is_favorite) return false;
      return true;
    });
  }, [patterns, search, categoryFilter, frameworkFilter, favoriteOnly]);

  // 既存 library API は PUT で body に id+is_favorite を渡す
  const toggleFavorite = async (id: string, currentFav: boolean) => {
    try {
      await fetch('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_favorite: currentFav ? 0 : 1 }),
      });
      setPatterns((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_favorite: currentFav ? 0 : 1 } : p)),
      );
    } catch (e) {
      console.error(e);
    }
  };

  // 既存 library API は DELETE で body に id を渡す
  const deletePattern = async (id: string) => {
    if (!confirm('このパターンを辞書から削除しますか？')) return;
    try {
      await fetch('/api/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setPatterns((prev) => prev.filter((p) => p.id !== id));
      setSelectedPattern(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        📖 バズりパターン辞書
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        バズり分析から抽出した「使える型」を蓄積。検索・カテゴリ・フレームワークで絞り込んで活用できます。
      </p>

      {/* フィルタ UI */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 20,
          padding: 16,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="🔍 検索（タイトル・本文・タグ）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 220px',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(e) => setFavoriteOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          ⭐ お気に入りのみ
        </label>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        {loading
          ? '読み込み中...'
          : `${filtered.length}件のパターン${patterns.length !== filtered.length ? ` / 全${patterns.length}件中` : ''}`}
      </div>

      {/* パターン一覧（グリッド） */}
      {!loading && patterns.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 60,
            color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>まだパターンが登録されていません</div>
          <div style={{ fontSize: 13 }}>
            「📊 バズり分析」で分析を実行し、結果から「📖 パターンを抽出して辞書に追加」を押してみてください
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((p) => {
            const meta = parseMeta(p.metadata);
            const fav = !!p.is_favorite;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPattern(p)}
                style={{
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = '';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.4 }}>
                    {p.title}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(p.id, fav);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 18,
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title={fav ? 'お気に入り解除' : 'お気に入り'}
                  >
                    {fav ? '⭐' : '☆'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {meta?.category && (
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {meta.category}
                    </span>
                  )}
                  {meta?.framework && (
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                      {meta.framework}
                    </span>
                  )}
                  {meta?.mediaType && (
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(0,212,184,0.12)', color: '#00d4b8' }}>
                      {meta.mediaType}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, marginTop: 0, marginBottom: 0, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {(meta?.description || p.content?.slice(0, 120) || '').slice(0, 140)}
                  {((meta?.description || p.content || '').length > 140) && '...'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedPattern && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={() => setSelectedPattern(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 800,
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>
                {selectedPattern.title}
              </h2>
              <button
                onClick={() => setSelectedPattern(null)}
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)',
                  width: 32, height: 32, borderRadius: 6,
                }}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.8,
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                padding: 16,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              {selectedPattern.content}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  copyToClipboard(selectedPattern.content);
                  alert('コピーしました');
                }}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
                }}
              >
                📋 コピー
              </button>
              <button
                onClick={() => toggleFavorite(selectedPattern.id, !!selectedPattern.is_favorite)}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
                }}
              >
                {selectedPattern.is_favorite ? '⭐ お気に入り解除' : '☆ お気に入りに追加'}
              </button>
              <button
                onClick={() => deletePattern(selectedPattern.id)}
                style={{
                  marginLeft: 'auto', padding: '8px 16px', borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                🗑 削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
