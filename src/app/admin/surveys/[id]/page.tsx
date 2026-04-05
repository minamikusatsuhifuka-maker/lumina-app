'use client';
import { useState, useEffect, use } from 'react';

export default function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [survey, setSurvey] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [trendAnalysis, setTrendAnalysis] = useState('');

  useEffect(() => { fetch(`/api/clinic/surveys/${id}`).then(r => r.json()).then(d => { setSurvey(d); setLoading(false); }); }, [id]);

  const analyzeTrend = async () => {
    if (!survey?.responses?.length) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clinic/response-summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surveyId: id, staffId: null }) });
      const data = await res.json();
      setTrendAnalysis(data.summary || JSON.stringify(data, null, 2));
    } catch { setTrendAnalysis('分析に失敗しました'); }
    finally { setAnalyzing(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!survey) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>アンケートが見つかりません</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{survey.title}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{survey.description}</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={analyzeTrend} disabled={analyzing || !(survey.responses?.length)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {analyzing ? '分析中...' : '📊 全体傾向をAI分析'}
        </button>
      </div>

      {trendAnalysis && (
        <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{trendAnalysis}</div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>回答一覧（{survey.responses?.length || 0}件）</h2>
      {!(survey.responses?.length) ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>まだ回答がありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {survey.responses.map((r: any) => (
            <div key={r.id} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.staff_name || r.staff_id}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
              </div>
              {r.ai_summary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{r.ai_summary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
