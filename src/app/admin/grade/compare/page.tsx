'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const parseJson = (v: any) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };
const parseExam = (v: any) => { if (!v) return null; if (typeof v === 'object' && !Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return null; } };

const ROWS = [
  { key: 'skills', label: '🎯 スキル', type: 'list' },
  { key: 'knowledge', label: '📚 知識', type: 'list' },
  { key: 'mindset', label: '💡 マインド', type: 'list' },
  { key: 'continuous_learning', label: '📖 継続学習', type: 'list' },
  { key: 'required_certifications', label: '🏅 資格', type: 'list' },
  { key: 'promotion_exam', label: '📝 昇格試験', type: 'exam' },
  { key: 'requirements_demotion', label: '⬇️ 降格条件', type: 'text' },
  { key: 'salary', label: '💰 給与レンジ', type: 'salary' },
];

export default function GradeComparePage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisResult, setAnalysisResult] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => { fetch('/api/clinic/grades').then(r => r.json()).then(d => { if (Array.isArray(d)) setGrades(d); setLoading(false); }); }, []);

  const analyzeGaps = async () => {
    setAnalyzing(true); setAnalysisResult('');
    try {
      const res = await fetch('/api/clinic/grades/consult', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `以下の全等級を比較分析し、等級間のギャップ・不整合・改善点を指摘してください。\n\n${JSON.stringify(grades, null, 2)}`, gradeContent: null }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '', buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') { acc += j.content; setAnalysisResult(acc); } } catch {}
        }
      }
    } catch { setAnalysisResult('分析に失敗しました'); }
    finally { setAnalyzing(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📊 等級比較表</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>全等級を横並びで比較</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={analyzeGaps} disabled={analyzing} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {analyzing ? '分析中...' : '📊 AIでギャップ分析'}
          </button>
          <Link href="/admin/grade" style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>← 等級制度に戻る</Link>
        </div>
      </div>

      {analysisResult && (
        <div style={{ padding: 16, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{analysisResult}</div>
      )}

      {grades.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級が登録されていません</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', width: 120, position: 'sticky', left: 0, zIndex: 1 }}></th>
                {grades.map(g => (
                  <th key={g.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'center', color: '#6c63ff', fontWeight: 700, minWidth: 160 }}>
                    Lv.{g.level_number}<br />{g.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.key}>
                  <td style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', left: 0, zIndex: 1 }}>{row.label}</td>
                  {grades.map(g => (
                    <td key={g.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>
                      {row.type === 'list' && parseJson(g[row.key]).map((item: string, i: number) => <div key={i}>• {item}</div>)}
                      {row.type === 'text' && (g[row.key] || '—')}
                      {row.type === 'salary' && (g.salary_min ? `${g.salary_min?.toLocaleString()}〜${g.salary_max?.toLocaleString()}円` : '—')}
                      {row.type === 'exam' && (() => { const e = parseExam(g.promotion_exam); return e ? `${e.format || ''} / ${e.passingCriteria || ''}` : '—'; })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
