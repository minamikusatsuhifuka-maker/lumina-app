'use client';

import { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  card,
  inputStyle,
  smallBtn,
  badge,
  SectionTitle,
  ErrorBox,
  AdCheckBadge,
  AdCheckFindings,
  type AdCheck,
} from '@/components/meo/ui';

interface CompetitorPlace {
  placeId: string;
  name: string;
  rating: number;
  totalReviews: number;
  address: string;
  website: string;
  mapsUrl: string;
  categories: string[];
  openingHours: string[];
}
interface Competitor {
  id: number;
  name: string;
  place_id: string | null;
  place_data: CompetitorPlace | null;
  created_at: string;
}
interface Analysis {
  id: number;
  competitor_id: number;
  competitor_name: string | null;
  result: string;
  ad_check: AdCheck | null;
  created_at: string;
}

export default function CompetitorTab() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        fetch('/api/meo/competitors'),
        fetch('/api/meo/competitor-analyses'),
      ]);
      const cJson = await cRes.json();
      const aJson = await aRes.json();
      if (cRes.ok) setCompetitors(cJson.competitors || []);
      if (aRes.ok) setAnalyses(aJson.analyses || []);
    } catch {
      setError('読み込みに失敗しました');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addCompetitor = async () => {
    if (!query.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/meo/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || '競合の取得に失敗しました');
      else {
        setQuery('');
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const removeCompetitor = async (id: number) => {
    await fetch('/api/meo/competitors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const analyze = async (id: number) => {
    setAnalyzingId(id);
    setError('');
    try {
      const res = await fetch('/api/meo/competitor-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId: id }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || '分析に失敗しました');
      else await load();
    } finally {
      setAnalyzingId(null);
    }
  };

  const removeAnalysis = async (id: number) => {
    await fetch('/api/meo/competitor-analyses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>競合クリニックを追加（名称＋エリア）</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例）○○皮膚科 草津"
            style={{ ...inputStyle, marginTop: 0 }}
          />
          <button onClick={addCompetitor} disabled={adding} style={{ ...smallBtn, whiteSpace: 'nowrap' }}>
            {adding ? '取得中…' : 'Placesで追加'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          ※ Googleマップの公開情報（星平均・口コミ数・カテゴリ・営業時間・URL）を取得します。口コミ本文は扱いません。提案のみ・自動アクションなし。
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      {competitors.map((c) => {
        const p = c.place_data;
        return (
          <div key={c.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => analyze(c.id)} disabled={analyzingId === c.id} style={{ ...smallBtn, color: '#0f766e' }}>
                  {analyzingId === c.id ? '分析中…' : 'AIで差分分析'}
                </button>
                <button onClick={() => removeCompetitor(c.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
                  削除
                </button>
              </div>
            </div>
            {p && (
              <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                ⭐ {p.rating}（{p.totalReviews}件） ／ 営業時間 {p.openingHours?.length || 0}日分 ／ サイト{' '}
                {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0f766e' }}>あり↗</a> : 'なし'}
                {p.categories?.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {p.categories.slice(0, 5).map((cat) => (
                      <span key={cat} style={{ ...badge, background: '#f1f5f9', color: '#64748b', marginRight: 4 }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {analyses.length > 0 && (
        <div>
          <SectionTitle>🧭 分析結果（提案）</SectionTitle>
          {analyses.map((a) => (
            <div key={a.id} style={{ ...card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {a.competitor_name || '競合'}
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                    {new Date(a.created_at).toLocaleString('ja-JP')}
                  </span>
                </span>
                <AdCheckBadge adCheck={a.ad_check ?? undefined} />
              </div>
              <AdCheckFindings adCheck={a.ad_check ?? undefined} />
              <div
                className="markdown-body"
                style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(a.result) }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => copyToClipboard(a.result)} style={smallBtn}>
                  コピー
                </button>
                <button onClick={() => removeAnalysis(a.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
