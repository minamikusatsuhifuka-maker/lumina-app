'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function GradeComparePage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState('');

  useEffect(() => {
    fetch('/api/clinic/grades')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setGrades(d);
          const firstPos = [...new Set(d.map((g: any) => g.position).filter(Boolean))][0] || '';
          setSelectedPosition(firstPos);
        }
        setLoading(false);
      });
  }, []);

  const positions = [...new Set(grades.map(g => g.position).filter(Boolean))] as string[];
  const filteredGrades = grades
    .filter(g => g.position === selectedPosition)
    .sort((a, b) => a.level_number - b.level_number);

  const parseArr = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v); } catch { return []; }
  };

  const SECTIONS = [
    { key: 'skills',               label: '🎯 スキル',   color: '#f59e0b' },
    { key: 'knowledge',            label: '📚 知識',     color: '#3b82f6' },
    { key: 'mindset',              label: '💎 マインド',  color: '#8b5cf6' },
    { key: 'continuous_learning',  label: '📖 継続学習', color: '#06b6d4' },
    { key: 'demotion_conditions',  label: '⬇️ 降格条件', color: '#ef4444' },
  ];

  const GRADE_COLORS = ['#94a3b8', '#60a5fa', '#4ade80', '#06b6d4', '#8b5cf6'];

  const runGapAnalysis = async () => {
    setAnalyzing(true);
    setGapAnalysis('');
    try {
      const res = await fetch('/api/clinic/ai-dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `${selectedPosition}のG1〜G5等級制度を分析してください。
各等級のスキル・知識・マインドの連続性、ギャップ、改善点を指摘してください。
院長の哲学（ティール組織・先払い・実評価・同心円成長）の観点からも評価してください。

現在のデータ：
${filteredGrades.map(g => `
${g.name}（G${g.level_number}）:
スキル: ${parseArr(g.skills).join('、')}
知識: ${parseArr(g.knowledge).join('、')}
マインド: ${parseArr(g.mindset).join('、')}
`).join('\n')}`,
          }],
          contextType: 'grade',
        }),
      });
      const data = await res.json();
      setGapAnalysis(data.message || '分析に失敗しました');
    } catch {
      setGapAnalysis('エラーが発生しました');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            📊 等級比較表
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>職種ごとに等級を横並びで比較</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={runGapAnalysis}
            disabled={analyzing}
            style={{
              padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}
          >
            {analyzing ? '分析中...' : '🤖 AIでギャップ分析'}
          </button>
          <Link href="/admin/grade" style={{
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-muted)', textDecoration: 'none',
          }}>
            ← 等級制度に戻る
          </Link>
        </div>
      </div>

      {/* 職種タブ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {positions.map(pos => (
          <button
            key={pos}
            onClick={() => { setSelectedPosition(pos); setGapAnalysis(''); }}
            style={{
              padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              background: selectedPosition === pos
                ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                : 'var(--bg-card)',
              color: selectedPosition === pos ? '#fff' : 'var(--text-muted)',
              border: selectedPosition === pos ? 'none' : '1px solid var(--border)',
              boxShadow: selectedPosition === pos ? '0 4px 12px rgba(108,99,255,0.3)' : 'none',
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* AIギャップ分析結果 */}
      {gapAnalysis && (
        <div style={{
          padding: 20, marginBottom: 20,
          background: 'rgba(108,99,255,0.06)',
          border: '1px solid rgba(108,99,255,0.2)',
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>
            🤖 AIギャップ分析結果（{selectedPosition}）
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {gapAnalysis}
          </div>
        </div>
      )}

      {/* 等級ヘッダー行 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{
                width: 100, padding: '12px 8px', fontSize: 12,
                color: 'var(--text-muted)', fontWeight: 600,
                background: 'var(--bg-secondary)', borderRadius: '8px 0 0 0',
              }}>項目</th>
              {filteredGrades.map((g, i) => (
                <th key={g.id} style={{
                  padding: '12px 8px', textAlign: 'center',
                  background: `${GRADE_COLORS[i]}15`,
                  borderLeft: `3px solid ${GRADE_COLORS[i]}`,
                  fontSize: 13,
                }}>
                  <div style={{ fontWeight: 800, color: GRADE_COLORS[i], fontSize: 15 }}>
                    G{g.level_number}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {g.salary_range}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section, si) => (
              <tr key={section.key} style={{ background: si % 2 === 0 ? 'var(--bg-secondary)' : 'transparent' }}>
                <td style={{
                  padding: '16px 8px', fontSize: 12, fontWeight: 700,
                  color: section.color, verticalAlign: 'top',
                  borderTop: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}>
                  {section.label}
                </td>
                {filteredGrades.map((g, i) => {
                  const items = parseArr(g[section.key]);
                  return (
                    <td key={g.id} style={{
                      padding: '12px 10px', verticalAlign: 'top',
                      borderLeft: `3px solid ${GRADE_COLORS[i]}40`,
                      borderTop: '1px solid var(--border)',
                    }}>
                      {items.length > 0 ? (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {items.map((item, j) => (
                            <li key={j} style={{
                              fontSize: 12, color: 'var(--text-secondary)',
                              padding: '3px 0', display: 'flex', gap: 6,
                              alignItems: 'flex-start', lineHeight: 1.5,
                            }}>
                              <span style={{ color: `${section.color}99`, flexShrink: 0, marginTop: 2 }}>•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>未設定</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
