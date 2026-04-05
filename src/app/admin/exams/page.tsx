'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [targetRole, setTargetRole] = useState('全員');
  const [difficulty, setDifficulty] = useState('普通');
  const [gradeLevel, setGradeLevel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetch('/api/clinic/exams').then(r => r.json()).then(d => { if (Array.isArray(d)) setExams(d); setLoading(false); }); }, []);

  const generate = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/exam-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, targetRole, gradeLevel, difficulty }) });
      const data = await res.json();
      if (data.title) setPreview(data);
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const savePreview = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await fetch('/api/clinic/exams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: preview.title, description: preview.description, questions: JSON.stringify(preview.questions), passingScore: preview.passingScore || 70, targetRole }) });
      setShowModal(false); setPreview(null); setSubject('');
      const d = await (await fetch('/api/clinic/exams')).json(); if (Array.isArray(d)) setExams(d);
    } finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>📋 試験管理</h1>
        <button onClick={() => setShowModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>＋ AIで試験を作成</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>スタッフ向け試験をAIで自動生成・管理</p>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : exams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>📋</div><div>試験がありません</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exams.map(e => (
            <Link key={e.id} href={`/admin/exams/${e.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{e.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>対象: {e.target_role || '全員'} / 合格ライン: {e.passing_score}点 / {new Date(e.created_at).toLocaleDateString('ja-JP')}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 AIで試験作成</h2>
              <button onClick={() => { setShowModal(false); setPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

            {!preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>科目</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="例：接遇マナー、感染対策" style={inputStyle} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>対象職種</label>
                  <select value={targetRole} onChange={e => setTargetRole(e.target.value)} style={inputStyle}><option>全員</option><option>看護師</option><option>受付</option><option>歯科助手</option></select></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>難易度</label>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={inputStyle}><option>簡単</option><option>普通</option><option>難しい</option></select></div>
                <button onClick={generate} disabled={generating || !subject.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: generating ? 'not-allowed' : 'pointer', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14 }}>{generating ? '生成中...' : '🤖 生成する'}</button>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{preview.title}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(preview.questions || []).map((q: any, i: number) => (
                    <div key={i} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Q{i + 1}. {q.question}</div>
                      {q.options?.map((o: string, j: number) => <div key={j} style={{ fontSize: 12, color: o.startsWith(q.correctAnswer) ? '#4ade80' : 'var(--text-muted)', marginTop: 2, paddingLeft: 12 }}>{o}</div>)}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={savePreview} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : 'この試験を使用する'}</button>
                  <button onClick={() => setPreview(null)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
