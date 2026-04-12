'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';

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

interface ReferralSource {
  source: string;
  medium: string;
  sessions: number;
  bounceRate: number;
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

interface SavedSnapshot {
  id: string;
  date_start: string;
  date_end: string;
  sessions: number;
  users: number;
  new_users: number;
  pageviews: number;
  bounce_rate: number;
  engagement_rate: number;
  avg_session_duration: number;
  conversions: number;
  conversion_rate: number;
  channel_breakdown: Record<string, number> | null;
  top_pages: TopPage[] | null;
  ai_insight: InsightData | null;
  saved_at: string;
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

// GA4チャネル名を日本語に変換するマップ
const CHANNEL_LABEL_MAP: Record<string, string> = {
  'Organic Search': '🔍 自然検索',
  'Direct': '🔗 直接アクセス',
  'Referral': '📎 参照元',
  'Paid Search': '💰 有料検索広告',
  'Organic Social': '📱 SNS自然流入',
  'Unassigned': '❓ 未分類',
  'Email': '📧 メール',
  'Display': '🖼 ディスプレイ広告',
  'Paid Social': '💰 SNS広告',
  'Organic Video': '🎬 動画自然流入',
  'Paid Video': '💰 動画広告',
  'Cross-network': '🌐 クロスネットワーク',
  'Affiliates': '🤝 アフィリエイト',
  'Audio': '🎧 音声',
  'SMS': '💬 SMS',
};

function formatChannelName(name: string): string {
  return CHANNEL_LABEL_MAP[name] || name;
}

// 流入元ソース名からURLを生成
const SOURCE_URL_MAP: Record<string, string> = {
  'google': 'https://google.com',
  'yahoo': 'https://yahoo.co.jp',
  'bing': 'https://bing.com',
  'baidu': 'https://baidu.com',
  'duckduckgo': 'https://duckduckgo.com',
  'naver': 'https://naver.com',
  'yandex': 'https://yandex.com',
  'ig': 'https://instagram.com',
  'instagram': 'https://instagram.com',
  'facebook': 'https://facebook.com',
  'fb': 'https://facebook.com',
  'twitter': 'https://x.com',
  'x': 'https://x.com',
  't.co': 'https://x.com',
  'linkedin': 'https://linkedin.com',
  'youtube': 'https://youtube.com',
  'tiktok': 'https://tiktok.com',
  'pinterest': 'https://pinterest.com',
  'reddit': 'https://reddit.com',
};

function getSourceUrl(source: string): string {
  const lower = source.toLowerCase();
  if (SOURCE_URL_MAP[lower]) return SOURCE_URL_MAP[lower];
  if (lower.includes('.')) return `https://${source}`;
  return `https://${source}.com`;
}

// 人気ページのパスを日本語ラベルに変換するマップ
const PAGE_LABEL_MAP: Record<string, string> = {
  '/': 'トップページ',
  '/isotretinoin/': 'イソトレチノイン',
  '/isotretinoin': 'イソトレチノイン',
  '/acne/': 'ニキビ治療',
  '/acne': 'ニキビ治療',
  '/about/': 'クリニック紹介',
  '/about': 'クリニック紹介',
  '/access/': 'アクセス',
  '/access': 'アクセス',
  '/contact/': 'お問い合わせ',
  '/contact': 'お問い合わせ',
  '/reserve/': '予約',
  '/reserve': '予約',
  '/reservation/': '予約',
  '/reservation': '予約',
  '/staff/': 'スタッフ紹介',
  '/staff': 'スタッフ紹介',
  '/doctor/': '医師紹介',
  '/doctor': '医師紹介',
  '/price/': '料金表',
  '/price': '料金表',
  '/menu/': '診療メニュー',
  '/menu': '診療メニュー',
  '/dermoscopy/': 'ダーモスコピー',
  '/dermoscopy': 'ダーモスコピー',
  '/laser/': 'レーザー治療',
  '/laser': 'レーザー治療',
  '/skincare/': 'スキンケア',
  '/skincare': 'スキンケア',
  '/cosmetic/': '美容皮膚科',
  '/cosmetic': '美容皮膚科',
  '/allergy/': 'アレルギー',
  '/allergy': 'アレルギー',
  '/eczema/': '湿疹・皮膚炎',
  '/eczema': '湿疹・皮膚炎',
  '/blog/': 'ブログ',
  '/blog': 'ブログ',
  '/faq/': 'よくある質問',
  '/faq': 'よくある質問',
  '/privacy/': 'プライバシーポリシー',
  '/privacy': 'プライバシーポリシー',
};

function formatPagePath(path: string): string {
  const label = PAGE_LABEL_MAP[path];
  if (label) return `${label} (${path})`;
  // /xxx/ → xxx を抽出して先頭大文字化し、パスも付ける
  const seg = path.replace(/^\/|\/$/g, '').split('/').pop() || path;
  if (seg !== path && seg.length > 0) return `${seg} (${path})`;
  return path;
}

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
      tooltip: 'サイトへの訪問回数。1人が複数回訪問すると複数カウント',
      status: m.sessions > 100 ? 'good' : m.sessions > 30 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
    },
    {
      key: 'users', label: 'ユーザー', value: m.users.toLocaleString(), icon: '👤',
      tooltip: 'サイトを訪れた人数（重複なし）',
      status: m.users > 50 ? 'good' : m.users > 15 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #00d4b8, #10b981)',
    },
    {
      key: 'newUsers', label: '新規ユーザー', value: m.newUsers.toLocaleString(), icon: '🆕',
      tooltip: '初めてサイトを訪れた人の数',
      status: m.newUsers > 30 ? 'good' : m.newUsers > 10 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    },
    {
      key: 'newUserRate', label: '新規率', value: `${newUserRate.toFixed(1)}%`, icon: '📊',
      tooltip: '訪問者のうち初めて来た人の割合。高すぎるとリピーターが少ない',
      status: newUserRate >= 30 && newUserRate <= 70 ? 'good' : 'warn',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    },
    {
      key: 'returning', label: 'リピーター', value: returningUsers.toLocaleString(), icon: '🔁',
      tooltip: '2回以上訪問している人の数。既存患者や関心の高い人',
      status: returningUsers > 10 ? 'good' : returningUsers > 3 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #ec4899, #f472b6)',
    },
    {
      key: 'pageviews', label: 'ページビュー', value: m.pageviews.toLocaleString(), icon: '📄',
      tooltip: 'ページが表示された合計回数',
      status: m.pageviews > 200 ? 'good' : m.pageviews > 50 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    },
    {
      key: 'pagesPerSession', label: 'PV/セッション', value: pagesPerSession.toFixed(2), icon: '📑',
      tooltip: '1回の訪問で平均何ページ見たか。高いほど興味を持って回遊している',
      status: pagesPerSession >= 2 ? 'good' : pagesPerSession >= 1.3 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #84cc16, #a3e635)',
    },
    {
      key: 'engagement', label: 'エンゲージメント率', value: `${er.toFixed(1)}%`, icon: '🎯',
      tooltip: '10秒以上滞在・2ページ以上閲覧など、積極的に閲覧した割合。高いほど良い',
      status: er >= 60 ? 'good' : er >= 40 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #10b981, #34d399)',
    },
    {
      key: 'bounce', label: '直帰率', value: `${br.toFixed(1)}%`, icon: '↩️',
      tooltip: '1ページだけ見てすぐ離脱した割合。低いほど良い（目安：50%以下が理想）',
      status: br <= 40 ? 'good' : br <= 60 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #64748b, #94a3b8)',
    },
    {
      key: 'duration', label: '平均セッション時間', value: `${Math.round(m.avgSessionDuration)}秒`, icon: '⏱️',
      tooltip: '1回の訪問で平均どれくらい滞在したか',
      status: m.avgSessionDuration >= 120 ? 'good' : m.avgSessionDuration >= 60 ? 'warn' : 'bad',
      gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
    },
    {
      key: 'conversions', label: 'コンバージョン', value: m.conversions.toLocaleString(), icon: '🎉',
      tooltip: '予約・問い合わせなど目標とする行動が達成された回数',
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
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<SavedSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showClaudeModal, setShowClaudeModal] = useState(false);

  // 期間選択
  const [presetDays, setPresetDays] = useState<number>(7);
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [activeDateStart, setActiveDateStart] = useState<string | null>(null);
  const [activeDateEnd, setActiveDateEnd] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // カレンダー外クリックで閉じる
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar]);

  // 日付ヘルパー
  const toDateStr = (d: Date) => d.toISOString().split('T')[0];
  const formatDateJa = (s: string) => {
    const d = new Date(s + 'T00:00:00');
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  // 現在の選択期間を算出
  const getDateParams = () => {
    if (dateRange?.from && dateRange?.to) {
      return { startDate: toDateStr(dateRange.from), endDate: toDateStr(dateRange.to) };
    }
    const end = new Date();
    const start = new Date(Date.now() - presetDays * 24 * 60 * 60 * 1000);
    return { startDate: toDateStr(start), endDate: toDateStr(end) };
  };

  const periodLabel = (() => {
    const { startDate, endDate } = getDateParams();
    return `${formatDateJa(startDate)} 〜 ${formatDateJa(endDate)}`;
  })();

  // GA4データ取得
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const { startDate, endDate } = getDateParams();
    try {
      const res = await fetch('/api/ga/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'データ取得に失敗しました' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMetrics(data.metrics);
      setChannelBreakdown(data.channelBreakdown ?? {});
      setTopPages(data.topPages ?? []);
      setReferralSources(data.referralSources ?? []);
      setSnapshotId(data.snapshotId ?? null);
      setActiveDateStart(data.startDate ?? startDate);
      setActiveDateEnd(data.endDate ?? endDate);
      setSaved(false);
      setInsightData(null);
      setShowAllReferrals(false);
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

  // 履歴を取得
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ga/save');
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.snapshots ?? []);
    } catch {
      // 履歴取得失敗は無視
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 初回読み込み時に履歴を取得
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // AI分析結果を保存
  const saveInsight = async () => {
    if (!snapshotId || !insightData) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ga/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, aiInsight: insightData }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      setSaved(true);
      fetchHistory();
    } catch {
      setError('分析の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 履歴からMDをダウンロード
  const downloadHistoryMd = (snap: SavedSnapshot) => {
    const date = new Date(snap.saved_at).toLocaleDateString('ja-JP');
    const m = {
      sessions: snap.sessions, users: snap.users, newUsers: snap.new_users,
      pageviews: snap.pageviews, bounceRate: snap.bounce_rate,
      engagementRate: snap.engagement_rate, avgSessionDuration: snap.avg_session_duration,
      conversions: snap.conversions, conversionRate: snap.conversion_rate,
    };
    const pps = m.sessions > 0 ? (m.pageviews / m.sessions).toFixed(2) : '0';
    const nur = m.users > 0 ? ((m.newUsers / m.users) * 100).toFixed(1) : '0';
    const lines = [
      `# GA4分析レポート（${snap.date_start} 〜 ${snap.date_end}）`,
      ``, `> 保存日: ${date}`, ``,
      `## KPI`, ``,
      `| 指標 | 値 |`, `|---|---|`,
      `| セッション | ${m.sessions} |`,
      `| ユーザー | ${m.users} |`,
      `| 新規ユーザー | ${m.newUsers}（新規率 ${nur}%） |`,
      `| PV | ${m.pageviews} |`,
      `| PV/セッション | ${pps} |`,
      `| エンゲージメント率 | ${(m.engagementRate * 100).toFixed(1)}% |`,
      `| 直帰率 | ${(m.bounceRate * 100).toFixed(1)}% |`,
      `| コンバージョン | ${m.conversions} |`,
      ``,
    ];
    const insight = snap.ai_insight;
    if (insight) {
      if (insight.summary) lines.push(`## サマリー`, ``, insight.summary, ``);
      if (insight.insights?.length) {
        lines.push(`## 課題と現状分析`, ``);
        insight.insights.forEach((ins, i) => {
          lines.push(`${i + 1}. **${ins.title}**: ${ins.body}`);
        });
        lines.push(``);
      }
      if (insight.actionPlans?.length) {
        lines.push(`## アクションプラン`, ``);
        insight.actionPlans.forEach((ap, i) => {
          const p = ap.priority === 'high' ? '高' : ap.priority === 'medium' ? '中' : '低';
          lines.push(`${i + 1}. [${p}] **${ap.title}** — ${ap.description}`);
          if (ap.xluminaFeature) lines.push(`   - xLUMINA活用: ${ap.xluminaFeature}`);
        });
        lines.push(``);
      }
      if (insight.marketingIdeas?.length) {
        lines.push(`## マーケティング施策`, ``);
        insight.marketingIdeas.forEach((mi, i) => {
          lines.push(`${i + 1}. [${mi.channel}] **${mi.title}** — ${mi.description}`);
          if (mi.xluminaUsage) lines.push(`   - xLUMINA活用: ${mi.xluminaUsage}`);
        });
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ga4_report_${snap.date_start}_${snap.date_end}.md`;
    a.click();
    URL.revokeObjectURL(url);
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

  // チャート用データ（チャネル名を日本語に変換）
  const pieData = Object.entries(channelBreakdown).map(([name, value]) => ({ name: formatChannelName(name), value }));
  const totalSessions = pieData.reduce((sum, d) => sum + d.value, 0);
  const pageBarData = topPages.map(p => {
    const label = formatPagePath(p.path);
    return {
      name: label.length > 35 ? label.slice(0, 35) + '…' : label,
      sessions: p.sessions,
      fullPath: p.path,
    };
  });

  // Claude Code連携MDファイル生成
  const downloadClaudeCodeTasks = () => {
    if (!metrics || !insightData) return;
    const today = new Date().toISOString().split('T')[0];
    const pps = metrics.sessions > 0 ? (metrics.pageviews / metrics.sessions).toFixed(2) : '0';
    const nur = metrics.users > 0 ? ((metrics.newUsers / metrics.users) * 100).toFixed(1) : '0';

    const lines: string[] = [
      `# xLUMINA Claude Code 実装タスク`,
      ``,
      `> 生成日: ${today}`,
      `> このファイルを Claude Code に貼り付けて実装を依頼してください。`,
      `> 各タスクは独立して実装可能です。優先度の高いものから順に進めることを推奨します。`,
      ``,
      `---`,
      ``,
      `## 1. GA4データ概要（直近7日間）`,
      ``,
      `| 指標 | 値 |`,
      `|---|---|`,
      `| セッション | ${metrics.sessions.toLocaleString()} |`,
      `| ユーザー | ${metrics.users.toLocaleString()} |`,
      `| 新規ユーザー | ${metrics.newUsers.toLocaleString()}（新規率 ${nur}%） |`,
      `| リピーター | ${(metrics.users - metrics.newUsers).toLocaleString()} |`,
      `| ページビュー | ${metrics.pageviews.toLocaleString()} |`,
      `| PV/セッション | ${pps} |`,
      `| エンゲージメント率 | ${(metrics.engagementRate * 100).toFixed(1)}% |`,
      `| 直帰率 | ${(metrics.bounceRate * 100).toFixed(1)}% |`,
      `| 平均セッション時間 | ${Math.round(metrics.avgSessionDuration)}秒 |`,
      `| コンバージョン | ${metrics.conversions.toLocaleString()} |`,
      `| コンバージョン率 | ${(metrics.conversionRate * 100).toFixed(2)}% |`,
      ``,
    ];

    if (Object.keys(channelBreakdown).length > 0) {
      lines.push(`### チャネル別セッション`, ``);
      Object.entries(channelBreakdown).forEach(([ch, count]) => {
        lines.push(`- ${ch}: ${count}`);
      });
      lines.push(``);
    }

    if (topPages.length > 0) {
      lines.push(`### 人気ページ TOP${topPages.length}`, ``);
      topPages.forEach((p, i) => {
        lines.push(`${i + 1}. ${formatPagePath(p.path)} — ${p.sessions}セッション`);
      });
      lines.push(``);
    }

    lines.push(`---`, ``, `## 2. AI分析サマリー`, ``);
    if (insightData.summary) lines.push(insightData.summary, ``);

    if (insightData.actionPlans.length > 0) {
      lines.push(`---`, ``, `## 3. アクションプラン & Claude Code 実装タスク`, ``);
      const sorted = [...insightData.actionPlans].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
      });
      sorted.forEach((ap, i) => {
        const pLabel = ap.priority === 'high' ? '🔴 高' : ap.priority === 'medium' ? '🟡 中' : '🟢 低';
        lines.push(`### タスク ${i + 1}: ${ap.title}`);
        lines.push(``);
        lines.push(`- **優先度**: ${pLabel}`);
        lines.push(`- **カテゴリ**: ${ap.category || '一般'}`);
        lines.push(`- **概要**: ${ap.description}`);
        if (ap.xluminaFeature) {
          lines.push(`- **💡 xLUMINA活用**: ${ap.xluminaFeature}`);
        }
        lines.push(``);
        lines.push(`**Claude Code への実装依頼例:**`);
        lines.push('```');
        if (ap.category === 'SEO' || ap.category === 'コンテンツ') {
          lines.push(`xLUMINAに以下の機能を追加してください：`);
          lines.push(`「${ap.title}」を自動化するページ or APIを実装。`);
          lines.push(`- GA4データを参照して${ap.category}最適化の提案を表示`);
          lines.push(`- 結果をダッシュボードに反映`);
        } else if (ap.category === 'SNS') {
          lines.push(`xLUMINAに以下の機能を追加してください：`);
          lines.push(`SNSマーケティング強化のため「${ap.title}」を実装。`);
          lines.push(`- SNSアバタースタジオとの連携`);
          lines.push(`- 投稿コンテンツの自動生成機能`);
        } else if (ap.category === 'LP改善') {
          lines.push(`xLUMINAに以下の機能を追加してください：`);
          lines.push(`「${ap.title}」のためのLP改善機能を実装。`);
          lines.push(`- LP自動生成機能でバリエーションを作成`);
          lines.push(`- ABテスト生成機能でCTA最適化`);
        } else {
          lines.push(`xLUMINAに以下の機能を追加してください：`);
          lines.push(`「${ap.title}」— ${ap.description}`);
          lines.push(`GA4のデータと連携し、効果測定可能な形で実装。`);
        }
        lines.push('```');
        lines.push(``);
      });
    }

    if (insightData.marketingIdeas.length > 0) {
      lines.push(`---`, ``, `## 4. マーケティング施策 & 実装アイデア`, ``);
      insightData.marketingIdeas.forEach((mi, i) => {
        lines.push(`### 施策 ${i + 1}: [${mi.channel}] ${mi.title}`);
        lines.push(``);
        lines.push(`- **内容**: ${mi.description}`);
        if (mi.xluminaUsage) {
          lines.push(`- **💡 xLUMINA活用**: ${mi.xluminaUsage}`);
        }
        lines.push(``);
      });
    }

    lines.push(
      `---`,
      ``,
      `## 💡 Claude Code への貼り付け方`,
      ``,
      `1. Claude Code を開く`,
      `2. このファイルの内容をコピー、またはファイルパスを指定して読み込ませる`,
      `3. 「上記のタスクを優先度の高いものから順に実装してください」と依頼`,
      `4. 各タスクの実装後に \`npm run build\` で確認`,
      ``,
      `> 💡 ヒント: 一度に全タスクを依頼するより、2〜3タスクずつ依頼すると精度が上がります。`,
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xlumina_claude_code_tasks_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = metrics ? buildKpis(metrics) : [];

  return (
    <div className="analytics-root">
      {/* CSS */}
      <style>{`
        .preset-btn {
          padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border);
          background: var(--bg-secondary); color: var(--text-muted);
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .preset-btn:hover { border-color: #6c63ff; color: var(--text-primary); }
        .preset-btn.active {
          background: linear-gradient(135deg, rgba(108,99,255,0.1), rgba(0,212,184,0.1));
          border-color: #6c63ff; color: var(--text-primary);
        }
        .calendar-popover {
          position: absolute; top: 100%; right: 0; margin-top: 8px; z-index: 60;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.15);
          padding: 12px; animation: modalSlideUp 0.2s ease;
        }
        .calendar-popover .rdp-root {
          --rdp-accent-color: #6c63ff;
          --rdp-accent-background-color: rgba(108,99,255,0.12);
          --rdp-range_middle-background-color: rgba(108,99,255,0.06);
          --rdp-today-color: #00d4b8;
          font-size: 13px;
          color: var(--text-primary);
        }
        .calendar-popover .rdp-day { border-radius: 8px; }
        .calendar-popover .rdp-head_cell { color: var(--text-muted); font-size: 11px; }
        .calendar-popover .rdp-nav button { color: var(--text-muted); }
        .calendar-popover .rdp-caption_label { color: var(--text-primary); font-weight: 700; }
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
        .claude-code-btn:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.4) !important; transform: translateY(-1px); }
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
        .history-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          transition: box-shadow 0.2s;
        }
        .history-card:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .history-header:hover {
          background: rgba(108,99,255,0.04);
        }
        .history-detail {
          padding: 0 18px 16px;
          border-top: 1px solid var(--border);
        }
        .save-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 20px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          transition: opacity 0.2s, box-shadow 0.2s;
          box-shadow: 0 3px 12px rgba(16,185,129,0.25);
        }
        .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .save-btn:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .claude-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: modalFadeIn 0.2s ease;
        }
        .claude-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 100%; max-width: 800px;
          max-height: calc(100vh - 48px);
          overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.25);
          animation: modalSlideUp 0.3s ease;
        }
        .claude-modal::-webkit-scrollbar { width: 6px; }
        .claude-modal::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .claude-modal-section {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
        }
        .claude-modal-section:last-child { border-bottom: none; }
        .difficulty-stars { letter-spacing: 2px; }
        .enhance-item {
          padding: 14px 16px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg-primary);
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .enhance-item:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .chart-grid { grid-template-columns: 1fr !important; }
          .action-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ─── ヘッダー ─── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
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

        {/* 期間選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          {[
            { label: '過去7日', days: 7 },
            { label: '過去14日', days: 14 },
            { label: '過去30日', days: 30 },
            { label: '過去90日', days: 90 },
          ].map(p => (
            <button
              key={p.days}
              className={`preset-btn ${!dateRange && presetDays === p.days ? 'active' : ''}`}
              onClick={() => { setPresetDays(p.days); setDateRange(undefined); setShowCalendar(false); }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ position: 'relative' }} ref={calendarRef}>
            <button
              className={`preset-btn ${dateRange ? 'active' : ''}`}
              onClick={() => setShowCalendar(!showCalendar)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              📅 {dateRange?.from && dateRange?.to
                ? `${formatDateJa(toDateStr(dateRange.from))} 〜 ${formatDateJa(toDateStr(dateRange.to))}`
                : 'カスタム期間'}
            </button>
            {showCalendar && (
              <div className="calendar-popover">
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    if (range?.from && range?.to) {
                      // 365日制限
                      const diffMs = range.to.getTime() - range.from.getTime();
                      if (diffMs > 365 * 24 * 60 * 60 * 1000) {
                        const clampedFrom = new Date(range.to.getTime() - 365 * 24 * 60 * 60 * 1000);
                        setDateRange({ from: clampedFrom, to: range.to });
                      }
                      setShowCalendar(false);
                    }
                  }}
                  disabled={{ after: new Date() }}
                  numberOfMonths={2}
                  showOutsideDays
                />
                {dateRange?.from && !dateRange?.to && (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                    終了日を選択してください
                  </div>
                )}
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
            📅 {periodLabel}
          </span>
        </div>
      </div>

      {/* ─── 過去の分析履歴 ─── */}
      {history.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: 1 }} />
            過去の分析履歴（{history.length}件）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(snap => {
              const isExpanded = expandedHistoryId === snap.id;
              const savedDate = new Date(snap.saved_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
              const savedTime = new Date(snap.saved_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
              const insight = snap.ai_insight;
              return (
                <div key={snap.id} className="history-card">
                  <div className="history-header" onClick={() => setExpandedHistoryId(isExpanded ? null : snap.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 16 }}>{isExpanded ? '📂' : '📁'}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {snap.date_start} 〜 {snap.date_end}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {savedDate} {savedTime} 保存 ・ {snap.sessions}セッション ・ {snap.users}ユーザー ・ PV {snap.pageviews}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="copy-btn"
                        onClick={(e) => { e.stopPropagation(); downloadHistoryMd(snap); }}
                        style={{ fontSize: 11, padding: '5px 10px' }}
                      >
                        📥 MDでダウンロード
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                    </div>
                  </div>
                  {isExpanded && insight && (
                    <div className="history-detail">
                      {/* KPI概要 */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 0', fontSize: 12 }}>
                        {[
                          { label: 'セッション', val: snap.sessions },
                          { label: 'ユーザー', val: snap.users },
                          { label: '新規', val: snap.new_users },
                          { label: 'PV', val: snap.pageviews },
                          { label: 'エンゲージ率', val: `${(snap.engagement_rate * 100).toFixed(1)}%` },
                          { label: '直帰率', val: `${(snap.bounce_rate * 100).toFixed(1)}%` },
                          { label: 'CV', val: snap.conversions },
                        ].map(k => (
                          <div key={k.label} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                            <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{k.label}:</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.val}</span>
                          </div>
                        ))}
                      </div>
                      {/* サマリー */}
                      {insight.summary && (
                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.1)', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 10 }}>
                          {insight.summary}
                        </div>
                      )}
                      {/* 課題 */}
                      {insight.insights?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>課題と現状分析</div>
                          {insight.insights.map((ins, i) => (
                            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '4px 0' }}>
                              {INSIGHT_STYLE[ins.type]?.icon || '💡'} <strong>{ins.title}</strong>: {ins.body}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* アクションプラン */}
                      {insight.actionPlans?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>アクションプラン（{insight.actionPlans.length}件）</div>
                          {insight.actionPlans.slice(0, 5).map((ap, i) => {
                            const pc = PRIORITY_CONFIG[ap.priority] || PRIORITY_CONFIG.low;
                            return (
                              <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '3px 0', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                <span className="priority-badge" style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`, fontSize: 10, padding: '1px 6px', flexShrink: 0 }}>
                                  {pc.label}
                                </span>
                                <span><strong>{ap.title}</strong> — {ap.description}</span>
                              </div>
                            );
                          })}
                          {insight.actionPlans.length > 5 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>…他 {insight.actionPlans.length - 5} 件</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {historyLoading && (
        <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
          履歴を読み込み中...
        </div>
      )}

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
            期間を選択し「GA4データを取得」ボタンをクリックしてデータを取得してください
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
              主要指標{activeDateStart && activeDateEnd ? `（${formatDateJa(activeDateStart)} 〜 ${formatDateJa(activeDateEnd)}）` : ''}
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
                          <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</span>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
              チャネル分析 & 人気ページ
            </div>
            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* チャネル別（ドーナツ + リスト横並び） */}
              <div className="analytics-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>チャネル別セッション</h3>
                {pieData.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* ドーナツチャート（中央に総セッション数） */}
                    <div style={{ position: 'relative', flexShrink: 0, width: 200, height: 200 }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={pieData} cx="50%" cy="50%"
                            outerRadius={90} innerRadius={52}
                            dataKey="value" strokeWidth={2} stroke="var(--bg-secondary)"
                            label={false} labelLine={false}
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                            formatter={(value, _name, entry) => {
                              const v = typeof value === 'number' ? value : Number(value);
                              const pct = totalSessions > 0 ? ((v / totalSessions) * 100).toFixed(1) : '0';
                              return [`${v} セッション (${pct}%)`, entry?.payload?.name ?? ''];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* 中央オーバーレイ: 総セッション数 */}
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        textAlign: 'center', pointerEvents: 'none',
                      }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                          {totalSessions.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>総セッション</div>
                      </div>
                    </div>
                    {/* チャネルリスト */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pieData.map((d, i) => {
                        const pct = totalSessions > 0 ? (d.value / totalSessions) * 100 : 0;
                        const color = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{d.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, width: 44, textAlign: 'right' }}>{d.value}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0, width: 40, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--bg-primary)', flexShrink: 0, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
                )}
              </div>

              {/* 人気ページ */}
              <div className="analytics-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>人気ページ TOP20</h3>
                {pageBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(300, pageBarData.length * 28)}>
                    <BarChart data={pageBarData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: 'var(--text-muted)' }} width={180} />
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

          {/* ═══ 流入元サイト詳細 ═══ */}
          {referralSources.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
                流入元サイト詳細
              </div>
              <div className="analytics-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['流入元サイト', '媒体', 'セッション数', '直帰率'].map(h => (
                        <th key={h} style={{
                          padding: '12px 16px', textAlign: h === 'セッション数' || h === '直帰率' ? 'right' : 'left',
                          fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const,
                          letterSpacing: '0.04em', background: 'var(--bg-primary)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllReferrals ? referralSources : referralSources.slice(0, 10)).map((r, i) => {
                      const isSearchEngine = /google|yahoo|bing|baidu|duckduckgo|naver|yandex/i.test(r.source);
                      const br = r.bounceRate * 100;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,99,255,0.03)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isSearchEngine && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 22, height: 22, borderRadius: 6, fontSize: 11, flexShrink: 0,
                                background: 'rgba(16,185,129,0.1)', color: '#10b981',
                              }}>🔍</span>
                            )}
                            <a
                              href={getSourceUrl(r.source)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontWeight: 600, fontSize: 14,
                                color: isSearchEngine ? '#10b981' : 'var(--text-primary)',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                            >
                              {r.source}
                              <span style={{ fontSize: 11, opacity: 0.5 }}>↗</span>
                            </a>
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                            <span style={{
                              display: 'inline-block', padding: '3px 10px', borderRadius: 5, fontSize: 12,
                              background: r.medium === 'organic' ? 'rgba(16,185,129,0.08)' :
                                         r.medium === 'referral' ? 'rgba(108,99,255,0.08)' :
                                         r.medium === 'cpc' ? 'rgba(245,158,11,0.08)' : 'var(--bg-primary)',
                              color: r.medium === 'organic' ? '#10b981' :
                                     r.medium === 'referral' ? '#6c63ff' :
                                     r.medium === 'cpc' ? '#f59e0b' : 'var(--text-muted)',
                              fontWeight: 600,
                            }}>
                              {r.medium}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                            {r.sessions.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <span style={{
                              fontWeight: 600, fontSize: 14,
                              color: br <= 40 ? '#10b981' : br <= 60 ? '#f59e0b' : '#ef4444',
                            }}>
                              {br.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {referralSources.length > 10 && (
                  <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setShowAllReferrals(!showAllReferrals)}
                      style={{
                        padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                      }}
                    >
                      {showAllReferrals ? '▲ 折りたたむ' : `▼ もっと見る（残り${referralSources.length - 10}件）`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="section-divider" />

          {/* ══��� SECTION 3: AI分析 ═══ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 1 }} />
                AI分析 & アクションプラン
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {insightData && (
                  <button className="copy-btn" onClick={copyActionPlans}>
                    {copied ? '✅ コピー完了' : '📋 アクションをコピー'}
                  </button>
                )}
                {insightData && !saved && snapshotId && (
                  <button className="save-btn" onClick={saveInsight} disabled={saving}>
                    {saving ? '保存中...' : '💾 この分析を保存する'}
                  </button>
                )}
                {saved && (
                  <span style={{ padding: '9px 16px', fontSize: 12, fontWeight: 600, color: '#10b981' }}>
                    ✅ 保存済み
                  </span>
                )}
                {insightData && (
                  <button
                    onClick={() => setShowClaudeModal(true)}
                    style={{
                      padding: '9px 20px', borderRadius: 10, border: 'none',
                      cursor: 'pointer',
                      background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff',
                      fontWeight: 700, fontSize: 12,
                      transition: 'opacity 0.2s, box-shadow 0.2s',
                      boxShadow: '0 3px 12px rgba(245,158,11,0.3)',
                    }}
                  >
                    🤖 Claude Codeで強化する
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

      {/* ═══ Claude Code 強化モーダル ═══ */}
      {showClaudeModal && insightData && metrics && (() => {
        // 課題点を抽出（warning/info の上位3つ）
        const issues = insightData.insights
          .filter(i => i.type === 'warning' || i.type === 'info')
          .slice(0, 3);
        if (issues.length === 0 && insightData.insights.length > 0) {
          issues.push(...insightData.insights.slice(0, 3));
        }

        // 優先度別にアクションプランをグループ化
        const grouped: Record<string, typeof insightData.actionPlans> = { high: [], medium: [], low: [] };
        insightData.actionPlans.forEach(ap => {
          (grouped[ap.priority] ?? grouped.low).push(ap);
        });

        // 実装難易度を推定（カテゴリベース）
        const difficultyMap: Record<string, number> = {
          'SEO': 1, 'MEO': 1, 'コンテンツ': 1, 'SNS': 2,
          'LP改善': 2, '広告': 2, 'その他': 2,
        };
        const getDifficulty = (cat: string) => difficultyMap[cat] ?? 2;

        // 効果を推定
        const effectMap: Record<string, string> = {
          'SEO': '検索流入の増加',
          'MEO': 'ローカル検索の強化',
          'コンテンツ': 'PV・滞在時間の改善',
          'SNS': 'SNS流入・認知拡大',
          'LP改善': 'コンバージョン率の向上',
          '広告': '有料集客の効率化',
        };
        const getEffect = (cat: string) => effectMap[cat] ?? '運用効率の改善';

        const priorityLabel = { high: { text: '優先度 高', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' }, medium: { text: '優先度 中', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' }, low: { text: '優先度 低', color: '#22c55e', bg: 'rgba(34,197,94,0.08)' } };

        return (
          <div className="claude-modal-overlay" onClick={() => setShowClaudeModal(false)}>
            <div className="claude-modal" onClick={e => e.stopPropagation()}>
              {/* ヘッダー */}
              <div className="claude-modal-section" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(249,115,22,0.06))' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                      fontSize: 20,
                    }}>🤖</span>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        Claude Codeで強化できること
                      </h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        GA4分析結果を元に、xLUMINAの強化ポイントを提案します
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowClaudeModal(false)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              </div>

              {/* 現状サマリーカード */}
              <div className="claude-modal-section" style={{ background: 'rgba(108,99,255,0.03)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  📊 現状サマリー
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'セッション', value: metrics.sessions.toLocaleString(), icon: '👁️' },
                    { label: 'CV率', value: `${(metrics.conversionRate * 100).toFixed(2)}%`, icon: '🎯' },
                    { label: '直帰率', value: `${(metrics.bounceRate * 100).toFixed(1)}%`, icon: '↩️' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 14 }}>{s.icon}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {issues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>検出された課題</div>
                    {issues.map((issue, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0 }}>{INSIGHT_STYLE[issue.type]?.icon || '💡'}</span>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{issue.title}</strong> — {issue.body.length > 80 ? issue.body.slice(0, 80) + '…' : issue.body}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 強化提案リスト */}
              {insightData.actionPlans.length > 0 && (
                <div className="claude-modal-section">
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🎯 強化提案リスト
                  </h3>
                  {(['high', 'medium', 'low'] as const).map(priority => {
                    const items = grouped[priority];
                    if (items.length === 0) return null;
                    const pl = priorityLabel[priority];
                    return (
                      <div key={priority} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: pl.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pl.color }} />
                          {pl.text}（{items.length}件）
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.map((ap, i) => {
                            const diff = getDifficulty(ap.category);
                            const effect = getEffect(ap.category);
                            return (
                              <div key={i} className="enhance-item">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{ap.title}</span>
                                  {ap.category && (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: pl.bg, color: pl.color, fontWeight: 600 }}>{ap.category}</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                                  {ap.description}
                                </div>
                                <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    実装難易度: <span className="difficulty-stars" style={{ color: '#f59e0b' }}>{'⭐'.repeat(diff)}{'☆'.repeat(3 - diff)}</span>
                                  </span>
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    期待効果: <strong style={{ color: 'var(--text-primary)' }}>{effect}</strong>
                                  </span>
                                </div>
                                {ap.xluminaFeature && (
                                  <div className="xlumina-badge" style={{ marginTop: 8 }}>
                                    <span>💡</span>
                                    <span style={{ fontWeight: 600 }}>xLUMINA活用:</span> {ap.xluminaFeature}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* xLUMINA強化アイデア */}
              {insightData.marketingIdeas.length > 0 && (
                <div className="claude-modal-section" style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.03), rgba(0,212,184,0.03))' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🚀 xLUMINA 強化アイデア
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {insightData.marketingIdeas.map((mi, i) => (
                      <div key={i} className="enhance-item" style={{ borderLeft: '3px solid #6c63ff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span className="channel-tag">{mi.channel}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{mi.title}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>
                          {mi.description}
                        </div>
                        {mi.xluminaUsage && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, background: 'rgba(108,99,255,0.06)' }}>
                            <span>💡</span> <strong>新機能案:</strong> {mi.xluminaUsage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* フッター */}
              <div className="claude-modal-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '16px 24px' }}>
                <button
                  onClick={() => setShowClaudeModal(false)}
                  style={{
                    padding: '10px 20px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >✕ 閉じる</button>
                <button
                  onClick={() => { downloadClaudeCodeTasks(); setShowClaudeModal(false); }}
                  style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                  }}
                >📋 MDをダウンロード</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
