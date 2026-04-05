'use client';
import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer,
} from 'recharts';

type ScoreItem = { score: number; label: string; comment: string };

interface HiringScoreChartProps {
  scores: Record<string, ScoreItem>;
  totalScore: number;
  rank: string;
  rankLabel: string;
}

type ChartTab = 'radar' | 'bar' | 'total';

const RANK_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  S: { bg: 'rgba(245,166,35,0.2)', color: '#f5a623', border: 'rgba(245,166,35,0.4)' },
  A: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  B: { bg: 'rgba(108,99,255,0.15)', color: '#6c63ff', border: 'rgba(108,99,255,0.3)' },
  C: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', border: 'rgba(234,179,8,0.3)' },
  D: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
};

const getBarColor = (score: number) => score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

export function HiringScoreChart({ scores, totalScore, rank, rankLabel }: HiringScoreChartProps) {
  const [chartTab, setChartTab] = useState<ChartTab>('radar');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const radarData = Object.values(scores).map(item => ({
    subject: item.label,
    score: item.score,
    ideal: 80,
  }));

  const barData = Object.values(scores).map(item => ({
    name: item.label,
    score: item.score,
  }));

  const rc = RANK_COLORS[rank] || RANK_COLORS.B;
  const totalColor = totalScore >= 90 ? '#f5a623' : totalScore >= 80 ? '#4ade80' : totalScore >= 70 ? '#6c63ff' : totalScore >= 60 ? '#eab308' : '#ef4444';

  return (
    <div>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([
          { key: 'radar' as ChartTab, label: 'レーダー' },
          { key: 'bar' as ChartTab, label: '棒グラフ' },
          { key: 'total' as ChartTab, label: '総合スコア' },
        ]).map(t => (
          <button key={t.key} onClick={() => setChartTab(t.key)} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: chartTab === t.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
            color: chartTab === t.key ? '#6c63ff' : 'var(--text-muted)',
            border: `1px solid ${chartTab === t.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* レーダーチャート */}
      {chartTab === 'radar' && (
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Radar name="理想ライン" dataKey="ideal" stroke="rgba(108,99,255,0.3)" fill="rgba(108,99,255,0.05)" strokeDasharray="4 4" />
              <Radar name="スコア" dataKey="score" stroke="#8b5cf6" fill="rgba(139,92,246,0.25)" strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 棒グラフ */}
      {chartTab === 'bar' && (
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={barData} layout="vertical" margin={{ left: 100, right: 40 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={100} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: 'var(--text-muted)', fontSize: 12 }}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 総合スコア */}
      {chartTab === 'total' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }}>
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            border: `6px solid ${totalColor}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: totalColor }}>{totalScore}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</div>
          </div>
          <div style={{ padding: '8px 24px', borderRadius: 12, background: rc.bg, border: `1px solid ${rc.border}`, fontSize: 20, fontWeight: 700, color: rc.color }}>
            {rank} {rankLabel}
          </div>
        </div>
      )}

      {/* 各評価軸の詳細（アコーディオン） */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>各評価軸の詳細</div>
        {Object.entries(scores).map(([key, item]) => (
          <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => setExpandedKey(expandedKey === key ? null : key)}
              style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: getBarColor(item.score) }}>{item.score}点</span>
            </div>
            {expandedKey === key && (
              <div style={{ padding: '0 14px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {item.comment}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
