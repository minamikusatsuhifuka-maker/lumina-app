'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';

interface Paper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  abstract: string;
  year: number;
  citationCount: number;
  externalIds?: { DOI?: string };
}

const QUICK_SEARCHES = [
  '人工知能', '機械学習', 'ChatGPT', 'ディープラーニング',
  'natural language processing', 'large language model',
];

export default function ResearchPage() {
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setPapers([]);

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      const results = data.data || [];
      setPapers(results);

      if (results.length === 0) {
        setError('検索結果が見つかりませんでした。別のキーワードをお試しください。');
      }
    } catch (e: any) {
      console.error('[research] Error:', e);
      setError(`エラーが発生しました: ${e.message}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="🔬 論文検索中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔬 文献検索</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Semantic Scholar — 1.38億件以上の学術論文（日本語・英語対応）</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="例：人工知能, 機械学習, climate change, ChatGPT"
          style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, outline: 'none' }}
        />
        <button
          onClick={() => search()}
          disabled={loading}
          style={{ padding: '12px 28px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </div>

      {/* クイック検索 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {QUICK_SEARCHES.map(q => (
          <button
            key={q}
            onClick={() => { setQuery(q); search(q); }}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: '2px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          Semantic Scholar を検索中...
        </div>
      )}

      {/* エラー */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 結果 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {papers.map(p => (
          <div key={p.paperId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: '#00d4b8', marginBottom: 8, fontFamily: 'monospace' }}>
              👤 {p.authors?.slice(0, 3).map(a => a.name).join(', ')}{(p.authors?.length || 0) > 3 ? ' ほか' : ''}
            </div>
            {p.abstract && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.abstract}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {p.year && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,166,35,0.1)', color: '#f5a623', fontFamily: 'monospace' }}>📅 {p.year}</span>}
              {p.citationCount != null && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontFamily: 'monospace' }}>📊 被引用 {p.citationCount.toLocaleString()}</span>}
              {p.externalIds?.DOI && (
                <a href={`https://doi.org/${p.externalIds.DOI}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--border)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                  🔗 DOI
                </a>
              )}
              <button
                onClick={() => {
                  const ref = `参考論文「${p.title}」（${p.authors?.slice(0,2).map(a=>a.name).join(', ')}${p.year ? ' '+p.year : ''}）`;
                  localStorage.setItem('lumina_research_context', ref);
                  window.location.href = '/dashboard/write';
                }}
                style={{ marginLeft: 'auto', padding: '4px 12px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                ✍️ 文章作成に使う
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
