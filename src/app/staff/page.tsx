'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function StaffHomePage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/clinic/tasks').then(r => r.json()),
      fetch('/api/clinic/strategies').then(r => r.json()),
      fetch('/api/clinic/surveys').then(r => r.json()),
      fetch('/api/clinic/exams').then(r => r.json()),
    ]).then(([t, s, sv, ex]) => {
      if (Array.isArray(t)) setTasks(t);
      if (Array.isArray(s)) setStrategies(s);
      if (Array.isArray(sv)) setSurveys(sv);
      if (Array.isArray(ex)) setExams(ex);
      setLoading(false);
    });
  }, []);

  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date());
  const todayTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString());
  const activeStrategies = strategies.filter(s => s.status === 'active').slice(0, 3);
  const activeSurveys = surveys.filter(s => s.is_active);
  const myTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'おはようございます' : now.getHours() < 18 ? 'こんにちは' : 'お疲れ様です';

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{greeting} 👋</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
      </div>

      {/* ビジョンバナー */}
      <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(6,182,212,0.06))', border: '1px solid rgba(6,182,212,0.2)' }}>
        <div style={{ fontSize: 10, color: '#06b6d4', fontWeight: 700, marginBottom: 4, letterSpacing: 2 }}>🌟 私たちの目指す姿</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          あなたはこのクリニックの<span style={{ color: '#8b5cf6', fontWeight: 700 }}>主役</span>です。強みを活かし、仲間と共に成長しながら、縁ある人を豊かで幸せにしていきましょう。
        </div>
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: '期限超過', count: overdue.length, color: '#ef4444', icon: '🔴' },
          { label: '今日期限', count: todayTasks.length, color: '#f5a623', icon: '🟡' },
          { label: 'アンケート', count: activeSurveys.length, color: '#6c63ff', icon: '📝' },
          { label: '試験', count: exams.length, color: '#00d4b8', icon: '📋' },
        ].map(c => (
          <div key={c.label} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.icon} {c.label}</div>
          </div>
        ))}
      </div>

      {/* 私のタスク */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📌 私のタスク</span>
          <Link href="/staff/tasks" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>全て見る →</Link>
        </div>
        {myTasks.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>タスクがありません</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myTasks.map(t => (
              <div key={t.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.title}</span>
                <span style={{ fontSize: 11, color: t.due_date && new Date(t.due_date) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('ja-JP') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* クリニックの今 */}
      {activeStrategies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 10 }}>🗺 クリニックの今</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeStrategies.map(s => (
              <Link key={s.id} href="/staff/strategy" style={{ textDecoration: 'none' }}>
                <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.category}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
