'use client';
import { useState, useEffect } from 'react';
import { ModelBadge } from '@/components/ModelBadge';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';
import { AITextReviser } from '@/components/clinic/AITextReviser';
import { AIBrushupChat } from '@/components/clinic/AIBrushupChat';

type DetailTab = 'overview' | 'skills' | 'knowledge' | 'mindset' | 'learning' | 'certs' | 'exam' | 'demotion';

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: '📋 概要' }, { key: 'skills', label: '🎯 スキル' },
  { key: 'knowledge', label: '📚 知識' }, { key: 'mindset', label: '💡 マインド' },
  { key: 'learning', label: '📖 継続学習' }, { key: 'certs', label: '🏅 資格' },
  { key: 'exam', label: '📝 昇格試験' }, { key: 'demotion', label: '⬇️ 降格条件' },
];

const QUICK = ['もっと具体的に', '理念に沿って', '業界標準を参考に', '追加提案して'];

const CIRCLE_MISSIONS: Record<number, { icon: string; mission: string }> = {
  1: { icon: '🌱', mission: 'まず自分自身を整え、基本を身につける。自分という土台を固める期間。' },
  2: { icon: '🌿', mission: 'チームメンバーの力になれる存在へ。身近な仲間を豊かにする。' },
  3: { icon: '🌳', mission: 'クリニック全体を豊かにする専門家。自分の得意でチームを引き上げる。' },
  4: { icon: '🌏', mission: '患者さんの人生に本質的に貢献するパートナー。数字と人生の両方に責任を持つ。' },
  5: { icon: '🌟', mission: 'クリニックの価値を地域・業界に届ける大使。先払いを体現し、外の世界へ影響を与える。' },
  6: { icon: '✨', mission: '業界全体をリードし、次世代の仕組みを創る存在。' },
};
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

  const [selectedPosition, setSelectedPosition] = useState('');

  // 等級制度説明文
  const [gradeSystemDesc, setGradeSystemDesc] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggested, setAiSuggested] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  const fetchGrades = () => { fetch('/api/clinic/grades').then(r => r.json()).then(d => { if (Array.isArray(d)) { setGrades(d); if (!selectedPosition && d.length > 0) setSelectedPosition(d[0].position || ''); } setLoading(false); }); };
  useEffect(() => { fetchGrades(); }, []);
  useEffect(() => {
    fetch('/api/clinic/evaluation-framework').then(r => r.json()).then(d => {
      if (d.grade_system_description) { setGradeSystemDesc(d.grade_system_description); setDescInput(d.grade_system_description); }
    }).catch(() => {});
  }, []);

  const saveDesc = async () => {
    setSavingDesc(true);
    try {
      await fetch('/api/clinic/evaluation-framework', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade_system_description: descInput }) });
      setGradeSystemDesc(descInput); setEditingDesc(false); setAiSuggested('');
    } finally { setSavingDesc(false); }
  };

  const getAiSuggestion = async () => {
    setAiSuggesting(true); setAiSuggested('');
    try {
      const res = await fetch('/api/clinic/grade/description-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentText: descInput, instruction: aiInstruction }) });
      const data = await res.json();
      setAiSuggested(data.suggested || '');
    } finally { setAiSuggesting(false); }
  };

  const positions = [...new Set(grades.map(g => g.position).filter(Boolean))] as string[];
  const filteredGrades = selectedPosition ? grades.filter(g => g.position === selectedPosition) : grades;
  const selected = grades.find(g => g.id === selectedId);

  const generateAll = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/grades/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions: genPositions, count: parseInt(genCount), role: genRole }) });
      const data = await res.json();
      if (data.success && data.grades) {
        // APIがDB保存済み → プレビュー表示
        setGenPreview(data);
      } else if (data.grades) {
        setGenPreview(data);
      } else {
        setMessage(data.error || '生成に失敗しました');
      }
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const saveGenerated = async () => {
    // 新APIはDB保存済みなので、モーダルを閉じてリロードするだけ
    setShowGenModal(false); setGenPreview(null); fetchGrades();
    setMessage('等級制度を保存しました');
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
    if (!exam) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>未設定</div>;
    if (typeof exam === 'string') { try { exam = JSON.parse(exam); } catch { return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>未設定</div>; } }
    if (!exam || typeof exam !== 'object') return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>未設定</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        {exam.description && <div><strong>概要:</strong> {exam.description}</div>}
        {exam.format && <div><strong>形式:</strong> {exam.format}</div>}
        {exam.passingCriteria && <div><strong>合格基準:</strong> {exam.passingCriteria}</div>}
        {Array.isArray(exam.examContent) && exam.examContent.length > 0 && <div><strong>内容:</strong>{exam.examContent.map((c: string, i: number) => <div key={i} style={{ paddingLeft: 12 }}>• {c}</div>)}</div>}
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

        {message && <div style={{ padding: 10, background: message.includes('失敗') || message.includes('エラー') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') || message.includes('エラー') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

        {/* 職種切り替えタブ */}
        {positions.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {positions.map(pos => (
              <button key={pos} onClick={() => { setSelectedPosition(pos); setSelectedId(null); }} style={{
                padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                background: selectedPosition === pos ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
                color: selectedPosition === pos ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${selectedPosition === pos ? 'transparent' : 'var(--border)'}`,
              }}>{pos}</button>
            ))}
          </div>
        )}

        {/* 当院の等級制度について（編集+AI提案対応） */}
        <div style={{ marginBottom: 20, padding: 20, borderRadius: 16, background: 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(6,182,212,0.05))', border: '1px solid rgba(74,222,128,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>🌿 当院の等級制度について</div>
            {!editingDesc && (
              <button onClick={() => { setEditingDesc(true); setDescInput(gradeSystemDesc || 'この等級はピラミッドの「上下」ではなく、同心円の「広がり」を表しています。G4・G5は「偉い人」ではなく「育成や社会貢献に関わる人」。働き方・関わり方が異なるだけです。全員がアンバサダー（G5）を目指して自律的に成長することが目標です。'); setAiSuggested(''); }}
                style={{ fontSize: 12, color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}>✏️ 編集</button>
            )}
          </div>

          {editingDesc ? (
            <div>
              <textarea value={descInput} onChange={e => setDescInput(e.target.value)} rows={4}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              <AITextReviser
                text={descInput}
                onRevised={(revised) => setDescInput(revised)}
                defaultPurpose="teal"
                purposes={['teal', 'philosophy', 'warm', 'simple']}
                compact={true}
              />

              {/* AI提案エリア */}
              <div style={{ marginTop: 12, padding: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>🤖 AIに改善してもらう</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                    placeholder="指示（例：もっとスタッフに寄り添った言葉で / ティール組織の概念を加えて）"
                    style={{ flex: 1, padding: '7px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                  <button onClick={getAiSuggestion} disabled={aiSuggesting}
                    style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: aiSuggesting ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {aiSuggesting ? '生成中...' : '🤖 提案'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {['ティール組織の概念を加えて', '先払い哲学を反映させて', 'もっとシンプルに', '同心円の広がりをわかりやすく', 'スタッフが読んで勇気が出る文章に'].map(hint => (
                    <button key={hint} onClick={() => setAiInstruction(hint)}
                      style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)', color: '#6c63ff', cursor: 'pointer' }}>
                      {hint}
                    </button>
                  ))}
                </div>
                {aiSuggested && (
                  <div style={{ padding: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginBottom: 6 }}>✨ AIの提案：</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{aiSuggested}</div>
                    <button onClick={() => setDescInput(aiSuggested)}
                      style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ✅ この提案を採用する
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={saveDesc} disabled={savingDesc}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4ade80', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                  {savingDesc ? '保存中...' : '💾 保存'}
                </button>
                <button onClick={() => { setEditingDesc(false); setDescInput(gradeSystemDesc); setAiSuggested(''); setAiInstruction(''); }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {gradeSystemDesc || 'この等級はピラミッドの「上下」ではなく、同心円の「広がり」を表しています。G4・G5は「偉い人」ではなく「育成や社会貢献に関わる人」。働き方・関わり方が異なるだけです。全員がアンバサダー（G5）を目指して自律的に成長することが目標です。'}
            </div>
          )}
        </div>

        {/* ティール組織ビジョンバナー */}
        <div style={{
          padding: 20, marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.06))',
          border: '1px solid rgba(6,182,212,0.25)',
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 12 }}>🩵 私たちが目指す組織の姿</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { color: '#ef4444', label: '🔴 レッド',  desc: '力・恐怖',   dim: true, current: false },
              { color: '#f97316', label: '🟠 アンバー', desc: 'ルール・階層', dim: true, current: false },
              { color: '#eab308', label: '🟡 オレンジ', desc: '目標・競争',  dim: true, current: false },
              { color: '#4ade80', label: '🟢 グリーン', desc: '関係・合意',  dim: false, current: false },
              { color: '#06b6d4', label: '🩵 ティール', desc: '自律・全体性', dim: false, current: true },
            ].map(stage => (
              <div key={stage.label} style={{
                flex: 1, minWidth: 100, padding: '8px 10px',
                background: stage.current ? `${stage.color}20` : `${stage.color}08`,
                border: `1px solid ${stage.current ? stage.color + '60' : stage.color + '20'}`,
                borderRadius: 10, textAlign: 'center',
                opacity: stage.dim ? 0.45 : 1,
                transform: stage.current ? 'scale(1.05)' : 'none',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stage.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{stage.desc}</div>
                {stage.current && <div style={{ fontSize: 9, color: stage.color, marginTop: 3, fontWeight: 700 }}>← 目指す姿</div>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            全員がリーダー。誰かに言われなくても最善の行動を選択できる組織。<br/>
            G1→G5は「ティール度の成長」であり、影響の輪（同心円）の広がり。
          </div>
        </div>

        {/* 同心円ビジュアル（SVG） */}
        {filteredGrades.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <svg width="340" height="340" viewBox="0 0 340 340">
              {[
                { level: 5, label: 'G5 アンバサダー', sub: '広げる・創る', r: 165, color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)' },
                { level: 4, label: 'G4 パートナー', sub: '引き出す・支える', r: 128, color: '#06b6d4', bg: 'rgba(6,182,212,0.06)' },
                { level: 3, label: 'G3 エキスパート', sub: '魅せる・高める', r: 95, color: '#4ade80', bg: 'rgba(74,222,128,0.06)' },
                { level: 2, label: 'G2 コア', sub: '自走する・貢献する', r: 65, color: '#60a5fa', bg: 'rgba(96,165,250,0.06)' },
                { level: 1, label: 'G1 ルーキー', sub: '学ぶ・吸収する', r: 38, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
              ].map(ring => (
                <g key={ring.level}>
                  <circle cx="170" cy="170" r={ring.r} fill={ring.bg} stroke={ring.color} strokeOpacity="0.3" strokeWidth="2" />
                  {ring.level >= 2 && (
                    <>
                      <text x="170" y={170 - ring.r + 16} textAnchor="middle" fontSize="10" fontWeight="bold" fill={ring.color}>{ring.label}</text>
                      <text x="170" y={170 - ring.r + 28} textAnchor="middle" fontSize="8" fill={ring.color} opacity="0.7">{ring.sub}</text>
                    </>
                  )}
                  {ring.level === 1 && (
                    <>
                      <text x="170" y="167" textAnchor="middle" fontSize="11" fontWeight="bold" fill={ring.color}>G1</text>
                      <text x="170" y="180" textAnchor="middle" fontSize="8" fill={ring.color}>ルーキー</text>
                    </>
                  )}
                </g>
              ))}
            </svg>
          </div>
        )}

        {/* 等級一覧 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {filteredGrades.map(g => (
            <button key={g.id} onClick={() => { setSelectedId(g.id); setRefineResult(null); setDetailTab('overview'); }} style={{
              padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
              background: selectedId === g.id ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-secondary)',
              border: `1px solid ${selectedId === g.id ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
              color: selectedId === g.id ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>G{g.level_number}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{g.name}</div>
              {positions.length <= 1 && g.position && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{g.position}</div>}
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

            {/* 同心円ミッション */}
            {CIRCLE_MISSIONS[selected.level_number] && (
              <div style={{
                padding: 14, marginBottom: 14,
                background: `${['','#94a3b8','#60a5fa','#4ade80','#06b6d4','#8b5cf6','#a78bfa'][selected.level_number] || '#6c63ff'}10`,
                border: `1px solid ${['','#94a3b8','#60a5fa','#4ade80','#06b6d4','#8b5cf6','#a78bfa'][selected.level_number] || '#6c63ff'}30`,
                borderRadius: 12, display: 'flex', gap: 14, alignItems: 'center',
              }}>
                <div style={{ fontSize: 32 }}>{CIRCLE_MISSIONS[selected.level_number].icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ['','#94a3b8','#60a5fa','#4ade80','#06b6d4','#8b5cf6','#a78bfa'][selected.level_number] || '#6c63ff' }}>
                    {selected.name}の同心円ミッション
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
                    {CIRCLE_MISSIONS[selected.level_number].mission}
                  </div>
                </div>
              </div>
            )}

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
                <input value={refineInstruction} onChange={e => setRefineInstruction(e.target.value)} placeholder={`${DETAIL_TABS.find(t => t.key === detailTab)?.label}を改善する指示を入力`} style={{ ...inputStyle, flex: 1 }} />
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
      <AIDialogueButton contextType="grade" contextLabel="等級制度" />

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
      <AIBrushupChat
        contextLabel="等級制度"
        contextContent="現在編集中の等級制度ページ"
      />
    </div>
  );
}
