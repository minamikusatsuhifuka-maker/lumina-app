'use client';
import { useState, useEffect } from 'react';

const CORE_VALUES = [
  { key: 'self_love', label: '💎 自己愛', color: '#ec4899' },
  { key: 'self_management', label: '🎯 セルフマネジメント', color: '#f5a623' },
  { key: 'self_growth', label: '🌱 自己成長', color: '#4ade80' },
  { key: 'enrich_others', label: '👨‍👩‍👧 身近な人を豊かに', color: '#6c63ff' },
  { key: 'social_contribution', label: '🌍 社会貢献', color: '#00d4b8' },
  { key: 'self_realization', label: '✨ 自己実現×理念', color: '#8b5cf6' },
  { key: 'power_partner', label: '🤝 パワーパートナー', color: '#f87171' },
];

const parseJson = (v: any) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };

export default function MindsetPage() {
  const [framework, setFramework] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'corevalue' | 'grade'>('corevalue');
  const [selectedCv, setSelectedCv] = useState('self_growth');
  const [selectedGrade, setSelectedGrade] = useState(1);
  const [message, setMessage] = useState('');

  // 一括生成
  const [showGen, setShowGen] = useState(false);
  const [genPositions, setGenPositions] = useState('看護師・受付');
  const [genCount, setGenCount] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [fw, gr] = await Promise.all([
      fetch('/api/clinic/mindset-framework').then(r => r.json()),
      fetch('/api/clinic/grades').then(r => r.json()),
    ]);
    if (Array.isArray(fw)) setFramework(fw);
    if (Array.isArray(gr)) setGrades(gr);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const generateAll = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/mindset-framework/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeCount: parseInt(genCount), positions: genPositions }) });
      const data = await res.json();
      if (data.framework) setGenPreview(data);
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const saveGenerated = async () => {
    if (!genPreview?.framework) return;
    setSaving(true);
    const items: any[] = [];
    for (const grade of genPreview.framework) {
      for (const [cvKey, cvData] of Object.entries(grade.coreValues || {})) {
        const d = cvData as any;
        items.push({
          gradeLevel: grade.gradeLevel,
          position: null,
          coreValue: cvKey === 'selfGrowth' ? 'self_growth' : cvKey === 'socialContribution' ? 'social_contribution' : cvKey === 'continuousLearning' ? 'continuous_learning' : cvKey,
          stageDescription: d.stageDescription,
          behavioralIndicators: JSON.stringify(d.behavioralIndicators || []),
          growthActions: JSON.stringify(d.growthActions || []),
          assessmentCriteria: d.assessmentCriteria,
        });
      }
    }
    await fetch('/api/clinic/mindset-framework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    setShowGen(false); setGenPreview(null); fetchData(); setSaving(false);
  };

  const getFrameworkEntry = (gradeLevel: number, coreValue: string) => framework.find(f => f.grade_level === gradeLevel && f.core_value === coreValue);

  const gradeNumbers = [...new Set(framework.map(f => f.grade_level))].sort((a, b) => a - b);
  const effectiveGrades = gradeNumbers.length > 0 ? gradeNumbers : grades.map(g => g.level_number);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🌱 マインド成長フレームワーク</h1>
        <button onClick={() => setShowGen(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🌱 AIで一括生成</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>4つのコア価値 × 等級段階のマインド成長を設計</p>

      {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

      {/* 表示モード切り替え */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setViewMode('corevalue')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: viewMode === 'corevalue' ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: viewMode === 'corevalue' ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${viewMode === 'corevalue' ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>コア価値別ビュー</button>
        <button onClick={() => setViewMode('grade')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: viewMode === 'grade' ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: viewMode === 'grade' ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${viewMode === 'grade' ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>等級別ビュー</button>
      </div>

      {framework.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div><div>マインドフレームワークが未登録です</div><div style={{ fontSize: 13, marginTop: 8 }}>「AIで一括生成」から始めましょう</div></div>
      ) : viewMode === 'corevalue' ? (
        <>
          {/* コア価値タブ */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {CORE_VALUES.map(cv => (
              <button key={cv.key} onClick={() => setSelectedCv(cv.key)} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedCv === cv.key ? `${cv.color}20` : 'var(--bg-card)',
                color: selectedCv === cv.key ? cv.color : 'var(--text-muted)',
                border: `1px solid ${selectedCv === cv.key ? `${cv.color}40` : 'var(--border)'}`,
              }}>{cv.label}</button>
            ))}
          </div>

          {/* Grade 1→N の縦表示 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {effectiveGrades.map(gl => {
              const entry = getFrameworkEntry(gl, selectedCv);
              const grade = grades.find(g => g.level_number === gl);
              const cvColor = CORE_VALUES.find(c => c.key === selectedCv)?.color || '#6c63ff';
              return (
                <div key={gl} style={{ display: 'flex', border: '1px solid var(--border)', borderBottom: 'none' }} className="last:border-b">
                  <div style={{ width: 120, padding: '14px 12px', background: `${cvColor}10`, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cvColor }}>Grade {gl}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grade?.name || ''}</div>
                  </div>
                  <div style={{ flex: 1, padding: '14px 16px' }}>
                    {entry ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{entry.stage_description}</div>
                        {parseJson(entry.behavioral_indicators).length > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-muted)' }}>行動: </span>
                            {parseJson(entry.behavioral_indicators).map((b: string, i: number) => <span key={i}>{i > 0 ? ' / ' : ''}{b}</span>)}
                          </div>
                        )}
                        {parseJson(entry.growth_actions).length > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>アクション: </span>
                            {parseJson(entry.growth_actions).map((a: string, i: number) => <span key={i}>{i > 0 ? ' / ' : ''}{a}</span>)}
                          </div>
                        )}
                      </>
                    ) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>未設定</div>}
                  </div>
                </div>
              );
            })}
            <div style={{ border: '1px solid var(--border)', borderTop: 'none', height: 0 }} />
          </div>
        </>
      ) : (
        <>
          {/* 等級選択 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {effectiveGrades.map(gl => {
              const grade = grades.find(g => g.level_number === gl);
              return (
                <button key={gl} onClick={() => setSelectedGrade(gl)} style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedGrade === gl ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
                  color: selectedGrade === gl ? '#6c63ff' : 'var(--text-muted)',
                  border: `1px solid ${selectedGrade === gl ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
                }}>Lv.{gl} {grade?.name || ''}</button>
              );
            })}
          </div>

          {/* 4コア価値を一覧表示 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {CORE_VALUES.map(cv => {
              const entry = getFrameworkEntry(selectedGrade, cv.key);
              return (
                <div key={cv.key} style={{ padding: 16, background: 'var(--bg-secondary)', border: `1px solid ${cv.color}30`, borderRadius: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cv.color, marginBottom: 8 }}>{cv.label}</div>
                  {entry ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6, fontWeight: 600 }}>{entry.stage_description}</div>
                      {parseJson(entry.behavioral_indicators).map((b: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>• {b}</div>)}
                    </>
                  ) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>未設定</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 一括生成モーダル */}
      {showGen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🌱 マインド成長フレームワーク一括生成</h2>
              <button onClick={() => { setShowGen(false); setGenPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {!genPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>職種</label><input value={genPositions} onChange={e => setGenPositions(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>等級数</label>
                  <select value={genCount} onChange={e => setGenCount(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}>{[3,4,5,6,7].map(n => <option key={n} value={n}>{n}段階</option>)}</select></div>
                <button onClick={generateAll} disabled={generating} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{generating ? '生成中（1〜2分）...' : '🤖 生成する'}</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{genPreview.framework?.length || 0}等級 × 4コア価値のフレームワークが生成されました</div>
                {(genPreview.framework || []).map((g: any, i: number) => (
                  <div key={i} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Grade {g.gradeLevel} {g.gradeName}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {Object.entries(g.coreValues || {}).map(([k, v]: [string, any]) => (
                        <span key={k} style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)' }}>{v.stageDescription?.slice(0, 30)}...</span>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={saveGenerated} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '採用する'}</button>
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
