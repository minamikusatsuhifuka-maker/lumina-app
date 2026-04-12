'use client';

import { useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface GaMetrics {
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionDuration: number;
  conversions: number;
  conversionRate: number;
}

interface TopPage {
  path: string;
  sessions: number;
}

interface Insight {
  title: string;
  body: string;
  type: 'positive' | 'warning' | 'info';
}

interface InsightData {
  insights: Insight[];
  summary: string;
}

const CHANNEL_COLORS = [
  '#6c63ff', '#00d4b8', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<GaMetrics | null>(null);
  const [channelBreakdown, setChannelBreakdown] = useState<Record<string, number>>({});
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GA4データ取得
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ga/fetch', { method: 'POST' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'データ取得に失敗しました' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMetrics(data.metrics);
      setChannelBreakdown(data.channelBreakdown ?? {});
      setTopPages(data.topPages ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // AIインサイト取得
  const fetchInsight = async () => {
    if (!metrics) return;
    setInsightLoading(true);
    try {
      const res = await fetch('/api/ga/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, channelBreakdown, topPages }),
      });
      if (!res.ok) throw new Error('AI分析に失敗しました');
      const data = await res.json();
      setInsightData(data);
    } catch {
      setInsightData({ insights: [{ title: 'エラー', body: 'AI分析に失敗しました。再度お試しください。', type: 'warning' }], summary: '' });
    } finally {
      setInsightLoading(false);
    }
  };

  // チャネルデータをPieChart用に変換
  const pieData = Object.entries(channelBreakdown).map(([name, value]) => ({ name, value }));

  // 人気ページをBarChart用に変換
  const pageBarData = topPages.map(p => ({
    name: p.path.length > 30 ? p.path.slice(0, 30) + '…' : p.path,
    sessions: p.sessions,
    fullPath: p.path,
  }));

  const insightTypeStyle: Record<string, { bg: string; border: string; icon: string }> = {
    positive: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: '✅' },
    warning:  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '⚠️' },
    info:     { bg: 'rgba(108,99,255,0.08)',  border: 'rgba(108,99,255,0.3)', icon: '💡' },
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>📈 アナリティクス</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
            fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          {loading ? '取得中...' : 'GA4データを取得'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {!metrics && !loading && !error && (
        <div style={{
          padding: 60, textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>GA4データがまだ取得されていません</div>
          <div style={{ fontSize: 12 }}>「GA4データを取得」ボタンをクリックしてデータを取得してください</div>
        </div>
      )}

      {metrics && (
        <>
          {/* KPIカード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'セッション', value: metrics.sessions.toLocaleString(), icon: '👁️', color: '#6c63ff' },
              { label: 'ユーザー', value: metrics.users.toLocaleString(), icon: '👤', color: '#00d4b8' },
              { label: '新規ユーザー', value: metrics.newUsers.toLocaleString(), icon: '🆕', color: '#8b5cf6' },
              { label: 'ページビュー', value: metrics.pageviews.toLocaleString(), icon: '📄', color: '#f59e0b' },
              { label: 'エンゲージメント率', value: `${(metrics.engagementRate * 100).toFixed(1)}%`, icon: '🎯', color: '#10b981' },
              { label: '直帰率', value: `${(metrics.bounceRate * 100).toFixed(1)}%`, icon: '↩️', color: metrics.bounceRate > 0.7 ? '#ef4444' : '#64748b' },
              { label: '平均セッション時間', value: `${Math.round(metrics.avgSessionDuration)}秒`, icon: '⏱️', color: '#06b6d4' },
              { label: 'コンバージョン', value: metrics.conversions.toLocaleString(), icon: '🎉', color: '#ec4899' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>{card.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{card.label}</span>
                </div>
                <span style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.value}</span>
              </div>
            ))}
          </div>

          {/* チャネル別 + 人気ページ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* チャネル別セッション */}
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 20,
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>チャネル別セッション</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={(props: { name?: string; percent?: number }) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={true}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: unknown) => [`${value} セッション`, '']}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) => <span style={{ color: 'var(--text-muted)' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
              )}
            </div>

            {/* 人気ページTOP10 */}
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 20,
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>人気ページ TOP10</h2>
              {pageBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={pageBarData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={120} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: unknown) => [`${value} セッション`, '']}
                      labelFormatter={(_label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item?.fullPath ?? _label;
                      }}
                    />
                    <Bar dataKey="sessions" name="セッション" fill="#6c63ff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
              )}
            </div>
          </div>

          {/* AIインサイトセクション */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>🤖 AIインサイト</h2>
              <button
                onClick={fetchInsight}
                disabled={insightLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  fontWeight: 500, fontSize: 12, cursor: insightLoading ? 'not-allowed' : 'pointer',
                  opacity: insightLoading ? 0.6 : 1, transition: 'opacity 0.2s',
                }}
              >
                {insightLoading ? '分析中...' : 'AIで分析する'}
              </button>
            </div>

            {!insightData && !insightLoading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                「AIで分析する」をクリックすると、Gemini AIがアクセスデータを分析してインサイトを提示します
              </div>
            )}

            {insightLoading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                🤖 AIがデータを分析しています...
              </div>
            )}

            {insightData && (
              <>
                {insightData.summary && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10, marginBottom: 16,
                    background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                    fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6,
                  }}>
                    {insightData.summary}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {insightData.insights.map((insight, i) => {
                    const style = insightTypeStyle[insight.type] || insightTypeStyle.info;
                    return (
                      <div key={i} style={{
                        padding: '14px 16px', borderRadius: 10,
                        background: style.bg, border: `1px solid ${style.border}`,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                          {style.icon} {insight.title}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {insight.body}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* レスポンシブ対応 */}
          <style>{`
            @media (max-width: 768px) {
              div[style*="gridTemplateColumns: '1fr 1fr'"],
              div[style*="grid-template-columns"] {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
