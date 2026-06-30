'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { card, SectionTitle, ErrorBox, scoreColor } from '@/components/meo/ui';

interface DashboardData {
  reviews: {
    total: number;
    avgRating: number;
    replied: number;
    replyRate: number;
    riskFlagged: number;
    monthly: { month: string; count: number; avgRating: number }[];
  };
  checklist: { doneCount: number; total: number; rate: number };
  posts: { count: number };
  insights: { available: boolean; note: string };
  error?: string;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: '1 1 150px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

export default function MeoDashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/meo/dashboard');
      const json: DashboardData = await res.json();
      if (!res.ok) setError(json.error || '集計の取得に失敗しました');
      else setData(json);
    } catch {
      setError('集計の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p style={{ color: '#64748b' }}>集計中…</p>;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return null;

  const r = data.reviews;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat label="星評価の平均" value={r.avgRating.toFixed(2)} sub={`${r.total}件`} color={scoreColor(r.avgRating * 20)} />
        <Stat label="口コミ件数" value={String(r.total)} />
        <Stat label="返信率" value={`${r.replyRate}%`} sub={`${r.replied}/${r.total}件`} color={scoreColor(r.replyRate)} />
        <Stat label="最適化チェック達成" value={`${data.checklist.rate}%`} sub={`${data.checklist.doneCount}/${data.checklist.total}`} color={scoreColor(data.checklist.rate)} />
        <Stat label="投稿下書き本数" value={String(data.posts.count)} />
        <Stat label="要注意口コミ" value={String(r.riskFlagged)} sub="145で検知" color={r.riskFlagged > 0 ? '#b91c1c' : undefined} />
      </div>

      {r.monthly.length >= 2 && (
        <>
          <SectionTitle>📈 口コミ件数の推移（直近6ヶ月）</SectionTitle>
          <div style={{ ...card, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v}件`, '口コミ']} />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <SectionTitle>⭐ 星平均の推移</SectionTitle>
          <div style={{ ...card, height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, '星平均']} />
                <Line type="monotone" dataKey="avgRating" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <SectionTitle>🔌 GBP Insights（将来連携）</SectionTitle>
      <div style={{ ...card, background: '#f8fafc', color: '#64748b', fontSize: 13 }}>
        {data.insights.note}
        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
          ※ 誤った自動値は表示しません。Google連携（OAuth）後に表示回数・ルート検索・電話タップを自動取得予定です。
        </div>
      </div>
    </div>
  );
}
