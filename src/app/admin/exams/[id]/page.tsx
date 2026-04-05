'use client';
import { useState, useEffect, use } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';

export default function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(`/api/clinic/exams/${id}`).then(r => r.json()).then(d => { setExam(d); setLoading(false); }); }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!exam) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>試験が見つかりません</div>;

  const results = exam.results || [];
  const passCount = results.filter((r: any) => r.passed).length;
  const passRate = results.length > 0 ? Math.round((passCount / results.length) * 100) : 0;

  const chartData = [
    { name: '合格', value: passCount, color: '#4ade80' },
    { name: '不合格', value: results.length - passCount, color: '#ef4444' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{exam.title}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>合格ライン: {exam.passing_score}点 / 受験者: {results.length}名 / 合格率: {passRate}%</p>

      {results.length > 0 && (
        <div style={{ height: 200, marginBottom: 24 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>受験結果</h2>
      {results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>まだ受験者がいません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r: any) => (
            <div key={r.id} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.staff_name || r.staff_id}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: r.passed ? '#4ade80' : '#ef4444' }}>{r.score}点</span>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: r.passed ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)', color: r.passed ? '#4ade80' : '#ef4444' }}>{r.passed ? '合格' : '不合格'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.taken_at).toLocaleDateString('ja-JP')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
