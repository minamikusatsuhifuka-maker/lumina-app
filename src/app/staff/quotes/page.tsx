'use client';
import { useState, useEffect } from 'react';
import { QUOTES, THEME_LABELS, QuoteTheme } from '@/lib/quotes';

const ALL_THEMES = ['all', 'goal', 'thinking', 'relationship', 'management', 'growth', 'confidence', 'gratitude', 'classic'] as const;

export default function QuotesPage() {
  const [activeTheme, setActiveTheme] = useState<'all' | QuoteTheme>('all');
  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lumina-quote-favorites');
      if (saved) setFavorites(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('lumina-quote-favorites', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const filtered = QUOTES.filter(q => {
    const matchTheme = activeTheme === 'all' || q.theme === activeTheme;
    const matchSearch = !searchText || q.text.includes(searchText) || q.author.includes(searchText);
    return matchTheme && matchSearch;
  });

  const favList = QUOTES.filter(q => favorites.has(q.id));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📚 金言コレクション</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{QUOTES.length}件の名言 — 青木仁志・世界の偉人の言葉</p>
      </div>

      {/* お気に入りバナー */}
      {favList.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⭐</span>
          <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>お気に入り {favList.length}件</span>
          <button
            onClick={() => setActiveTheme('all')}
            style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: '#d97706', cursor: 'pointer' }}
          >
            全件表示
          </button>
        </div>
      )}

      {/* 今日の一言（ランダム） */}
      {(() => {
        const today = new Date().toDateString();
        const idx = [...today].reduce((a, c) => a + c.charCodeAt(0), 0) % QUOTES.length;
        const q = QUOTES[idx];
        return (
          <div style={{ marginBottom: 20, padding: '16px 20px', background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(139,92,246,0.06))', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>✨ 今日の一言</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 6 }}>「{q.text}」</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>— {q.author}</div>
          </div>
        );
      })()}

      {/* 検索 */}
      <input
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="🔍 キーワードで検索..."
        style={{ width: '100%', padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
      />

      {/* テーマフィルター */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {ALL_THEMES.map(theme => {
          const isAll = theme === 'all';
          const active = activeTheme === theme;
          const meta = isAll ? null : THEME_LABELS[theme as QuoteTheme];
          const count = isAll ? QUOTES.length : QUOTES.filter(q => q.theme === theme).length;
          return (
            <button
              key={theme}
              onClick={() => setActiveTheme(theme as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: active ? (isAll ? '#f59e0b' : 'rgba(108,99,255,0.12)') : 'var(--bg-card)',
                color: active ? (isAll ? '#fff' : '#6c63ff') : 'var(--text-muted)',
                border: `1px solid ${active ? (isAll ? '#f59e0b' : 'rgba(108,99,255,0.3)') : 'var(--border)'}`,
              }}
            >
              {isAll ? '📚' : meta!.icon} {isAll ? `すべて` : meta!.label}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* 件数 */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{filtered.length}件表示中</div>

      {/* 格言カード一覧 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {filtered.map(q => {
          const isFav = favorites.has(q.id);
          const meta = THEME_LABELS[q.theme];
          return (
            <div
              key={q.id}
              style={{
                padding: 16, background: 'var(--bg-secondary)', border: `1px solid var(--border)`,
                borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'box-shadow 0.15s',
              }}
            >
              {/* テーマバッジ・お気に入り */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>
                  {meta.icon} {meta.label}
                </span>
                <button
                  onClick={() => toggleFavorite(q.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: isFav ? '#f59e0b' : 'var(--text-muted)', padding: '2px 4px' }}
                >
                  {isFav ? '⭐' : '☆'}
                </button>
              </div>

              {/* 格言テキスト */}
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.8, flex: 1 }}>
                「{q.text}」
              </div>

              {/* 著者 */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', fontWeight: 600 }}>
                — {q.author}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 14 }}>該当する格言が見つかりませんでした</div>
        </div>
      )}
    </div>
  );
}
