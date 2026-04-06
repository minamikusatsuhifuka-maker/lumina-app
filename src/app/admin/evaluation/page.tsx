'use client';
import { useState, useEffect } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

const MINDSET_LEVELS = [
  { level: 1, label: '知る', desc: '理念・原則を「知っている」', color: '#94a3b8' },
  { level: 2, label: 'わかる', desc: '意味を「理解している」', color: '#60a5fa' },
  { level: 3, label: '行う', desc: '日常的に「実践している」', color: '#fbbf24' },
  { level: 4, label: 'できる', desc: '自然に「体現できている」', color: '#4ade80' },
  { level: 5, label: '分かち合う', desc: '他者に「伝え広めている」', color: '#a78bfa' },
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
          {items.length > 0 ? items.map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: `${color}99`, flexShrink: 0 }}>•</span>
              <span>{item}</span>
            </div>
          )) : (
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

      {/* アチーブメント原則 */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>マインド評価の5段階（アチーブメント原則）</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MINDSET_LEVELS.map(ml => (
            <div key={ml.level} style={{ flex: 1, minWidth: 130, padding: '8px 10px', background: `${ml.color}15`, border: `1px solid ${ml.color}40`, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: ml.color }}>Lv{ml.level}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ml.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{ml.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 「実」を見て評価する */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📌 評価の大原則：「実」を見る</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          「心の中やマインドは言動に全て現れる」— だから内面ではなく「実」で評価します。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { kanji: '実行', reading: 'じっこう', desc: 'やると言ったことをやる' },
            { kanji: '実績', reading: 'じっせき', desc: '事実・数字で語れる成果' },
            { kanji: '実力', reading: 'じつりょく', desc: '本物の力が身についている' },
            { kanji: '誠実', reading: 'せいじつ', desc: '自分にも他者にも正直' },
          ].map(item => (
            <div key={item.kanji} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{item.kanji}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.reading}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
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
