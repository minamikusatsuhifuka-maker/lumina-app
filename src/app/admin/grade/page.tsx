'use client';
import { useState, useEffect } from 'react';

export default function GradePage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenModal, setShowGenModal] = useState(false);
  const [positions, setPositions] = useState('看護師・受付・歯科助手');
  const [count, setCount] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // AIと修正
  const [refineId, setRefineId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refineResult, setRefineResult] = useState<any>(null);
  const [refining, setRefining] = useState(false);
  const [refineHistory, setRefineHistory] = useState<{ instruction: string; result: any }[]>([]);

  // 展開
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchGrades = () => { fetch('/api/clinic/grades').then(r => r.json()).then(d => { if (Array.isArray(d)) setGrades(d); setLoading(false); }); };
  useEffect(() => { fetchGrades(); }, []);

  const generateAll = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/grades/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions, count: parseInt(count) }) });
      const data = await res.json();
      if (data.grades) setGenPreview(data);
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const saveGenerated = async () => {
    if (!genPreview?.grades) return;
    setSaving(true);
    for (const g of genPreview.grades) {
      await fetch('/api/clinic/grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g) });
    }
    setShowGenModal(false); setGenPreview(null); fetchGrades(); setSaving(false);
  };

  const refineGrade = async (grade: any) => {
    if (!refineInstruction.trim()) return;
    setRefining(true);
    try {
      const res = await fetch('/api/clinic/grades/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeId: grade.id, instruction: refineInstruction, currentContent: JSON.stringify(grade) }) });
      const data = await res.json();
      if (data.name) {
        setRefineResult(data);
        setRefineHistory(prev => [...prev, { instruction: refineInstruction, result: data }]);
        setRefineInstruction('');
      } else setMessage(data.error || '修正に失敗しました');
    } catch { setMessage('修正に失敗しました'); }
    finally { setRefining(false); }
  };

  const applyRefine = async (grade: any) => {
    if (!refineResult) return;
    await fetch(`/api/clinic/grades/${grade.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refineResult) });
    setRefineId(null); setRefineResult(null); setRefineHistory([]); fetchGrades();
  };

  const deleteGrade = async (id: string) => {
    if (!confirm('この等級を削除しますか？')) return;
    await fetch(`/api/clinic/grades/${id}`, { method: 'DELETE' });
    fetchGrades();
  };

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🏅 等級制度</h1>
        <button onClick={() => setShowGenModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🤖 AIで等級制度を一括生成</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>理念に基づいた等級制度をAIと一緒に構築・調整</p>

      {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : grades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🏅</div><div>等級が登録されていません</div><div style={{ fontSize: 13, marginTop: 8 }}>「AIで等級制度を一括生成」から始めましょう</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grades.map(g => (
            <div key={g.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'rgba(108,99,255,0.15)', color: '#6c63ff' }}>Lv.{g.level_number}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{g.description?.slice(0, 150)}</div>
                  {(g.salary_min || g.salary_max) && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>💰 {g.salary_min?.toLocaleString()}〜{g.salary_max?.toLocaleString()}円</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setExpandedId(expandedId === g.id ? null : g.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>詳細</button>
                  <button onClick={() => { setRefineId(refineId === g.id ? null : g.id); setRefineResult(null); setRefineHistory([]); }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontSize: 11, cursor: 'pointer' }}>🤖 AIと修正</button>
                  <button onClick={() => deleteGrade(g.id)} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>

              {expandedId === g.id && (
                <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div style={{ marginBottom: 8 }}><strong>📈 昇格条件:</strong><div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{g.requirements_promotion || '未設定'}</div></div>
                  <div><strong>📉 降格条件:</strong><div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{g.requirements_demotion || '未設定'}</div></div>
                </div>
              )}

              {refineId === g.id && (
                <div style={{ marginTop: 14, padding: 14, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 8 }}>🤖 AIと対話して修正</div>
                  {refineHistory.map((h, i) => (
                    <div key={i} style={{ marginBottom: 8, fontSize: 12 }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>あなた: {h.instruction}</div>
                      <div style={{ color: 'var(--text-secondary)', padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}>{h.result.changeLog || '修正完了'}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={refineInstruction} onChange={e => setRefineInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); refineGrade(g); } }} placeholder="例：昇格条件に患者満足度4.0以上を追加して" style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => refineGrade(g)} disabled={refining} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: refining ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{refining ? '修正中...' : '送信'}</button>
                  </div>
                  {refineResult && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        <div><strong>{refineResult.name}</strong></div>
                        <div style={{ marginTop: 4 }}>{refineResult.description?.slice(0, 200)}</div>
                      </div>
                      <button onClick={() => applyRefine(g)} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>この内容で更新</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI一括生成モーダル */}
      {showGenModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 等級制度を一括生成</h2>
              <button onClick={() => { setShowGenModal(false); setGenPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {!genPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>職種</label><input value={positions} onChange={e => setPositions(e.target.value)} style={inputStyle} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>等級数</label>
                  <select value={count} onChange={e => setCount(e.target.value)} style={inputStyle}>{[3,4,5,6,7].map(n => <option key={n} value={n}>{n}段階</option>)}</select></div>
                <button onClick={generateAll} disabled={generating} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{generating ? '生成中...' : '🤖 生成する'}</button>
              </div>
            ) : (
              <div>
                {genPreview.designComment && <div style={{ padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>{genPreview.designComment}</div>}
                {genPreview.grades.map((g: any, i: number) => (
                  <div key={i} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Lv.{g.levelNumber} {g.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{g.description?.slice(0, 150)}</div>
                    {g.salaryMin && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>💰 {g.salaryMin?.toLocaleString()}〜{g.salaryMax?.toLocaleString()}円</div>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={saveGenerated} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : 'この等級制度を採用する'}</button>
                  <button onClick={() => setGenPreview(null)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
