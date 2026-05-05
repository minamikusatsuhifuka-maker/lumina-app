'use client';

import { useEffect, useState, useMemo } from 'react';

type GlossaryTerm = {
  id: number;
  term: string;
  reading: string | null;
  explanation: string;
  source_topic: string | null;
  category: string | null;
  is_bookmarked: boolean;
  review_count: number;
  last_reviewed_at: string | null;
  created_at: string;
};

const CATEGORIES = ['all', 'ビジネス', '心理学', '医療', 'IT', '経済', '法律', '哲学', 'その他'];

export default function ResearchGlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<GlossaryTerm | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTerms = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (bookmarkedOnly) params.set('bookmarked', 'true');
    try {
      const res = await fetch(`/api/glossary/terms?${params}`);
      const data = await res.json();
      setTerms(data.terms || []);
    } catch {
      setTerms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTerms(); }, [category, bookmarkedOnly]);

  const filtered = useMemo(() => {
    if (!search) return terms;
    const q = search.toLowerCase();
    return terms.filter(t =>
      t.term.toLowerCase().includes(q) || t.explanation.toLowerCase().includes(q)
    );
  }, [terms, search]);

  const handleBookmark = async (id: number, current: boolean) => {
    await fetch('/api/glossary/terms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isBookmarked: !current }),
    });
    loadTerms();
    if (selectedTerm?.id === id) setSelectedTerm({ ...selectedTerm, is_bookmarked: !current });
  };

  const handleReview = async (id: number) => {
    await fetch('/api/glossary/terms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, incrementReview: true }),
    });
    setTerms(prev => prev.map(t => t.id === id ? { ...t, review_count: t.review_count + 1 } : t));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この用語を削除しますか？')) return;
    await fetch(`/api/glossary/terms?id=${id}`, { method: 'DELETE' });
    setSelectedTerm(null);
    loadTerms();
  };

  const stats = useMemo(() => ({
    total: terms.length,
    bookmarked: terms.filter(t => t.is_bookmarked).length,
    reviews: terms.reduce((a, t) => a + t.review_count, 0),
    categories: new Set(terms.map(t => t.category).filter(Boolean)).size,
  }), [terms]);

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📚 専門用語集</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            ディープリサーチで出会った専門用語を500字解説で管理
          </p>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{terms.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>登録用語数</div>
        </div>
      </div>

      {/* 統計 */}
      {terms.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: '総用語数', value: stats.total, icon: '🔢' },
            { label: 'お気に入り', value: stats.bookmarked, icon: '⭐' },
            { label: '総復習回数', value: stats.reviews, icon: '🔄' },
            { label: 'カテゴリ数', value: stats.categories, icon: '📂' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* フィルター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 用語・解説で検索..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
        />
        <button
          onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
          style={{
            padding: '8px 14px',
            background: bookmarkedOnly ? 'linear-gradient(135deg, #f59e0b, #ef6c00)' : 'var(--bg-primary)',
            color: bookmarkedOnly ? '#fff' : 'var(--text-muted)',
            border: bookmarkedOnly ? 'none' : '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ⭐ お気に入りのみ
        </button>
      </div>

      {/* カテゴリタブ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 16 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '6px 14px',
              background: category === cat ? 'linear-gradient(135deg, #f59e0b, #ef6c00)' : 'var(--bg-secondary)',
              color: category === cat ? '#fff' : 'var(--text-muted)',
              border: category === cat ? 'none' : '1px solid var(--border)',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {cat === 'all' ? `すべて (${terms.length})` : cat}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedTerm ? '1fr 320px' : '1fr', gap: 16 }}>
        {/* 一覧 */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center' as const, padding: 40, color: 'var(--text-muted)' }}>
              読み込み中...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: 36,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📖</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {terms.length === 0 ? '用語がまだありません' : '条件に一致する用語がありません'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                ディープリサーチを実行すると、結果から自動で専門用語が抽出され、保存できます。
              </div>
              <a href="/dashboard/deepresearch" style={{ display: 'inline-block', marginTop: 12, padding: '8px 16px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                🔭 ディープリサーチへ
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {filtered.map(term => (
                <div
                  key={term.id}
                  onClick={() => { setSelectedTerm(term); handleReview(term.id); }}
                  style={{
                    padding: 14,
                    background: selectedTerm?.id === term.id ? 'rgba(245,158,11,0.06)' : 'var(--bg-secondary)',
                    border: selectedTerm?.id === term.id ? '1px solid #f59e0b' : '1px solid var(--border)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{term.term}</span>
                        {term.reading && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>（{term.reading}）</span>
                        )}
                        {term.category && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.18)', color: '#f59e0b', fontWeight: 700 }}>
                            {term.category}
                          </span>
                        )}
                        {term.is_bookmarked && <span style={{ fontSize: 12 }}>⭐</span>}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                        {term.explanation}
                      </p>
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                        {term.source_topic && <span>📌 {term.source_topic}</span>}
                        <span>復習: {term.review_count}回</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBookmark(term.id, term.is_bookmarked); }}
                      style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
                    >
                      {term.is_bookmarked ? '⭐' : '☆'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 詳細パネル */}
        {selectedTerm && (
          <div style={{ position: 'sticky' as const, top: 16, alignSelf: 'flex-start' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTerm.term}</div>
                  {selectedTerm.reading && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>（{selectedTerm.reading}）</div>
                  )}
                </div>
                <button
                  onClick={() => handleBookmark(selectedTerm.id, selectedTerm.is_bookmarked)}
                  style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer' }}
                >
                  {selectedTerm.is_bookmarked ? '⭐' : '☆'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                {selectedTerm.category && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.18)', color: '#f59e0b', fontWeight: 700 }}>
                    {selectedTerm.category}
                  </span>
                )}
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                  復習 {selectedTerm.review_count}回
                </span>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>
                  {selectedTerm.explanation}
                </p>
              </div>

              {selectedTerm.source_topic && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
                  📌 出典: {selectedTerm.source_topic}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                <a
                  href={`/dashboard/deepresearch?q=${encodeURIComponent(selectedTerm.term)}`}
                  style={{ padding: '8px 12px', background: 'linear-gradient(135deg, #f59e0b, #ef6c00)', color: '#fff', textAlign: 'center' as const, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
                >
                  🔭 この用語をディープリサーチ
                </a>
                <button
                  onClick={() => handleDelete(selectedTerm.id)}
                  style={{ padding: '8px 12px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  🗑 削除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
