'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const GRADE_COLORS: Record<string, string> = {
  '5': '#8b5cf6', '4': '#06b6d4', '3': '#4ade80', '2': '#60a5fa', '1': '#94a3b8',
};

const STAGE_COLORS: Record<string, string> = {
  'Lv1知る': '#94a3b8', 'Lv2わかる': '#60a5fa',
  'Lv3行う': '#fbbf24', 'Lv4できる': '#4ade80', 'Lv5分かち合う': '#a78bfa',
};

export default function StaffSummaryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'grade' | 'score' | 'meeting'>('grade');
  const [filterAlert, setFilterAlert] = useState(false);

  useEffect(() => {
    fetch('/api/clinic/staff/summary')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      読み込み中...
    </div>
  );

  const summary: any[] = data?.summary || [];
  const gradeDistribution: any[] = data?.gradeDistribution || [];
  const needsAttention: any[] = data?.needsAttention || [];

  const sorted = [...summary].sort((a, b) => {
    if (sortBy === 'grade') return (b.grade_level_number || 0) - (a.grade_level_number || 0);
    if (sortBy === 'score') return (b.total_score || 0) - (a.total_score || 0);
    if (sortBy === 'meeting') return (b.last_meeting_days === null ? 999 : b.last_meeting_days) - (a.last_meeting_days === null ? 999 : a.last_meeting_days);
    return 0;
  });

  const displayed = filterAlert ? needsAttention : sorted;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            📊 スタッフ成長サマリー
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            全{summary.length}名のスタッフの成長状況を俯瞰する
          </p>
        </div>
        <Link href="/admin/staff" style={{ fontSize: 13, color: '#6c63ff', textDecoration: 'none' }}>
          ← スタッフ一覧へ
        </Link>
      </div>

      {/* 要注意アラート */}
      {needsAttention.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 20, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>⚠️ {needsAttention.length}名のスタッフが30日以上1on1未実施</span>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {needsAttention.map(s => s.name).join('・')}
            </div>
          </div>
          <button onClick={() => setFilterAlert(!filterAlert)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: filterAlert ? 'rgba(245,158,11,0.15)' : 'transparent', color: '#d97706', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {filterAlert ? '全員表示' : '該当者のみ表示'}
          </button>
        </div>
      )}

      {/* 等級分布グラフ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🏅 等級分布</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={gradeDistribution} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {gradeDistribution.map((entry, i) => (
                  <Cell key={i} fill={GRADE_COLORS[entry.grade.replace('G', '')] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📈 全体スコア平均</div>
          {[
            { label: '総合スコア', value: summary.filter(s => s.total_score).length > 0 ? Math.round(summary.reduce((acc, s) => acc + (s.total_score || 0), 0) / summary.filter(s => s.total_score).length) : null, color: '#6c63ff' },
            { label: 'マインド', value: summary.filter(s => s.eval_mindset).length > 0 ? Math.round(summary.reduce((acc, s) => acc + (s.eval_mindset || 0), 0) / summary.filter(s => s.eval_mindset).length) : null, color: '#f59e0b' },
            { label: '知識', value: summary.filter(s => s.knowledge_score).length > 0 ? Math.round(summary.reduce((acc, s) => acc + (s.knowledge_score || 0), 0) / summary.filter(s => s.knowledge_score).length) : null, color: '#4ade80' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${item.value || 0}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: item.color, minWidth: 32, textAlign: 'right' }}>{item.value ?? '—'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ソート */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>並び替え：</span>
        {[
          { k: 'grade', l: '等級順' },
          { k: 'score', l: 'スコア順' },
          { k: 'meeting', l: '1on1が古い順' },
        ].map(s => (
          <button key={s.k} onClick={() => setSortBy(s.k as any)}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid', fontSize: 12, cursor: 'pointer', background: sortBy === s.k ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: sortBy === s.k ? '#6c63ff' : 'var(--text-muted)', borderColor: sortBy === s.k ? 'rgba(108,99,255,0.3)' : 'var(--border)', fontWeight: sortBy === s.k ? 600 : 400 }}>
            {s.l}
          </button>
        ))}
      </div>

      {/* スタッフカード一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayed.map(s => {
          const gradeColor = GRADE_COLORS[String(s.grade_level_number)] || '#94a3b8';
          const alertLevel = s.last_meeting_days === null ? 'none' :
            s.last_meeting_days > 60 ? 'danger' :
            s.last_meeting_days > 30 ? 'warning' : 'ok';

          return (
            <Link key={s.id} href={`/admin/staff/${s.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-secondary)', border: `1px solid ${alertLevel === 'danger' ? 'rgba(239,68,68,0.3)' : alertLevel === 'warning' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`, borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.15s' }}>

                {/* アバター */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${gradeColor}, ${gradeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {s.name?.charAt(0)}
                </div>

                {/* 名前・職種 */}
                <div style={{ minWidth: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.position || '職種未設定'}</div>
                </div>

                {/* 等級バッジ */}
                <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: gradeColor + '20', color: gradeColor, flexShrink: 0 }}>
                  {s.current_grade_label || '等級未設定'}
                </span>

                {/* 評価スコア */}
                <div style={{ flex: 1, display: 'flex', gap: 16, alignItems: 'center' }}>
                  {s.total_score !== null ? (
                    <>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>総合</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: s.total_score >= 80 ? '#4ade80' : s.total_score >= 60 ? '#f59e0b' : '#ef4444' }}>{s.total_score}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>マインド</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>{s.eval_mindset || '—'}</div>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>評価未実施</span>
                  )}
                </div>

                {/* 成長段階 */}
                {s.last_growth_stage && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: (STAGE_COLORS[s.last_growth_stage] || '#94a3b8') + '20', color: STAGE_COLORS[s.last_growth_stage] || '#94a3b8', flexShrink: 0 }}>
                    {s.last_growth_stage}
                  </span>
                )}

                {/* 最終1on1 */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>最終1on1</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: alertLevel === 'danger' ? '#ef4444' : alertLevel === 'warning' ? '#f59e0b' : 'var(--text-secondary)' }}>
                    {s.last_meeting_days === null ? '未実施' : s.last_meeting_days === 0 ? '今日' : `${s.last_meeting_days}日前`}
                  </div>
                </div>

              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
