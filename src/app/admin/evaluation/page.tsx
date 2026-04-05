'use client';
import { useState, useEffect } from 'react';

export default function EvaluationPage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<any>(null);
  const [criteria, setCriteria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState('');

  // AIと修正
  const [refineIdx, setRefineIdx] = useState<number | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refining, setRefining] = useState(false);

  // 展開
  const [expandedCat, setExpandedCat] = useState<number | null>(null);

  useEffect(() => { fetch('/api/clinic/grades').then(r => r.json()).then(d => { if (Array.isArray(d)) { setGrades(d); if (d.length > 0) setSelectedGrade(d[0]); } setLoading(false); }); }, []);

  useEffect(() => {
    if (!selectedGrade) return;
    fetch(`/api/clinic/evaluation-criteria?gradeId=${selectedGrade.id}`).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) {
        try { setCriteria({ ...d[0], categories: typeof d[0].categories === 'string' ? JSON.parse(d[0].categories) : d[0].categories }); } catch { setCriteria(d[0]); }
      } else { setCriteria(null); }
    });
  }, [selectedGrade]);

  const generateCriteria = async () => {
    if (!selectedGrade) return;
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/evaluation-criteria/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeId: selectedGrade.id }) });
      const data = await res.json();
      if (data.categories) setPreview(data);
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const savePreview = async () => {
    if (!preview || !selectedGrade) return;
    setSaving(true);
    try {
      await fetch('/api/clinic/evaluation-criteria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeId: selectedGrade.id, categories: JSON.stringify(preview.categories) }) });
      setCriteria({ categories: preview.categories }); setPreview(null); setMessage('保存しました');
    } finally { setSaving(false); }
  };

  const refineCriteria = async () => {
    if (!refineInstruction.trim() || !criteria) return;
    setRefining(true);
    try {
      const res = await fetch('/api/clinic/evaluation-criteria/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteriaId: criteria.id, instruction: refineInstruction, currentContent: JSON.stringify(criteria.categories) }) });
      const data = await res.json();
      if (data.categories) { setCriteria({ ...criteria, categories: data.categories }); setRefineInstruction(''); setRefineIdx(null); setMessage('修正を適用しました'); }
      else setMessage(data.error || '修正に失敗しました');
    } catch { setMessage('修正に失敗しました'); }
    finally { setRefining(false); }
  };

  const exportPdf = () => {
    if (!criteria?.categories || !selectedGrade) return;
    const cats = Array.isArray(criteria.categories) ? criteria.categories : [];
    let text = `評価シート: ${selectedGrade.name}\n${'='.repeat(40)}\n\n`;
    for (const cat of cats) {
      text += `【${cat.name}（${cat.weight}%）】\n`;
      for (const c of cat.criteria || []) {
        text += `\n  ■ ${c.name}\n    ${c.description}\n`;
        if (c.indicators) { for (const [k, v] of Object.entries(c.indicators)) { text += `    ${k}点: ${v}\n`; } }
      }
      text += '\n';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `評価シート_${selectedGrade.name}.txt`;
    a.click();
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const cats = criteria?.categories ? (Array.isArray(criteria.categories) ? criteria.categories : []) : [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📋 評価制度</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>等級別の評価シートをAIで生成・対話修正</p>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* 等級セレクター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {grades.map(g => (
          <button key={g.id} onClick={() => setSelectedGrade(g)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: selectedGrade?.id === g.id ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-card)',
            color: selectedGrade?.id === g.id ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${selectedGrade?.id === g.id ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>Lv.{g.level_number} {g.name}</button>
        ))}
      </div>

      {grades.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>先に等級制度を登録してください（🏅 等級制度ページ）</div>}

      {selectedGrade && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={generateCriteria} disabled={generating} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {generating ? '生成中...' : '🤖 この等級の評価シートをAI生成'}
          </button>
          {cats.length > 0 && <button onClick={exportPdf} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>📄 評価シートを出力</button>}
        </div>
      )}

      {/* プレビュー */}
      {preview && (
        <div style={{ padding: 16, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>生成結果プレビュー</h3>
          {(preview.categories || []).map((cat: any, i: number) => (
            <div key={i} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{cat.name}（{cat.weight}%）</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(cat.criteria || []).length}項目</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={savePreview} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '採用する'}</button>
            <button onClick={() => setPreview(null)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
          </div>
        </div>
      )}

      {/* 評価シート表示 */}
      {cats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cats.map((cat: any, ci: number) => (
            <div key={ci} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div onClick={() => setExpandedCat(expandedCat === ci ? null : ci)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{expandedCat === ci ? '▼' : '▶'} {cat.name}（{cat.weight}%）</div>
                <button onClick={e => { e.stopPropagation(); setRefineIdx(refineIdx === ci ? null : ci); }} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontSize: 11, cursor: 'pointer' }}>🤖 AIと修正</button>
              </div>

              {refineIdx === ci && (
                <div style={{ padding: '0 18px 12px', display: 'flex', gap: 8 }}>
                  <input value={refineInstruction} onChange={e => setRefineInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); refineCriteria(); } }} placeholder="例：3点の基準をもっと具体的にして" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={refineCriteria} disabled={refining} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: refining ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{refining ? '修正中...' : '送信'}</button>
                </div>
              )}

              {expandedCat === ci && (
                <div style={{ padding: '0 18px 16px' }}>
                  {(cat.criteria || []).map((c: any, idx: number) => (
                    <div key={idx} style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.description}</div>
                      {c.indicators && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {Object.entries(c.indicators).sort(([a], [b]) => Number(b) - Number(a)).map(([k, v]) => (
                            <div key={k} style={{ fontSize: 11, display: 'flex', gap: 6 }}>
                              <span style={{ fontWeight: 700, color: Number(k) >= 4 ? '#4ade80' : Number(k) >= 3 ? 'var(--text-muted)' : '#ef4444', width: 30, flexShrink: 0 }}>{k}点</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{v as string}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
