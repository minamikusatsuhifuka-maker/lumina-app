'use client';
import { useState, useEffect } from 'react';
import { ModelBadge } from '@/components/ModelBadge';

type DetailTab = 'overview' | 'skills' | 'knowledge' | 'mindset' | 'learning' | 'certs' | 'exam' | 'demotion';

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: '📋 概要' }, { key: 'skills', label: '🎯 スキル' },
  { key: 'knowledge', label: '📚 知識' }, { key: 'mindset', label: '💡 マインド' },
  { key: 'learning', label: '📖 継続学習' }, { key: 'certs', label: '🏅 資格' },
  { key: 'exam', label: '📝 昇格試験' }, { key: 'demotion', label: '⬇️ 降格条件' },
];

const QUICK = ['もっと具体的に', '理念に沿って', '業界標準を参考に', '追加提案して'];
const parseJson = (v: any) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };

export default function GradePage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [message, setMessage] = useState('');

  // 一括生成
  const [showGenModal, setShowGenModal] = useState(false);
  const [genPositions, setGenPositions] = useState('看護師');
  const [genRole, setGenRole] = useState('一般〜管理職');
  const [genCount, setGenCount] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // カテゴリ修正
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refineResult, setRefineResult] = useState<any>(null);
  const [refining, setRefining] = useState(false);

  // AIコンサルタント
  const [consultMsg, setConsultMsg] = useState('');
  const [consultResult, setConsultResult] = useState('');
  const [consulting, setConsulting] = useState(false);
  const [consultHistory, setConsultHistory] = useState<{ msg: string; res: string }[]>([]);

  const fetchGrades = () => { fetch('/api/clinic/grades').then(r => r.json()).then(d => { if (Array.isArray(d)) setGrades(d); setLoading(false); }); };
  useEffect(() => { fetchGrades(); }, []);

  const selected = grades.find(g => g.id === selectedId);

  const generateAll = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/grades/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions: genPositions, count: parseInt(genCount), role: genRole }) });
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
      await fetch('/api/clinic/grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: g.name, levelNumber: g.levelNumber, description: g.description,
        requirementsPromotion: g.requirementsPromotion, requirementsDemotion: g.requirementsDemotion,
        salaryMin: g.salaryMin, salaryMax: g.salaryMax, position: g.position, role: g.role,
        skills: JSON.stringify(g.skills || []), knowledge: JSON.stringify(g.knowledge || []),
        mindset: JSON.stringify(g.mindset || []), continuousLearning: JSON.stringify(g.continuousLearning || []),
        requiredCertifications: JSON.stringify(g.requiredCertifications || []),
        promotionExam: JSON.stringify(g.promotionExam || {}),
      }) });
    }
    setShowGenModal(false); setGenPreview(null); fetchGrades(); setSaving(false);
  };

  const refineCategory = async () => {
    if (!refineInstruction.trim() || !selected) return;
    setRefining(true);
    const catMap: Record<string, string> = { skills: 'skills', knowledge: 'knowledge', mindset: 'mindset', learning: 'continuousLearning', certs: 'requiredCertifications', exam: 'promotionExam', demotion: 'requirementsDemotion', overview: 'all' };
    try {
      const res = await fetch('/api/clinic/grades/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeId: selected.id, instruction: refineInstruction, currentContent: selected, category: catMap[detailTab] || 'all' }) });
      const data = await res.json();
      if (data.changeLog || data.name) { setRefineResult(data); setRefineInstruction(''); }
      else setMessage(data.error || '修正に失敗しました');
    } catch { setMessage('修正に失敗しました'); }
    finally { setRefining(false); }
  };

  const applyRefine = async () => {
    if (!refineResult || !selected) return;
    await fetch(`/api/clinic/grades/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: refineResult.name, description: refineResult.description,
      requirementsPromotion: refineResult.requirementsPromotion, requirementsDemotion: refineResult.requirementsDemotion,
      salaryMin: refineResult.salaryMin, salaryMax: refineResult.salaryMax,
      skills: JSON.stringify(refineResult.skills || []), knowledge: JSON.stringify(refineResult.knowledge || []),
      mindset: JSON.stringify(refineResult.mindset || []), continuousLearning: JSON.stringify(refineResult.continuousLearning || []),
      requiredCertifications: JSON.stringify(refineResult.requiredCertifications || []),
      promotionExam: JSON.stringify(refineResult.promotionExam || {}),
    }) });
    setRefineResult(null); fetchGrades();
  };

  const runConsult = async () => {
    if (!consultMsg.trim()) return;
    setConsulting(true); setConsultResult('');
    try {
      const res = await fetch('/api/clinic/grades/consult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: consultMsg, gradeContent: selected }) });
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
          try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') { acc += j.content; setConsultResult(acc); } } catch {}
        }
      }
      setConsultHistory(prev => [...prev, { msg: consultMsg, res: acc }]);
      setConsultMsg('');
    } catch { setMessage('相談に失敗しました'); }
    finally { setConsulting(false); }
  };

  const deleteGrade = async (id: string) => { if (!confirm('削除しますか？')) return; await fetch(`/api/clinic/grades/${id}`, { method: 'DELETE' }); if (selectedId === id) setSelectedId(null); fetchGrades(); };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  const renderList = (items: any[], label: string) => (
    <div>
      {items.length > 0 ? items.map((item, i) => <div key={i} style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>• {typeof item === 'string' ? item : JSON.stringify(item)}</div>) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>未設定</div>}
    </div>
  );

  const renderExam = (exam: any) => {
    if (!exam || typeof exam === 'string') { try { exam = JSON.parse(exam); } catch { return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>未設定</div>; } }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        {exam.description && <div><strong>概要:</strong> {exam.description}</div>}
        {exam.format && <div><strong>形式:</strong> {exam.format}</div>}
        {exam.passingCriteria && <div><strong>合格基準:</strong> {exam.passingCriteria}</div>}
        {exam.examContent && <div><strong>内容:</strong>{exam.examContent.map((c: string, i: number) => <div key={i} style={{ paddingLeft: 12 }}>• {c}</div>)}</div>}
        {exam.recommendedPreparation && <div><strong>対策:</strong> {exam.recommendedPreparation}</div>}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
      {/* メインエリア */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🏅 等級制度</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/admin/grade/compare" style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>📊 比較表</a>
            <button onClick={() => setShowGenModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🤖 AIで一括生成</button>
          </div>
        </div>

        {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

        {/* 等級一覧 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {grades.map(g => (
            <button key={g.id} onClick={() => { setSelectedId(g.id); setRefineResult(null); setDetailTab('overview'); }} style={{
              padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
              background: selectedId === g.id ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-secondary)',
              border: `1px solid ${selectedId === g.id ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
              color: selectedId === g.id ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            }}>
              <div>Lv.{g.level_number}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{g.name}</div>
            </button>
          ))}
        </div>

        {/* 等級詳細 */}
        {selected && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Lv.{selected.level_number} {selected.name}</div>
              <button onClick={() => deleteGrade(selected.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>🗑</button>
            </div>

            {/* 8タブ */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
              {DETAIL_TABS.map(t => (
                <button key={t.key} onClick={() => { setDetailTab(t.key); setRefineResult(null); }} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: detailTab === t.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
                  color: detailTab === t.key ? '#6c63ff' : 'var(--text-muted)',
                  border: `1px solid ${detailTab === t.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
                }}>{t.label}</button>
              ))}
            </div>

            {/* タブ内容 */}
            <div style={{ marginBottom: 16 }}>
              {detailTab === 'overview' && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.description || '未設定'}{selected.salary_min ? `\n\n💰 給与: ${selected.salary_min?.toLocaleString()}〜${selected.salary_max?.toLocaleString()}円` : ''}{selected.requirements_promotion ? `\n\n📈 昇格条件:\n${selected.requirements_promotion}` : ''}</div>}
              {detailTab === 'skills' && renderList(parseJson(selected.skills), 'スキル')}
              {detailTab === 'knowledge' && renderList(parseJson(selected.knowledge), '知識')}
              {detailTab === 'mindset' && renderList(parseJson(selected.mindset), 'マインド')}
              {detailTab === 'learning' && renderList(parseJson(selected.continuous_learning), '継続学習')}
              {detailTab === 'certs' && renderList(parseJson(selected.required_certifications), '資格')}
              {detailTab === 'exam' && renderExam(selected.promotion_exam)}
              {detailTab === 'demotion' && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.requirements_demotion || '未設定'}</div>}
            </div>

            {/* AI修正エリア */}
            <div style={{ padding: 14, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 8 }}>🤖 AIと相談・修正</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {QUICK.map(q => <button key={q} onClick={() => setRefineInstruction(q)} style={{ padding: '3px 8px', borderRadius: 14, border: '1px solid rgba(108,99,255,0.2)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>{q}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={refineInstruction} onChange={e => setRefineInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); refineCategory(); } }} placeholder={`${DETAIL_TABS.find(t => t.key === detailTab)?.label}を改善する指示を入力`} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={refineCategory} disabled={refining} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: refining ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{refining ? '修正中...' : '🤖 改善'}</button>
              </div>
              {refineResult && (
                <div style={{ marginTop: 10 }}>
                  {refineResult.changeLog && <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 6 }}>変更: {refineResult.changeLog}</div>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={applyRefine} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✅ 反映する</button>
                    <button onClick={() => setRefineResult(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>↩️ キャンセル</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!selected && grades.length > 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級を選択してください</div>}
        {grades.length === 0 && !loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🏅</div><div>等級が登録されていません</div><div style={{ fontSize: 13, marginTop: 8 }}>「AIで一括生成」から始めましょう</div></div>}
      </div>

      {/* 右サイドパネル: AIコンサルタント */}
      <div style={{ width: 300, flexShrink: 0, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', position: 'sticky', top: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>🤖 等級設計AIコンサルタント</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {consultHistory.map((h, i) => (
            <div key={i}>
              <div style={{ padding: '6px 10px', background: 'rgba(108,99,255,0.1)', borderRadius: '10px 10px 2px 10px', fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{h.msg}</div>
              <div style={{ padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px 10px 10px 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{h.res}</div>
            </div>
          ))}
          {consultResult && !consultHistory.find(h => h.res === consultResult) && (
            <div style={{ padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{consultResult}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={consultMsg} onChange={e => setConsultMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runConsult(); } }} placeholder="質問を入力..." style={{ flex: 1, padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
          <button onClick={runConsult} disabled={consulting} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: consulting ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>{consulting ? '...' : '送信'}</button>
        </div>
      </div>

      {/* 一括生成モーダル */}
      {showGenModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 等級制度を一括生成</h2>
              <button onClick={() => { setShowGenModal(false); setGenPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {!genPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>職種</label>
                  <select value={genPositions} onChange={e => setGenPositions(e.target.value)} style={inputStyle}>
                    <option>看護師</option><option>受付</option><option>歯科助手</option><option>技工士</option><option>医療事務</option>
                  </select></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>役割区分</label><input value={genRole} onChange={e => setGenRole(e.target.value)} style={inputStyle} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>等級数</label>
                  <select value={genCount} onChange={e => setGenCount(e.target.value)} style={inputStyle}>{[3,4,5,6,7].map(n => <option key={n} value={n}>{n}段階</option>)}</select></div>
                <button onClick={generateAll} disabled={generating} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{generating ? '生成中（1〜2分）...' : '🤖 生成する'}</button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}><ModelBadge model="claude" size="md" /></div>
                {genPreview.designComment && <div style={{ padding: 12, background: 'rgba(108,99,255,0.05)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>{genPreview.designComment}</div>}
                {genPreview.grades.map((g: any, i: number) => (
                  <div key={i} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Lv.{g.levelNumber} {g.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{g.description?.slice(0, 100)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>スキル{g.skills?.length || 0}件 / 知識{g.knowledge?.length || 0}件 / 資格{g.requiredCertifications?.length || 0}件</div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={saveGenerated} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : 'この等級制度を採用する'}</button>
                  <button onClick={() => setGenPreview(null)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
