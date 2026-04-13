'use client';

import { useState } from 'react';

// ─── 型定義 ───
interface Totals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Insight {
  title: string;
  body: string;
  type: 'positive' | 'warning' | 'info';
}

interface ActionPlan {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

interface KeywordOpportunity {
  query: string;
  reason: string;
  action: string;
}

interface SeoInsightData {
  summary: string;
  insights: Insight[];
  actionPlans: ActionPlan[];
  keywordOpportunities: KeywordOpportunity[];
}

// ─── スタイル定数 ───
const PRIORITY_CONFIG = {
  high: { label: '高', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  medium: { label: '中', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
  low: { label: '低', bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e' },
};

const INSIGHT_STYLE = {
  positive: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: '✅' },
  warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '⚠️' },
  info: { bg: 'rgba(108,99,255,0.08)', border: 'rgba(108,99,255,0.3)', icon: '💡' },
};

// ─── ヘルパー ───
function formatPercent(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function formatPosition(v: number): string {
  return v.toFixed(1);
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ─── 治療カテゴリ定義 ───
type TreatmentKey = 'beauty' | 'infection' | 'disease' | 'other';

const TREATMENT_CATEGORIES: Record<
  TreatmentKey,
  { label: string; color: string; keywords: string[] }
> = {
  beauty: {
    label: '美容系',
    color: '#ec4899',
    keywords: [
      'miin_laser',
      'whitening',
      'melasma',
      'dermapen',
      'peeling',
      'botox',
      'hifu',
      'pigment',
      'hair_removal',
      'lift',
      'filler',
    ],
  },
  infection: {
    label: '感染症系',
    color: '#f59e0b',
    keywords: [
      'shingles',
      'cellulitis',
      'athletes_foot',
      'herpes',
      'tinea',
      'impetigo',
      'wart',
      'candida',
      'scabies',
    ],
  },
  disease: {
    label: '皮膚疾患系',
    color: '#6c63ff',
    keywords: [
      'rosacea',
      'psoriasis',
      'dupilumab',
      'eczema',
      'atopic',
      'acne',
      'urticaria',
      'dermatitis',
      'vitiligo',
      'alopecia',
    ],
  },
  other: {
    label: 'その他',
    color: '#64748b',
    keywords: [],
  },
};

function categorizePage(url: string): TreatmentKey {
  const lower = url.toLowerCase();
  for (const key of ['beauty', 'infection', 'disease'] as const) {
    if (TREATMENT_CATEGORIES[key].keywords.some((kw) => lower.includes(kw))) {
      return key;
    }
  }
  return 'other';
}

export default function SeoPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [insightData, setInsightData] = useState<SeoInsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null);

  // 過去N日レンジ
  const [daysRange, setDaysRange] = useState<number>(28);

  const fetchGscData = async () => {
    setLoading(true);
    setError(null);
    setInsightData(null);

    try {
      const end = new Date();
      const start = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000);
      const startDate = start.toISOString().split('T')[0];
      const endDate = end.toISOString().split('T')[0];

      const res = await fetch('/api/gsc/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Search Consoleデータの取得に失敗しました');
      }

      setTotals(data.totals);
      setQueries(data.queries || []);
      setPages(data.pages || []);
      setDateRange({ startDate: data.startDate, endDate: data.endDate });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  };

  const runInsight = async () => {
    if (!totals) return;
    setInsightLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gsc/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totals, queries, pages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI分析に失敗しました');
      }
      setInsightData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setInsightLoading(false);
    }
  };

  // ─── レンダリング ───

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          🔍 SEOダッシュボード
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          Google Search Console のデータを取得して、検索クエリ・ページ・順位を確認できます。
        </p>
      </div>

      {/* コントロール */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 20,
          padding: '14px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        <select
          value={daysRange}
          onChange={(e) => setDaysRange(parseInt(e.target.value))}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        >
          <option value={7}>過去7日</option>
          <option value={28}>過去28日</option>
          <option value={90}>過去90日</option>
          <option value={180}>過去180日</option>
        </select>

        <button
          onClick={fetchGscData}
          disabled={loading}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: loading
              ? 'rgba(108,99,255,0.4)'
              : 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '取得中…' : '🔍 Search Consoleデータを取得'}
        </button>

        {totals && (
          <button
            onClick={runInsight}
            disabled={insightLoading}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid rgba(108,99,255,0.4)',
              background: insightLoading ? 'rgba(108,99,255,0.1)' : 'rgba(108,99,255,0.08)',
              color: '#6c63ff',
              fontSize: 13,
              fontWeight: 600,
              cursor: insightLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {insightLoading ? '🤖 分析中…' : '🤖 AIでSEO分析'}
          </button>
        )}

        {dateRange && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            期間: {dateRange.startDate} 〜 {dateRange.endDate}
          </span>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 未取得時の案内 */}
      {!totals && !loading && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: 12,
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          「Search Consoleデータを取得」ボタンを押して分析を開始してください。
        </div>
      )}

      {/* KPIカード */}
      {totals && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard
            label="総クリック数"
            value={totals.clicks.toLocaleString()}
            icon="🖱️"
            gradient="linear-gradient(135deg, #6c63ff, #8b5cf6)"
          />
          <KpiCard
            label="総表示回数"
            value={totals.impressions.toLocaleString()}
            icon="👁️"
            gradient="linear-gradient(135deg, #00d4b8, #10b981)"
          />
          <KpiCard
            label="平均CTR"
            value={formatPercent(totals.ctr)}
            icon="📊"
            gradient="linear-gradient(135deg, #f59e0b, #fbbf24)"
          />
          <KpiCard
            label="平均順位"
            value={formatPosition(totals.position)}
            icon="🏆"
            gradient="linear-gradient(135deg, #ec4899, #f472b6)"
          />
        </div>
      )}

      {/* AIサマリー */}
      {insightData && (
        <div style={{ marginBottom: 24 }}>
          {insightData.summary && (
            <div
              style={{
                padding: 18,
                background:
                  'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.08))',
                border: '1px solid rgba(108,99,255,0.3)',
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6c63ff',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                🤖 AIサマリー
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                {insightData.summary}
              </div>
            </div>
          )}

          {insightData.insights.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {insightData.insights.map((ins, i) => {
                const style = INSIGHT_STYLE[ins.type] ?? INSIGHT_STYLE.info;
                return (
                  <div
                    key={i}
                    style={{
                      padding: 14,
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      {style.icon} {ins.title}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {ins.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {insightData.keywordOpportunities.length > 0 && (
            <div
              style={{
                padding: 18,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 12,
                }}
              >
                💎 狙い目キーワード
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insightData.keywordOpportunities.map((k, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-primary)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#6c63ff',
                        marginBottom: 4,
                      }}
                    >
                      {k.query}
                    </div>
                    <div
                      style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}
                    >
                      {k.reason}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      → {k.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insightData.actionPlans.length > 0 && (
            <div
              style={{
                padding: 18,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 12,
                }}
              >
                📋 改善アクションプラン
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insightData.actionPlans.map((plan, i) => {
                  const p = PRIORITY_CONFIG[plan.priority] ?? PRIORITY_CONFIG.medium;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 4,
                            background: p.bg,
                            border: `1px solid ${p.border}`,
                            color: p.text,
                          }}
                        >
                          優先度{p.label}
                        </span>
                        <span
                          style={{ fontSize: 11, color: 'var(--text-muted)' }}
                        >
                          {plan.category}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        {plan.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6,
                        }}
                      >
                        {plan.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 治療別パフォーマンス */}
      {pages.length > 0 && (() => {
        const stats: Record<TreatmentKey, { clicks: number; impressions: number }> = {
          beauty: { clicks: 0, impressions: 0 },
          infection: { clicks: 0, impressions: 0 },
          disease: { clicks: 0, impressions: 0 },
          other: { clicks: 0, impressions: 0 },
        };
        for (const p of pages) {
          const cat = categorizePage(p.page);
          stats[cat].clicks += p.clicks;
          stats[cat].impressions += p.impressions;
        }
        const maxClicks = Math.max(
          1,
          ...(Object.values(stats).map((s) => s.clicks) as number[]),
        );
        return (
          <div
            style={{
              marginBottom: 24,
              padding: 18,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 14,
              }}
            >
              💊 治療別パフォーマンス
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(Object.keys(TREATMENT_CATEGORIES) as TreatmentKey[]).map((key) => {
                const cat = TREATMENT_CATEGORIES[key];
                const s = stats[key];
                const ctr = s.impressions > 0 ? s.clicks / s.impressions : 0;
                const widthPct = (s.clicks / maxClicks) * 100;
                return (
                  <div key={key}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {cat.label}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        クリック {s.clicks.toLocaleString()} / 表示{' '}
                        {s.impressions.toLocaleString()} / CTR {formatPercent(ctr)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 14,
                        background: 'var(--bg-primary)',
                        borderRadius: 7,
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          background: cat.color,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* CTR改善チャンス */}
      {queries.length > 0 && (() => {
        const targetCtr = 0.03;
        const opportunities = queries
          .filter((q) => q.impressions >= 1000 && q.ctr < 0.01)
          .map((q) => ({
            ...q,
            potentialGain: q.impressions * (targetCtr - q.ctr),
          }))
          .sort((a, b) => b.potentialGain - a.potentialGain);

        if (opportunities.length === 0) return null;

        return (
          <div
            style={{
              marginBottom: 24,
              padding: 18,
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}
            >
              🎯 CTR改善チャンス
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 12,
              }}
            >
              表示回数1,000以上 かつ CTR 1%未満 のキーワード（目標CTR: 3%）
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <Th style={{ textAlign: 'left' }}>キーワード</Th>
                    <Th>表示回数</Th>
                    <Th>現在CTR</Th>
                    <Th>目標CTR</Th>
                    <Th>潜在クリック増加数</Th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((q, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'rgba(239,68,68,0.06)',
                      }}
                    >
                      <Td
                        style={{
                          color: '#ef4444',
                          fontWeight: 600,
                        }}
                      >
                        {truncate(q.query, 40)}
                      </Td>
                      <Td style={{ textAlign: 'right' }}>
                        {q.impressions.toLocaleString()}
                      </Td>
                      <Td style={{ textAlign: 'right', color: '#ef4444' }}>
                        {formatPercent(q.ctr)}
                      </Td>
                      <Td style={{ textAlign: 'right', color: '#22c55e' }}>
                        {formatPercent(targetCtr)}
                      </Td>
                      <Td
                        style={{
                          textAlign: 'right',
                          color: '#ef4444',
                          fontWeight: 700,
                        }}
                      >
                        +{Math.round(q.potentialGain).toLocaleString()}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* キーワードTOP30 */}
      {queries.length > 0 && (
        <div
          style={{
            marginBottom: 24,
            padding: 18,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 12,
            }}
          >
            🔤 検索キーワード TOP30
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th style={{ textAlign: 'left' }}>#</Th>
                  <Th style={{ textAlign: 'left' }}>キーワード</Th>
                  <Th>クリック</Th>
                  <Th>表示</Th>
                  <Th>CTR</Th>
                  <Th>順位</Th>
                </tr>
              </thead>
              <tbody>
                {queries.slice(0, 30).map((q, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <Td style={{ color: 'var(--text-muted)' }}>{i + 1}</Td>
                    <Td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {truncate(q.query, 40)}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>{q.clicks.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right' }}>{q.impressions.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatPercent(q.ctr)}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatPosition(q.position)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 人気ページTOP10 */}
      {pages.length > 0 && (
        <div
          style={{
            padding: 18,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 12,
            }}
          >
            📄 人気ページ TOP20
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th style={{ textAlign: 'left' }}>#</Th>
                  <Th style={{ textAlign: 'left' }}>ページ</Th>
                  <Th>クリック</Th>
                  <Th>表示</Th>
                  <Th>CTR</Th>
                  <Th>順位</Th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 20).map((p, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <Td style={{ color: 'var(--text-muted)' }}>{i + 1}</Td>
                    <Td>
                      <a
                        href={p.page}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#6c63ff',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {truncate(p.page, 60)}
                      </a>
                    </Td>
                    <Td style={{ textAlign: 'right' }}>{p.clicks.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right' }}>{p.impressions.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatPercent(p.ctr)}</Td>
                    <Td style={{ textAlign: 'right' }}>{formatPosition(p.position)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ───
function KpiCard({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: string;
  icon: string;
  gradient: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: gradient,
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span>{icon}</span>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: '10px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        textAlign: 'right',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: '10px 8px',
        color: 'var(--text-secondary)',
        ...style,
      }}
    >
      {children}
    </td>
  );
}
