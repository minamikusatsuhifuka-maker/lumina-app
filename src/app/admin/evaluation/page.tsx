'use client';
import { useState, useEffect } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

const DEFAULT_MINDSET_LEVELS = [
  { level: 1, label: '知る', desc: '理念・原則を「知っている」', color: '#94a3b8' },
  { level: 2, label: 'わかる', desc: '意味を「理解している」', color: '#60a5fa' },
  { level: 3, label: '行う', desc: '日常的に「実践している」', color: '#fbbf24' },
  { level: 4, label: 'できる', desc: '自然に「体現できている」', color: '#4ade80' },
  { level: 5, label: '分かち合う', desc: '他者に「伝え広めている」', color: '#a78bfa' },
];
const DEFAULT_REAL_PRINCIPLES = [
  { kanji: '実行', reading: 'じっこう', desc: 'やると言ったことをやる' },
  { kanji: '実績', reading: 'じっせき', desc: '事実・数字で語れる成果' },
  { kanji: '実力', reading: 'じつりょく', desc: '本物の力が身についている' },
  { kanji: '誠実', reading: 'せいじつ', desc: '自分にも他者にも正直' },
];

const parseArr = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const r = JSON.parse(v); return Array.isArray(r) ? r : []; } catch { return []; }
};

type Section = 'knowledge' | 'skills' | 'mindset' | null;

export default function EvaluationPage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // 職種・等級選択
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedGradeId, setSelectedGradeId] = useState('');

  // 編集
  const [editingSection, setEditingSection] = useState<Section>(null);
  const [knowledgeCriteria, setKnowledgeCriteria] = useState<string[]>([]);
  const [skillCriteria, setSkillCriteria] = useState<string[]>([]);
  const [mindsetCriteria, setMindsetCriteria] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // AI生成
  const [generating, setGenerating] = useState(false);

  // フレームワーク（マインド5段階・実の原則）
  const [mindsetLevels, setMindsetLevels] = useState<any[]>(DEFAULT_MINDSET_LEVELS);
  const [realPrinciples, setRealPrinciples] = useState<any[]>(DEFAULT_REAL_PRINCIPLES);
  const [editingFrameworkSection, setEditingFrameworkSection] = useState<'mindset_levels' | 'real_principles' | null>(null);
  const [savingFramework, setSavingFramework] = useState(false);

  useEffect(() => {
    fetch('/api/clinic/evaluation-framework').then(r => r.json()).then(d => {
      if (d.mindset_levels) setMindsetLevels(d.mindset_levels);
      if (d.real_principles) setRealPrinciples(d.real_principles);
    }).catch(() => {});
  }, []);

  const saveFrameworkSection = async (section: 'mindset_levels' | 'real_principles') => {
    setSavingFramework(true);
    const data = section === 'mindset_levels' ? mindsetLevels : realPrinciples;
    try {
      await fetch('/api/clinic/evaluation-framework', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [section]: data }) });
      setEditingFrameworkSection(null);
      setMessage('保存しました');
      setTimeout(() => setMessage(''), 2000);
    } catch { setMessage('保存に失敗しました'); }
    finally { setSavingFramework(false); }
  };

  useEffect(() => {
    fetch('/api/clinic/grades').then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        setGrades(d);
        if (d.length > 0) {
          const firstPos = d[0].position || '';
          setSelectedPosition(firstPos);
          const firstGrade = d.filter((g: any) => g.position === firstPos).sort((a: any, b: any) => a.level_number - b.level_number)[0];
          if (firstGrade) setSelectedGradeId(firstGrade.id);
        }
      }
      setLoading(false);
    });
  }, []);

  const positions = [...new Set(grades.map(g => g.position).filter(Boolean))] as string[];
  const gradesByPosition = grades.filter(g => g.position === selectedPosition).sort((a, b) => a.level_number - b.level_number);
  const selectedGrade = grades.find(g => g.id === selectedGradeId);

  // 等級選択時にデータをロード
  useEffect(() => {
    if (!selectedGrade) return;
    setKnowledgeCriteria(parseArr(selectedGrade.knowledge));
    setSkillCriteria(parseArr(selectedGrade.skills));
    setMindsetCriteria(parseArr(selectedGrade.mindset));
    setEditingSection(null);
  }, [selectedGradeId]);

  const updateCriteria = (section: string, idx: number, value: string) => {
    const setter = section === 'knowledge' ? setKnowledgeCriteria : section === 'skills' ? setSkillCriteria : setMindsetCriteria;
    setter(prev => prev.map((v, i) => i === idx ? value : v));
  };
  const removeCriteria = (section: string, idx: number) => {
    const setter = section === 'knowledge' ? setKnowledgeCriteria : section === 'skills' ? setSkillCriteria : setMindsetCriteria;
    setter(prev => prev.filter((_, i) => i !== idx));
  };
  const addCriteria = (section: string) => {
    const setter = section === 'knowledge' ? setKnowledgeCriteria : section === 'skills' ? setSkillCriteria : setMindsetCriteria;
    setter(prev => [...prev, '']);
  };

  const saveSection = async (section: 'knowledge' | 'skills' | 'mindset') => {
    if (!selectedGradeId) return;
    setSaving(true);
    const data = section === 'knowledge' ? knowledgeCriteria : section === 'skills' ? skillCriteria : mindsetCriteria;
    try {
      await fetch(`/api/clinic/grades/${selectedGradeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [section]: JSON.stringify(data) }),
      });
      // gradesを更新
      setGrades(prev => prev.map(g => g.id === selectedGradeId ? { ...g, [section]: JSON.stringify(data) } : g));
      setEditingSection(null);
      setMessage('保存しました');
      setTimeout(() => setMessage(''), 2000);
    } catch { setMessage('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const generateForGrade = async () => {
    if (!selectedGrade) return;
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/grade-evaluation/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevelId: selectedGrade.id }),
      });
      const data = await res.json();
      if (data.knowledgeCriteria) {
        // knowledge/skill/mindsetをgrade_levelsに保存
        const kItems = (data.knowledgeCriteria || []).map((c: any) => c.item || c);
        const sItems = (data.skillCriteria || []).map((c: any) => c.item || c);
        const mItems = (data.mindsetCriteria || []).map((c: any) => c.item || c);
        await fetch(`/api/clinic/grades/${selectedGradeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            knowledge: JSON.stringify(kItems),
            skills: JSON.stringify(sItems),
            mindset: JSON.stringify(mItems),
          }),
        });
        setKnowledgeCriteria(kItems);
        setSkillCriteria(sItems);
        setMindsetCriteria(mItems);
        setGrades(prev => prev.map(g => g.id === selectedGradeId ? { ...g, knowledge: JSON.stringify(kItems), skills: JSON.stringify(sItems), mindset: JSON.stringify(mItems) } : g));
        setMessage('AIで評価基準を生成・保存しました');
      } else {
        setMessage(data.error || '生成に失敗しました');
      }
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const getRealBadge = (text: string): { label: string; color: string } => {
    if (text.match(/数字|成果|実績|結果|売上|件数|達成/)) return { label: '実績', color: '#f59e0b' };
    if (text.match(/技術|能力|スキル|熟練|対応力|判断/)) return { label: '実力', color: '#3b82f6' };
    if (text.match(/正直|誠実|報告|透明|約束|信頼/)) return { label: '誠実', color: '#8b5cf6' };
    return { label: '実行', color: '#ef4444' };
  };

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const renderSection = (section: 'knowledge' | 'skills' | 'mindset', label: string, icon: string, color: string, items: string[], setItems: (v: string[]) => void) => (
    <div style={{ ...cardStyle, marginBottom: 16, borderColor: `${color}30` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>{icon} {label}</div>
        {editingSection !== section && (
          <button onClick={() => setEditingSection(section)} style={{ fontSize: 12, color, background: 'none', border: 'none', cursor: 'pointer' }}>✏️ 編集</button>
        )}
      </div>

      {editingSection === section ? (
        <div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={item} onChange={e => updateCriteria(section, i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => removeCriteria(section, i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <button onClick={() => addCriteria(section)} style={{ fontSize: 12, color, background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>＋ 項目を追加</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => saveSection(section)} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '保存中...' : '💾 保存'}</button>
            <button onClick={() => { setEditingSection(null); setItems(parseArr(selectedGrade?.[section])); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
          </div>
        </div>
      ) : (
        <div>
          {items.length > 0 ? items.map((item, i) => {
            const badge = section === 'mindset' ? getRealBadge(item) : null;
            return (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: `${color}99`, flexShrink: 0 }}>•</span>
              <span style={{ flex: 1 }}>{item}</span>
              {badge && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${badge.color}15`, color: badge.color, fontWeight: 700, flexShrink: 0 }}>{badge.label}</span>
              )}
            </div>
            );
          }) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>項目が未設定です</div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📋 評価制度</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>等級別の評価基準（知識25%・スキル25%・マインド50%）を直接編集・AIで生成</p>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* 評価配分バー */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>評価配分</div>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 36 }}>
          <div style={{ width: '25%', background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>📚 知識 25%</div>
          <div style={{ width: '25%', background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>🎯 スキル 25%</div>
          <div style={{ width: '50%', background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>💎 マインド 50%</div>
        </div>
      </div>

      {/* アチーブメント原則（編集可能） */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>マインド評価の5段階（アチーブメント原則）</div>
          {editingFrameworkSection !== 'mindset_levels' && (
            <button onClick={() => setEditingFrameworkSection('mindset_levels')} style={{ fontSize: 12, color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer' }}>✏️ 編集</button>
          )}
        </div>
        {editingFrameworkSection === 'mindset_levels' ? (
          <div>
            {mindsetLevels.map((ml, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 30, flexShrink: 0 }}>Lv{ml.level}</div>
                <input value={ml.label} onChange={e => setMindsetLevels(prev => prev.map((v, j) => j === i ? { ...v, label: e.target.value } : v))} placeholder="ラベル" style={{ ...inputStyle, width: 80 }} />
                <input value={ml.desc} onChange={e => setMindsetLevels(prev => prev.map((v, j) => j === i ? { ...v, desc: e.target.value } : v))} placeholder="説明文" style={{ ...inputStyle, flex: 1 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => saveFrameworkSection('mindset_levels')} disabled={savingFramework} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{savingFramework ? '保存中...' : '💾 保存'}</button>
              <button onClick={() => setEditingFrameworkSection(null)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mindsetLevels.map(ml => (
              <div key={ml.level} style={{ flex: 1, minWidth: 130, padding: '8px 10px', background: `${ml.color}15`, border: `1px solid ${ml.color}40`, borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: ml.color }}>Lv{ml.level}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ml.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{ml.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 「実」を見て評価する（編集可能） */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📌 評価の大原則：「実」を見る</div>
          {editingFrameworkSection !== 'real_principles' && (
            <button onClick={() => setEditingFrameworkSection('real_principles')} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✏️ 編集</button>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          「心の中やマインドは言動に全て現れる」— だから内面ではなく「実」で評価します。
        </div>
        {editingFrameworkSection === 'real_principles' ? (
          <div>
            {realPrinciples.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input value={item.kanji} onChange={e => setRealPrinciples(prev => prev.map((v, j) => j === i ? { ...v, kanji: e.target.value } : v))} placeholder="漢字" style={{ ...inputStyle, width: 60 }} />
                <input value={item.reading} onChange={e => setRealPrinciples(prev => prev.map((v, j) => j === i ? { ...v, reading: e.target.value } : v))} placeholder="読み" style={{ ...inputStyle, width: 90 }} />
                <input value={item.desc} onChange={e => setRealPrinciples(prev => prev.map((v, j) => j === i ? { ...v, desc: e.target.value } : v))} placeholder="説明" style={{ ...inputStyle, flex: 1 }} />
                <button
                  onClick={() => setRealPrinciples(prev => prev.filter((_, j) => j !== i))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setRealPrinciples(prev => [...prev, { kanji: '', reading: '', desc: '' }])}
              style={{ marginBottom: 12, padding: '6px 14px', borderRadius: 8, border: '1px dashed rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              ＋ 項目を追加
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => saveFrameworkSection('real_principles')} disabled={savingFramework} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{savingFramework ? '保存中...' : '💾 保存'}</button>
              <button onClick={() => setEditingFrameworkSection(null)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${realPrinciples.length}, 1fr)`, gap: 8 }}>
            {realPrinciples.map(item => (
              <div key={item.kanji} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{item.kanji}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.reading}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 職種タブ */}
      {positions.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {positions.map(pos => (
            <button key={pos} onClick={() => { setSelectedPosition(pos); setSelectedGradeId(''); setEditingSection(null); }} style={{
              padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: selectedPosition === pos ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
              color: selectedPosition === pos ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${selectedPosition === pos ? 'transparent' : 'var(--border)'}`,
            }}>{pos}</button>
          ))}
        </div>
      )}

      {/* 等級タブ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {gradesByPosition.map(g => (
          <button key={g.id} onClick={() => { setSelectedGradeId(g.id); setEditingSection(null); }} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: selectedGradeId === g.id ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)',
            color: selectedGradeId === g.id ? '#6c63ff' : 'var(--text-muted)',
            border: `2px solid ${selectedGradeId === g.id ? '#6c63ff' : 'var(--border)'}`,
          }}>Lv.{g.level_number} {g.name}</button>
        ))}
      </div>

      {grades.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>先に等級制度を登録してください</div>}

      {/* 選択中の等級の評価基準 */}
      {selectedGrade && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedGrade.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedGrade.position}</div>
            <button onClick={generateForGrade} disabled={generating} style={{
              marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 12,
            }}>
              {generating ? '生成中...' : '🤖 AIで評価基準を生成'}
            </button>
          </div>

          {renderSection('knowledge', '知識評価基準（25%）', '📚', '#3b82f6', knowledgeCriteria, setKnowledgeCriteria)}
          {renderSection('skills', 'スキル評価基準（25%）', '🎯', '#f59e0b', skillCriteria, setSkillCriteria)}
          {renderSection('mindset', 'マインド評価基準（50%）', '💎', '#8b5cf6', mindsetCriteria, setMindsetCriteria)}
        </>
      )}

      <AIDialogueButton contextType="evaluation" contextLabel="評価制度・等級基準" />
    </div>
  );
}
