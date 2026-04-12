'use client';

import { useState, useRef } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

// ─── 型定義 ───

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

interface TopPage { path: string; sessions: number }

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
  xluminaFeature: string;
}

interface MarketingIdea {
  channel: string;
  title: string;
  description: string;
  xluminaUsage: string;
}

interface InsightData {
  summary: string;
  insights: Insight[];
  actionPlans: ActionPlan[];
  marketingIdeas: MarketingIdea[];
}

interface KpiDef {
  key: string;
  label: string;
  value: string;
  icon: string;
  tooltip: string;
  status: 'good' | 'warn' | 'bad' | 'neutral';
  gradient: string;
}

// ─── 定数 ───

const CHANNEL_COLORS = [
  '#6c63ff', '#00d4b8', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

const PRIORITY_CONFIG = {
  high:   { label: '高', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  medium: { label: '中', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
  low:    { label: '低', bg: 'rgba(34,197,94,0.12)',  border: '#22c55e', text: '#22c55e' },
};

const INSIGHT_STYLE = {
  positive: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: '✅', gradStart: '#10b981', gradEnd: '#059669' },
  warning:  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '⚠️', gradStart: '#f59e0b', gradEnd: '#d97706' },
  info:     { bg: 'rgba(108,99,255,0.08)', border: 'rgba(108,99,255,0.3)', icon: '💡', gradStart: '#6c63ff', gradEnd: '#4f46e5' },
};

const STATUS_COLORS = {
  good:    { dot: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  warn:    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  bad:     { dot: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  neutral: { dot: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

// ─── ヘルパー ───

function buildKpis(m: GaMetrics): KpiDef[] {
  const pagesPerSession = m.sessions > 0 ? m.pageviews / m.sessions : 0;
  const newUserRate = m.users > 0 ? (m.newUsers / m.users) * 100 : 0;
  const returningUsers = m.users - m.newUsers;
  const br = m.bounceRate * 100;
  const er = m.engagementRate * 100;
  const cr = m.conversionRate * 100;

  return [
    {
      key: 'sessions', label: 'セッション', value: m.sessions.toLocaleString(), icon: '👁️',
      tooltip: 'サイトへの訪問回数。同一ユーザーでも再訪問は別カウント',
      status: m.sessions > 100 ? 'good' : m.sessions > 30 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
    },
    {
      key: 'users', label: 'ユーザー', value: m.users.toLocaleString(), icon: '👤',
      tooltip: '期間中にサイトを訪れたユニークユーザー数',
      status: m.users > 50 ? 'good' : m.users > 15 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #00d4b8, #10b981)',
    },
    {
      key: 'newUsers', label: '新規ユーザー', value: m.newUsers.toLocaleString(), icon: '🆕',
      tooltip: '初めてサイトを訪問したユーザー数。集客施策の効果指標',
      status: m.newUsers > 30 ? 'good' : m.newUsers > 10 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    },
    {
      key: 'newUserRate', label: '新規率', value: `${newUserRate.toFixed(1)}%`, icon: '📊',
      tooltip: '全ユーザーのうち新規ユーザーの割合。高すぎるとリピーター不足の可能性',
      status: newUserRate >= 30 && newUserRate <= 70 ? 'good' : 'warn',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    },
    {
      key: 'returning', label: 'リピーター', value: returningUsers.toLocaleString(), icon: '🔁',
      tooltip: '過去にもサイトを訪問したことがあるユーザー数。ファン化の指標',
      status: returningUsers > 10 ? 'good' : returningUsers > 3 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #ec4899, #f472b6)',
    },
    {
      key: 'pageviews', label: 'ページビュー', value: m.pageviews.toLocaleString(), icon: '📄',
      tooltip: '閲覧されたページの総数。コンテンツの消費量を示す',
      status: m.pageviews > 200 ? 'good' : m.pageviews > 50 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    },
    {
      key: 'pagesPerSession', label: 'PV/セッション', value: pagesPerSession.toFixed(2), icon: '📑',
      tooltip: '1回の訪問で平均何ページ見たか。回遊性の指標',
      status: pagesPerSession >= 2 ? 'good' : pagesPerSession >= 1.3 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #84cc16, #a3e635)',
    },
    {
      key: 'engagement', label: 'エンゲージメント率', value: `${er.toFixed(1)}%`, icon: '🎯',
      tooltip: 'サイトに関心を持って操作したセッションの割合。直帰の逆指標',
      status: er >= 60 ? 'good' : er >= 40 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #10b981, #34d399)',
    },
    {
      key: 'bounce', label: '直帰率', value: `${br.toFixed(1)}%`, icon: '↩️',
      tooltip: '1ページだけ見て離脱した割合。低いほど良い',
      status: br <= 40 ? 'good' : br <= 60 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #64748b, #94a3b8)',
    },
    {
      key: 'duration', label: '平均セッション時間', value: `${Math.round(m.avgSessionDuration)}秒`, icon: '⏱️',
      tooltip: '1回の訪問あたりの平均滞在時間。長いほどコンテンツが読まれている',
      status: m.avgSessionDuration >= 120 ? 'good' : m.avgSessionDuration >= 60 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
    },
    {
      key: 'conversions', label: 'コンバージョン', value: m.conversions.toLocaleString(), icon: '🎉',
      tooltip: '目標達成数（予約・問い合わせ等）。最終的なビジネス成果',
      status: m.conversions > 5 ? 'good' : m.conversions > 0 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)',
    },
  ];
}

// ─── コンポーネント ───

function KpiTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 12px', borderRadius: 8, fontSize: 11, lineHeight: 1.5,
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', whiteSpace: 'nowrap', zIndex: 50,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', marginBottom: 6,
          animation: 'tooltipFadeIn 0.15s ease',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── メインページ ───

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<GaMetrics | null>(null);
  const [channelBreakdown, setChannelBreakdown] = useState<Record<string, number>>({});
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const actionPlanRef = useRef<HTMLDivElement>(null);

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
      setInsightData({
        summary: data.summary || '',
        insights: data.insights || [],
        actionPlans: data.actionPlans || [],
        marketingIdeas: data.marketingIdeas || [],
      });
    } catch {
      setInsightData({
        summary: '',
        insights: [{ title: 'エラー', body: 'AI分析に失敗しました。再度お試しください。', type: 'warning' }],
        actionPlans: [],
        marketingIdeas: [],
      });
    } finally {
      setInsightLoading(false);
    }
  };

  // アクションプランをクリップボードにコピー
  const copyActionPlans = async () => {
    if (!insightData) return;
    const lines: string[] = ['【アクションプラン】', ''];
    const sorted = [...insightData.actionPlans].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    });
    sorted.forEach((ap, i) => {
      const p = ap.priority === 'high' ? '🔴高' : ap.priority === 'medium' ? '🟡中' : '🟢低';
      lines.push(`${i + 1}. [${p}] ${ap.title}`);
      lines.push(`   ${ap.description}`);
      if (ap.xluminaFeature) lines.push(`   💡 xLUMINA活用: ${ap.xluminaFeature}`);
      lines.push('');
    });
    if (insightData.marketingIdeas.length > 0) {
      lines.push('【マーケティング施策】', '');
      insightData.marketingIdeas.forEach((mi, i) => {
        lines.push(`${i + 1}. [${mi.channel}] ${mi.title}`);
        lines.push(`   ${mi.description}`);
        if (mi.xluminaUsage) lines.push(`   💡 xLUMINA活用: ${mi.xluminaUsage}`);
        lines.push('');
      });
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // チャート用データ
  const pieData = Object.entries(channelBreakdown).map(([name, value]) => ({ name, value }));
  const pageBarData = topPages.map(p => ({
    name: p.path.length > 25 ? p.path.slice(0, 25) + '…' : p.path,
    sessions: p.sessions,
    fullPath: p.path,
  }));

  const kpis = metrics ? buildKpis(metrics) : [];

  return (
    <div className="analytics-root">
      {/* CSS */}
      <style>{`
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .analytics-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .analytics-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .kpi-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px 18px;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.25s, transform 0.25s;
          animation: slideUp 0.4s ease both;
          cursor: default;
        }
        .kpi-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
        }
        .kpi-card:hover {
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border), transparent);
          margin: 32px 0;
        }
        .priority-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .action-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 20px;
          transition: box-shadow 0.2s, transform 0.2s;
          animation: slideUp 0.4s ease both;
        }
        .action-card:hover {
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .xlumina-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.08));
          border: 1px solid rgba(108,99,255,0.15);
          font-size: 12px;
          color: var(--text-primary);
          margin-top: 10px;
        }
        .copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .copy-btn:hover { background: var(--bg-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .shimmer-bar {
          height: 16px;
          border-radius: 8px;
          background: linear-gradient(90deg, var(--border) 25%, rgba(108,99,255,0.1) 50%, var(--border) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .marketing-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 20px;
          transition: box-shadow 0.2s, transform 0.2s;
          animation: slideUp 0.4s ease both;
        }
        .marketing-card:hover {
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .channel-tag {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          background: linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,184,0.12));
          color: var(--text-primary);
        }
        @media (max-width: 768px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .chart-grid { grid-template-columns: 1fr !important; }
          .action-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ─── ヘッダー ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              fontSize: 18,
            }}>📈</span>
            アナリティクス
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            GA4のデータを取得し、AIが自動で分析・アクション提案を行います
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: '11px 24px', borderRadius: 10, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
            fontWeight: 700, fontSize: 13, opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 14px rgba(108,99,255,0.3)',
          }}
        >
          {loading ? '取得中...' : 'GA4データを取得'}
        </button>
      </div>

      {/* ─── エラー ─── */}
      {error && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 24,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span> {error}
        </div>
      )}

      {/* ─── 空状態 ─── */}
      {!metrics && !loading && !error && (
        <div className="analytics-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,184,0.12))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            GA4データがまだ取得されていません
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            「GA4データを取得」ボタンをクリックして直近7日間のデータを取得してください
          </div>
        </div>
      )}

      {/* ─── ローディング ─── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer-bar" style={{ animationDelay: `${i * 0.2}s`, height: i === 1 ? 80 : 40 }} />
          ))}
        </div>
      )}

      {metrics && (
        <>
          {/* ═══ SECTION 1: KPIカード ═══ */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
              主要指標（直近7日間）
            </div>
            <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 12 }}>
              {kpis.map((kpi, idx) => {
                const sc = STATUS_COLORS[kpi.status];
                return (
                  <KpiTooltip key={kpi.key} text={kpi.tooltip}>
                    <div className="kpi-card" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kpi.gradient }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 15 }}>{kpi.icon}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</span>
                        </div>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', background: sc.dot,
                          boxShadow: `0 0 6px ${sc.dot}`,
                        }} />
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {kpi.value}
                      </div>
                    </div>
                  </KpiTooltip>
                );
              })}
            </div>
          </div>

          <div className="section-divider" />

          {/* ═══ SECTION 2: チャート ═══ */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
              チャネル分析 & 人気ページ
            </div>
            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* チャネル別 */}
              <div className="analytics-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>チャネル別セッション</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData} cx="50%" cy="50%"
                        outerRadius={90} innerRadius={40}
                        dataKey="value" strokeWidth={2} stroke="var(--bg-secondary)"
                        label={(props: { name?: string; percent?: number }) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={true}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                        formatter={(value) => [`${value} セッション`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
                )}
              </div>

              {/* 人気ページ */}
              <div className="analytics-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>人気ページ TOP10</h3>
                {pageBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={pageBarData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={110} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                        formatter={(value) => [`${value} セッション`, '']}
                        labelFormatter={(_label, payload) => {
                          const item = payload?.[0]?.payload;
                          return item?.fullPath ?? _label;
                        }}
                      />
                      <Bar dataKey="sessions" name="セッション" fill="url(#barGrad)" radius={[0, 6, 6, 0]} />
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6c63ff" />
                          <stop offset="100%" stopColor="#00d4b8" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
                )}
              </div>
            </div>
          </div>

          <div className="section-divider" />

          {/* ═══ SECTION 3: AI分析 ═══ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
                AI分析 & アクションプラン
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {insightData && (
                  <button className="copy-btn" onClick={copyActionPlans}>
                    {copied ? '✅ コピー完了' : '📋 アクションをコピー'}
                  </button>
                )}
                <button
                  onClick={fetchInsight}
                  disabled={insightLoading}
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: 'none',
                    cursor: insightLoading ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff',
                    fontWeight: 700, fontSize: 12, opacity: insightLoading ? 0.6 : 1,
                    transition: 'opacity 0.2s',
                    boxShadow: '0 3px 12px rgba(108,99,255,0.25)',
                  }}
                >
                  {insightLoading ? '🤖 分析中...' : '🤖 AIで分析する'}
                </button>
              </div>
            </div>

            {!insightData && !insightLoading && (
              <div className="analytics-card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  「AIで分析する」をクリックすると、Gemini AIがアクセスデータを分析し、<br />
                  課題分析・アクションプラン・マーケティング施策を一括で提案します
                </div>
              </div>
            )}

            {insightLoading && (
              <div className="analytics-card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>AIがデータを分析しています...</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>課題分析・アクションプラン・マーケティング施策を生成中</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="shimmer-bar" style={{ width: 60, height: 6, animationDelay: `${i * 0.3}s` }} />
                  ))}
                </div>
              </div>
            )}

            {insightData && (
              <div ref={actionPlanRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* サマリー */}
                {insightData.summary && (
                  <div style={{
                    padding: '16px 20px', borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
                    border: '1px solid rgba(108,99,255,0.15)',
                    fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 500,
                  }}>
                    {insightData.summary}
                  </div>
                )}

                {/* 課題と現状分析 */}
                {insightData.insights.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🔍</span> 課題と現状分析
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {insightData.insights.map((insight, i) => {
                        const s = INSIGHT_STYLE[insight.type] || INSIGHT_STYLE.info;
                        return (
                          <div key={i} style={{
                            padding: '14px 18px', borderRadius: 12,
                            background: s.bg, border: `1px solid ${s.border}`,
                            borderLeft: `3px solid ${s.gradStart}`,
                            animation: 'slideUp 0.4s ease both',
                            animationDelay: `${i * 0.08}s`,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{s.icon}</span> {insight.title}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                              {insight.body}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* アクションプラン */}
                {insightData.actionPlans.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🎯</span> アクションプラン
                    </h3>
                    <div className="action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                      {[...insightData.actionPlans]
                        .sort((a, b) => {
                          const order = { high: 0, medium: 1, low: 2 };
                          return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
                        })
                        .map((ap, i) => {
                          const pc = PRIORITY_CONFIG[ap.priority] || PRIORITY_CONFIG.low;
                          return (
                            <div key={i} className="action-card" style={{ animationDelay: `${i * 0.06}s`, borderLeft: `3px solid ${pc.border}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span className="priority-badge" style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                                  {ap.priority === 'high' ? '🔴' : ap.priority === 'medium' ? '🟡' : '🟢'} 優先度{pc.label}
                                </span>
                                {ap.category && (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: 6 }}>
                                    {ap.category}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                {ap.title}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                {ap.description}
                              </div>
                              {ap.xluminaFeature && (
                                <div className="xlumina-badge">
                                  <span>💡</span>
                                  <span style={{ fontWeight: 600 }}>xLUMINA活用:</span> {ap.xluminaFeature}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* マーケティング施策 */}
                {insightData.marketingIdeas.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🚀</span> クリニック向けマーケティング施策
                    </h3>
                    <div className="action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                      {insightData.marketingIdeas.map((mi, i) => (
                        <div key={i} className="marketing-card" style={{ animationDelay: `${i * 0.06}s` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span className="channel-tag">{mi.channel}</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                            {mi.title}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {mi.description}
                          </div>
                          {mi.xluminaUsage && (
                            <div className="xlumina-badge">
                              <span>💡</span>
                              <span style={{ fontWeight: 600 }}>xLUMINA活用:</span> {mi.xluminaUsage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
