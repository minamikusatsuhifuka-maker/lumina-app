'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function StaffExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clinic/exams')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setExams(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📋 試験一覧</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>受験可能な試験一覧</p>

      {exams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>試験がありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exams.map(exam => (
            <div key={exam.id} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{exam.title}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  {exam.passing_score && (
                    <span style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '2px 8px',
                    }}>
                      合格ライン: {exam.passing_score}点
                    </span>
                  )}
                  {exam.target_role && (
                    <span style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '2px 8px',
                    }}>
                      対象: {exam.target_role}
                    </span>
                  )}
                  {exam.description && (
                    <span>{exam.description}</span>
                  )}
                </div>
              </div>
              <Link
                href={`/staff/exams/${exam.id}`}
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
                受験する →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
