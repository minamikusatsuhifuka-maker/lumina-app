'use client';
import { useState, useEffect } from 'react';

const categoryColors: Record<string, string> = {
  '経営': '#6c63ff',
  '人事': '#f5a623',
  '集患': '#00d4b8',
  '教育': '#e056a0',
  'オペレーション': '#4ecdc4',
};

export default function StaffStrategyPage() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clinic/strategies')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setStrategies(data.filter(s => s.status === 'active'));
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>🗺 クリニック戦略</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>現在進行中の戦略一覧（読み取り専用）</p>

      {strategies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>アクティブな戦略がありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {strategies.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              borderLeft: `4px solid ${categoryColors[s.category] || '#6c63ff'}`,
            }}>
              {/* ヘッダー */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{s.title}</div>
                  {s.category && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      color: categoryColors[s.category] || '#6c63ff',
                      background: `${categoryColors[s.category] || '#6c63ff'}18`,
                      borderRadius: 6,
                      padding: '2px 10px',
                    }}>
                      {s.category}
                    </span>
                  )}
                </div>
                {s.priority && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#fff',
                    background: s.priority === 'high' ? '#ef4444' : s.priority === 'medium' ? '#f5a623' : '#6c63ff',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}>
                    {s.priority}
                  </span>
                )}
              </div>

              {/* 説明 */}
              {s.description && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                  {s.description}
                </div>
              )}

              {/* 目標 */}
              {s.goal && (
                <div style={{
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 10,
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>🎯 目標</span>
                  {s.goal}
                </div>
              )}

              {/* 日付 */}
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                {s.start_date && <span>開始: {new Date(s.start_date).toLocaleDateString('ja-JP')}</span>}
                {s.target_date && <span>目標: {new Date(s.target_date).toLocaleDateString('ja-JP')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
