'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface StatsData {
  totals: { library: number; memory: number; glossary: number; templates: number };
  categoryBreakdown: { group_type: string; count: number }[];
  weeklyStats: { date: string; count: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  '文章作成': '#6c63ff',
  'Web調査': '#1D9E75',
  '分析': '#8b5cf6',
};

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>読み込み中...</div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>データを取得できませんでした</div>
    );
  }

  const kpiCards = [
    { label: '保存したアイテム数', value: data.totals.library, icon: '📚', color: '#6c63ff' },
    { label: 'AIメモリ件数', value: data.totals.memory, icon: '🧠', color: '#1D9E75' },
    { label: '用語解説件数', value: data.totals.glossary, icon: '📖', color: '#f59e0b' },
    { label: 'テンプレート数', value: data.totals.templates, icon: '📋', color: '#8b5cf6' },
  ];

  // カテゴリ別データをRechartsフォーマットに変換
  const barData = data.categoryBreakdown.map(d => ({
    name: d.group_type || '未分類',
    count: Number(d.count),
    fill: CATEGORY_COLORS[d.group_type] || '#64748b',
  }));

  // 週間データ
  const lineData = data.weeklyStats.map(d => ({
    date: new Date(d.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
    count: Number(d.count),
  }));

  // TOP3カテゴリ
  const top3 = data.categoryBreakdown.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>📊 使用状況</h1>

      {/* KPIカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {kpiCards.map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{card.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{card.label}</span>
            </div>
            <span style={{ fontSize: 32, fontWeight: 700, color: card.color }}>{card.value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* カテゴリ別使用内訳 */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>機能別使用内訳</h2>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="count" name="件数" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
          )}
        </div>

        {/* 過去7日間の保存数推移 */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>過去7日間の保存数推移</h2>
          {lineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Line type="monotone" dataKey="count" name="保存数" stroke="#6c63ff" strokeWidth={2} dot={{ r: 4, fill: '#6c63ff' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>データがありません</div>
          )}
        </div>
      </div>

      {/* よく使う機能TOP3 */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>よく使う機能 TOP3</h2>
        {top3.length > 0 ? (
          <div style={{ display: 'flex', gap: 16 }}>
            {top3.map((item, i) => (
              <div key={i} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                padding: 16, borderRadius: 10, border: '1px solid var(--border)',
                background: i === 0 ? 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.05))' : 'transparent',
              }}>
                <span style={{ fontSize: 28 }}>{medals[i]}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.group_type || '未分類'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Number(item.count).toLocaleString()} 件</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>まだデータがありません</div>
        )}
      </div>
    </div>
  );
}
