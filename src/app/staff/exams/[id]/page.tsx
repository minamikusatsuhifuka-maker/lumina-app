'use client';
import { useState, useEffect, use } from 'react';
import Link from 'next/link';

type Phase = 'before' | 'during' | 'after';

export default function StaffExamTakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('before');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/clinic/exams/${id}`)
      .then(r => r.json())
      .then(data => {
        setExam(data);
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
    const res = await fetch(`/api/clinic/exams/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 'anonymous', answers: JSON.stringify(answers) }),
    });
    const data = await res.json();
    setResult(data);
    setPhase('after');
    setSubmitting(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!exam) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>試験が見つかりません</div>;

  const questions = parseQuestions(exam.questions);

  // フェーズ: 試験前
  if (phase === 'before') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: 40 }}>
        <Link href="/staff/exams" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none', display: 'block', textAlign: 'left', marginBottom: 20 }}>← 試験一覧</Link>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 40,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📝</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{exam.title}</h1>
          {exam.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{exam.description}</p>}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 30, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#6c63ff' }}>{questions.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>問題数</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#00d4b8' }}>{exam.passing_score || 70}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>合格点</div>
            </div>
            {exam.target_role && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f5a623' }}>{exam.target_role}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>対象</div>
              </div>
            )}
          </div>

          <button
            onClick={() => setPhase('during')}
            style={{
              padding: '14px 40px',
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            試験を開始する
          </button>
        </div>
      </div>
    );
  }

  // フェーズ: 試験中
  if (phase === 'during') {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{exam.title}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px' }}>
            回答済: {Object.keys(answers).length} / {questions.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map((q: any, i: number) => {
            const qId = q.id || `q${i}`;
            const options = q.options || q.choices || [];
            return (
              <div key={qId} style={{
                background: 'var(--bg-secondary)',
                border: answers[qId] ? '1px solid #6c63ff44' : '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                  <span style={{ color: '#6c63ff', marginRight: 6 }}>Q{i + 1}.</span>
                  {q.text || q.question || q.label}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {options.map((opt: string, oi: number) => (
                    <label key={oi} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
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
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '14px 40px',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              background: submitting ? '#555' : '#6c63ff',
              border: 'none',
              borderRadius: 10,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '採点中...' : '回答を提出する'}
          </button>
        </div>
      </div>
    );
  }

  // フェーズ: 結果
  const passed = result?.passed;
  const score = result?.score ?? 0;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* 結果ヘッダー */}
      <div style={{
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 30,
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>{passed ? '🎉' : '😢'}</div>
        <div style={{
          display: 'inline-block',
          padding: '6px 20px',
          fontSize: 16,
          fontWeight: 700,
          color: '#fff',
          background: passed ? '#00d4b8' : '#ef4444',
          borderRadius: 20,
          marginBottom: 12,
        }}>
          {passed ? '合格' : '不合格'}
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>{score}点</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          正答: {result?.correctCount ?? 0} / {result?.totalQuestions ?? questions.length} 問 ・ 合格ライン: {exam.passing_score || 70}点
        </div>
      </div>

      {/* 各問の結果 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {questions.map((q: any, i: number) => {
          const qId = q.id || `q${i}`;
          const userAnswer = answers[qId];
          const correct = userAnswer === q.correctAnswer;
          return (
            <div key={qId} style={{
              background: 'var(--bg-secondary)',
              border: `1px solid ${correct ? '#00d4b844' : '#ef444444'}`,
              borderRadius: 10,
              padding: 14,
              borderLeft: `4px solid ${correct ? '#00d4b8' : '#ef4444'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Q{i + 1}. {q.text || q.question || q.label}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: correct ? '#00d4b8' : '#ef4444',
                  borderRadius: 4,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                  marginLeft: 8,
                }}>
                  {correct ? '正解' : '不正解'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                あなたの回答: <span style={{ color: correct ? '#00d4b8' : '#ef4444' }}>{userAnswer || '未回答'}</span>
              </div>
              {!correct && q.correctAnswer && (
                <div style={{ fontSize: 12, color: '#00d4b8', marginTop: 2 }}>
                  正解: {q.correctAnswer}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 戻るリンク */}
      <div style={{ textAlign: 'center' }}>
        <Link
          href="/staff/exams"
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
          ← 試験一覧に戻る
        </Link>
      </div>
    </div>
  );
}
