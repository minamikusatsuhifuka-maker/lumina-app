'use client';
import { useState } from 'react';

interface Paper {
  paperId: string; title: string;
  authors: { name: string }[]; abstract: string;
  year: number; citationCount: number;
  externalIds?: { DOI?: string };
}

export default function ResearchPage() {
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const data = await res.json();
    setPapers(data.data || []);
    setLoading(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>🔬 文献検索</h1>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>Semantic Scholar — 1.38億件以上の学術論文</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="例：machine learning, 人工知能, climate change" style={{ flex: 1, padding: '12px 16px', background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 10, color: '#f0f0ff', fontSize: 15, outline: 'none' }} />
        <button onClick={search} disabled={loading} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
          {loading ? '検索中...' : '検索'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {papers.map(p => (
          <div key={p.paperId} style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0ff', marginBottom: 6 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: '#00d4b8', marginBottom: 8, fontFamily: 'monospace' }}>
              {p.authors?.slice(0, 3).map(a => a.name).join(', ')}
            </div>
            <div style={{ fontSize: 13, color: '#7878a0', lineHeight: 1.6, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.abstract || '要旨なし'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {p.year && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,166,35,0.1)', color: '#f5a623', fontFamily: 'monospace' }}>📅 {p.year}</span>}
              {p.citationCount != null && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontFamily: 'monospace' }}>📊 被引用 {p.citationCount.toLocaleString()}</span>}
              {p.externalIds?.DOI && <a href={`https://doi.org/${p.externalIds.DOI}`} target="_blank" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(130,140,255,0.1)', color: '#a89fff', textDecoration: 'none' }}>🔗 DOI</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
