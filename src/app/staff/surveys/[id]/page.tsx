'use client';
import { useState, useEffect, use } from 'react';
import Link from 'next/link';

export default function StaffSurveyRespondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [survey, setSurvey] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/clinic/surveys/${id}`)
      .then(r => r.json())
      .then(data => {
        setSurvey(data);
        setLoading(false);
      });
  }, [id]);

  const parseQuestions = (q: any): any[] => {
    if (!q) return [];
    if (Array.isArray(q)) return q;
    try { return JSON.parse(q); } catch { return []; }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const res = await fetch(`/api/clinic/surveys/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 'anonymous', answers: JSON.stringify(answers) }),
    });
    if (res.ok) {
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!survey) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>アンケートが見つかりません</div>;

  if (submitted) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>回答ありがとうございました！</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>アンケートへの回答が送信されました。</p>
        <Link
          href="/staff/surveys"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: '#6c63ff',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          ← アンケート一覧に戻る
        </Link>
      </div>
    );
  }

  const questions = parseQuestions(survey.questions);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/staff/surveys" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>← アンケート一覧</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>{survey.title}</h1>
        {survey.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{survey.description}</p>}
      </div>

      {/* 質問 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {questions.map((q: any, i: number) => {
          const qId = q.id || `q${i}`;
          return (
            <div key={qId} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                Q{i + 1}. {q.text || q.question || q.label}
                {q.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
              </div>

              {/* radio */}
              {q.type === 'radio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(q.options || []).map((opt: string, oi: number) => (
                    <label key={oi} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      background: answers[qId] === opt ? '#6c63ff18' : 'var(--bg-primary)',
                      border: answers[qId] === opt ? '1px solid #6c63ff' : '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                    }}>
                      <input
                        type="radio"
                        name={qId}
                        checked={answers[qId] === opt}
                        onChange={() => setAnswers(prev => ({ ...prev, [qId]: opt }))}
                        style={{ accentColor: '#6c63ff' }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {/* checkbox */}
              {q.type === 'checkbox' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(q.options || []).map((opt: string, oi: number) => {
                    const current = (answers[qId] as string[]) || [];
                    const checked = current.includes(opt);
                    return (
                      <label key={oi} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: checked ? '#6c63ff18' : 'var(--bg-primary)',
                        border: checked ? '1px solid #6c63ff' : '1px solid var(--border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAnswers(prev => ({
                              ...prev,
                              [qId]: checked ? current.filter(v => v !== opt) : [...current, opt],
                            }));
                          }}
                          style={{ accentColor: '#6c63ff' }}
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* text */}
              {q.type === 'text' && (
                <textarea
                  value={(answers[qId] as string) || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [qId]: e.target.value }))}
                  placeholder="回答を入力してください..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: 8,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              )}

              {/* scale */}
              {q.type === 'scale' && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setAnswers(prev => ({ ...prev, [qId]: String(n) }))}
                      style={{
                        width: 48,
                        height: 48,
                        fontSize: 16,
                        fontWeight: 700,
                        color: answers[qId] === String(n) ? '#fff' : 'var(--text-secondary)',
                        background: answers[qId] === String(n) ? '#6c63ff' : 'var(--bg-primary)',
                        border: answers[qId] === String(n) ? '2px solid #6c63ff' : '1px solid var(--border)',
                        borderRadius: 10,
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 送信ボタン */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '12px 40px',
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            background: submitting ? '#555' : '#6c63ff',
            border: 'none',
            borderRadius: 10,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '送信中...' : '回答を送信'}
        </button>
      </div>
    </div>
  );
}
