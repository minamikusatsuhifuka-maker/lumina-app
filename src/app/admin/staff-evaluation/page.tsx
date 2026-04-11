'use client';
import { useState, useEffect } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';

const GRADE_COLORS: Record<string, string> = {
  G1: '#94a3b8', G2: '#60a5fa', G3: '#4ade80', G4: '#06b6d4', G5: '#8b5cf6',
};

export default function StaffEvaluationPage() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [staffName, setStaffName] = useState('');
  const [period, setPeriod] = useState('2026-Q2');
  const [generating, setGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareData, setCompareData] = useState<any[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    fetch('/api/clinic/staff')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaffList(d); });
  }, []);

  useEffect(() => {
    fetch('/api/clinic/staff-evaluation')
      .then(r => r.json())
      .then(d => setEvaluations(Array.isArray(d) ? d : []));
  }, []);

  const generateEvaluation = async () => {
    if (!staffName.trim()) { setMessage('スタッフ名を入力してください'); return; }
    setGenerating(true); setMessage('データを集計中...');
    try {
      const res = await fetch('/api/clinic/staff-evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_name: staffName, period }),
      });
      const data = await res.json();
      setSelected(data); setAiResult(null);
      const updated = await fetch('/api/clinic/staff-evaluation').then(r => r.json());
      setEvaluations(Array.isArray(updated) ? updated : []);
      setMessage('✅ 評価データを集計しました');
      setTimeout(() => setMessage(''), 3000);
    } catch { setMessage('❌ エラーが発生しました'); }
    finally { setGenerating(false); }
  };

  const loadCompareData = async (staffName: string) => {
    if (!staffName) return;
    setCompareLoading(true);
    try {
      const res = await fetch(`/api/clinic/staff-evaluation?staff_name=${encodeURIComponent(staffName)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCompareData(data.sort((a: any, b: any) => a.period.localeCompare(b.period)));
      }
    } catch {}
    setCompareLoading(false);
  };

  const generateAIComment = async () => {
    if (!selected) return;
    setGenerating(true);
    const model = localStorage.getItem('lumina_ai_model') || 'claude';
    try {
      const res = await fetch('/api/clinic/staff-evaluation/ai-comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId: selected.id, staffName: selected.staff_name,
          knowledgeScore: selected.knowledge_score, skillScore: selected.skill_score,
          mindsetScore: selected.mindset_score, totalScore: selected.total_score,
          currentGrade: selected.current_grade, recommendedGrade: selected.recommended_grade,
          mindsetDetails: selected.mindset_details, model,
        }),
      });
      const data = await res.json();
      setAiResult(data);
      setMessage('✅ AI評価コメントを生成しました');
      setTimeout(() => setMessage(''), 3000);
    } catch { setMessage('❌ エラーが発生しました'); }
    finally { setGenerating(false); }
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, background: 'var(--bg-secondary)',
    border: '1px solid var(--border)', borderRadius: 16, marginBottom: 16,
  };

  const radarData = selected ? [
    { subject: '知識', score: Number(selected.knowledge_score) || 0, fullMark: 25 },
    { subject: 'スキル', score: Number(selected.skill_score) || 0, fullMark: 25 },
    { subject: 'マインド', score: Number(selected.mindset_score) || 0, fullMark: 50 },
  ] : [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 80 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>📊 スタッフ評価</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        試験・アンケート・1on1を自動集計 → 等級判定・AI評価コメント
      </p>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.includes('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.includes('✅') ? '#4ade80' : '#ef4444',
        }}>{message}</div>
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔄 評価データを集計</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>スタッフ名</div>
            <select value={staffName} onChange={e => setStaffName(e.target.value)}
              style={{ width: '100%', padding: '9px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 8 }}>
              <option value="">スタッフを選択してください</option>
              {staffList.map(s => (
                <option key={s.id} value={s.name}>{s.name}（{s.position || ''}）</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>評価期間</div>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
              {['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button onClick={generateEvaluation} disabled={generating} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontSize: 13, fontWeight: 700,
          }}>{generating ? '集計中...' : '🔄 データを集計する'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: 16 }}>
        <div>
          {evaluations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              まだ評価データがありません。上のフォームから集計してください。
            </div>
          ) : evaluations.map(ev => {
            const gradeColor = GRADE_COLORS[ev.recommended_grade] || '#94a3b8';
            return (
              <div key={ev.id} onClick={() => { setSelected(ev); setAiResult(null); }} style={{
                ...cardStyle, cursor: 'pointer', marginBottom: 10,
                border: selected?.id === ev.id ? '2px solid #6c63ff' : '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{ev.staff_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ev.period}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: gradeColor }}>{ev.total_score}点</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: gradeColor }}>推奨：{ev.recommended_grade}</div>
                    {ev.bonus_rate > 0 && <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>賞与+{ev.bonus_rate}%</div>}
                    {ev.promotion_approved && <div style={{ fontSize: 10, color: '#4ade80' }}>✅ 昇格承認済み</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {[
                    { label: '知識', score: ev.knowledge_score, max: 25, color: '#3b82f6' },
                    { label: 'スキル', score: ev.skill_score, max: 25, color: '#f59e0b' },
                    { label: 'マインド', score: ev.mindset_score, max: 50, color: '#8b5cf6' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.score}/{s.max}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div style={{ position: 'sticky', top: 20 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.staff_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.period}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>

              <div style={{ width: '100%', minHeight: 200, marginBottom: 16 }}>
                <RadarChart width={320} height={200} data={radarData}>
                  <PolarGrid stroke="rgba(108,99,255,0.2)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 50]} tick={{ fontSize: 9 }} />
                  <Radar dataKey="score" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v: any) => [`${v}点`]} />
                </RadarChart>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={{ padding: 12, textAlign: 'center', background: 'rgba(108,99,255,0.1)', borderRadius: 10 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#6c63ff' }}>{selected.total_score}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>総合スコア / 100点</div>
                </div>
                <div style={{ padding: 12, textAlign: 'center', background: `${GRADE_COLORS[selected.recommended_grade] || '#94a3b8'}15`, borderRadius: 10 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: GRADE_COLORS[selected.recommended_grade] || '#94a3b8' }}>{selected.recommended_grade}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>推奨等級</div>
                </div>
              </div>

              {/* 期間比較ボタン */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button onClick={() => {
                  setCompareMode(!compareMode);
                  if (!compareMode) loadCompareData(selected.staff_name);
                }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: compareMode ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: compareMode ? '#6c63ff' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: compareMode ? 600 : 400 }}>
                  📈 期間比較
                </button>
              </div>

              {/* 期間比較ビュー */}
              {compareMode && (
                <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📈 期間別スコア比較</div>
                  {compareLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>読み込み中...</div>
                  ) : compareData.length < 2 ? (
                    <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>比較には2期以上のデータが必要です</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>期間</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>総合</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>知識</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>スキル</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>マインド</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>推奨等級</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareData.map((ev, i) => {
                            const prev = compareData[i - 1];
                            const diff = prev ? (ev.total_score || 0) - (prev.total_score || 0) : null;
                            return (
                              <tr key={ev.id} style={{ background: ev.id === selected.id ? 'rgba(108,99,255,0.06)' : 'transparent' }}>
                                <td style={{ padding: '8px 10px', fontWeight: ev.id === selected.id ? 700 : 400, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                                  {ev.period}
                                  {ev.id === selected.id && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(108,99,255,0.15)', color: '#6c63ff' }}>現在</span>}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ fontWeight: 700, color: (ev.total_score || 0) >= 80 ? '#4ade80' : (ev.total_score || 0) >= 60 ? '#f59e0b' : '#ef4444' }}>
                                    {ev.total_score || 0}
                                  </span>
                                  {diff !== null && (
                                    <span style={{ marginLeft: 4, fontSize: 10, color: diff > 0 ? '#4ade80' : diff < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                      {diff > 0 ? `+${diff}` : diff}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{ev.knowledge_score || 0}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{ev.skill_score || 0}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{ev.mindset_score || 0}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{ev.recommended_grade || '—'}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 賞与・昇格判定 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>💰 賞与・昇格判定</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: 12, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>現在等級</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: selected.current_grade ? (GRADE_COLORS[selected.current_grade] || '#6c63ff') : 'var(--text-muted)' }}>{selected.current_grade || '未設定'}</div>
                  </div>
                  <div style={{ padding: 12, textAlign: 'center', background: `${GRADE_COLORS[selected.recommended_grade] || '#94a3b8'}15`, border: `1px solid ${GRADE_COLORS[selected.recommended_grade] || '#94a3b8'}40`, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>推奨等級</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: GRADE_COLORS[selected.recommended_grade] || '#94a3b8' }}>{selected.recommended_grade}</div>
                  </div>
                  <div style={{ padding: 12, textAlign: 'center', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>賞与加算率</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>+{selected.bonus_rate || 0}%</div>
                  </div>
                </div>
                {!selected.promotion_approved ? (
                  <button onClick={async () => {
                    if (!confirm(`${selected.staff_name}さんを${selected.recommended_grade}に昇格承認しますか？`)) return;
                    const approveRes = await fetch('/api/clinic/staff-evaluation/approve', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ evaluationId: selected.id, staffName: selected.staff_name, approvedGrade: selected.recommended_grade }),
                    });
                    if (approveRes.ok) {
                      const refreshed = await fetch(`/api/clinic/staff-evaluation?staff_name=${encodeURIComponent(selected.staff_name)}`).then(r => r.json());
                      const latest = Array.isArray(refreshed) ? refreshed.find((e: any) => e.id === selected.id) : null;
                      setSelected((prev: any) => ({ ...prev, promotion_approved: true, approved_grade: selected.recommended_grade, current_grade: latest?.current_grade || selected.recommended_grade }));
                      setEvaluations(prev => prev.map(e => e.id === selected.id ? { ...e, promotion_approved: true, current_grade: latest?.current_grade || selected.recommended_grade } : e));
                      setMessage(`✅ ${selected.staff_name}さんの${selected.recommended_grade}昇格を承認しました`);
                      setTimeout(() => setMessage(''), 4000);
                    }
                  }} style={{
                    width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#fff', fontSize: 13, fontWeight: 700,
                  }}>✅ {selected.recommended_grade}への昇格を承認する</button>
                ) : (
                  <div style={{ padding: '10px 14px', borderRadius: 10, textAlign: 'center', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
                    ✅ {selected.approved_grade}への昇格承認済み
                  </div>
                )}
              </div>

              <button onClick={generateAIComment} disabled={generating} style={{
                width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 16,
              }}>{generating ? '🤖 生成中...' : '🤖 AI評価コメントを生成'}</button>

              {aiResult && (
                <div>
                  <div style={{
                    padding: '8px 14px', borderRadius: 10, marginBottom: 12, textAlign: 'center',
                    background: aiResult.promotion_eligible ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
                    border: `1px solid ${aiResult.promotion_eligible ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    fontSize: 14, fontWeight: 700,
                    color: aiResult.promotion_eligible ? '#4ade80' : '#f59e0b',
                  }}>
                    {aiResult.promotion_eligible ? '✅ 昇格推奨' : '⏳ 継続育成'}
                    {aiResult.promotion_reason && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>{aiResult.promotion_reason}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>💪 強み</div>
                      {Array.isArray(aiResult.strengths) && aiResult.strengths.length > 0 ? (
                        aiResult.strengths.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4, background: 'rgba(74,222,128,0.08)', borderRadius: 6, color: 'var(--text-secondary)' }}>{s}</div>
                        ))
                      ) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>データなし</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>🔥 改善点</div>
                      {Array.isArray(aiResult.improvements) && aiResult.improvements.length > 0 ? (
                        aiResult.improvements.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4, background: 'rgba(245,158,11,0.08)', borderRadius: 6, color: 'var(--text-secondary)' }}>{s}</div>
                        ))
                      ) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>データなし</div>}
                    </div>
                  </div>

                  <div style={{ padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {aiResult.ai_evaluation}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
