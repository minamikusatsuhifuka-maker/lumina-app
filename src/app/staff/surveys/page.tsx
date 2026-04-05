'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function StaffSurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clinic/surveys')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSurveys(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const activeSurveys = surveys.filter(s => s.is_active);
  const inactiveSurveys = surveys.filter(s => !s.is_active);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📝 アンケート</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>回答可能なアンケート一覧</p>

      {surveys.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>アンケートがありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* アクティブなアンケート */}
          {activeSurveys.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#fff',
                    background: '#00d4b8',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}>受付中</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  {s.target_role && <span>対象: {s.target_role}</span>}
                  {s.created_at && <span>作成: {new Date(s.created_at).toLocaleDateString('ja-JP')}</span>}
                </div>
              </div>
              <Link
                href={`/staff/surveys/${s.id}`}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#6c63ff',
                  border: 'none',
                  borderRadius: 8,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                回答する →
              </Link>
            </div>
          ))}

          {/* 非アクティブなアンケート */}
          {inactiveSurveys.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              opacity: 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-primary)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  border: '1px solid var(--border)',
                }}>終了</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{s.title}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                {s.target_role && <span>対象: {s.target_role}</span>}
                {s.created_at && <span>作成: {new Date(s.created_at).toLocaleDateString('ja-JP')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
