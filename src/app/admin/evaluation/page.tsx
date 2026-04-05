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

const SUB_TABS = [
  { key: 'knowledge', label: '📚 知識基準', icon: '📚' },
  { key: 'skill', label: '🎯 スキル基準', icon: '🎯' },
  { key: 'mindset', label: '💎 マインド基準', icon: '💎' },
  { key: 'promotion', label: '⬆️ 昇格条件', icon: '⬆️' },
  { key: 'demotion', label: '⬇️ 降格条件', icon: '⬇️' },
  { key: 'learning', label: '📖 必須の学び', icon: '📖' },
] as const;

type SubTab = typeof SUB_TABS[number]['key'];

export default function EvaluationPage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<any>(null);
  const [framework, setFramework] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [subTab, setSubTab] = useState<SubTab>('knowledge');

  // 既存の評価基準も表示用に保持
  const [legacyCriteria, setLegacyCriteria] = useState<any>(null);

  useEffect(() => {
    fetch('/api/clinic/grades').then(r => r.json()).then(d => {
      if (Array.isArray(d)) { setGrades(d); if (d.length > 0) setSelectedGrade(d[0]); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedGrade) return;
    // 新フレームワーク
    fetch(`/api/clinic/grade-evaluation?gradeLevelId=${selectedGrade.id}`).then(r => r.json()).then(d => {
      if (d && d.id) {
        // JSONパース
        const parsed = { ...d };
        for (const key of ['knowledge_criteria', 'skill_criteria', 'mindset_criteria', 'promotion_requirements', 'demotion_requirements', 'required_learning', 'required_certifications', 'promotion_exam']) {
          if (typeof parsed[key] === 'string') { try { parsed[key] = JSON.parse(parsed[key]); } catch { /* keep string */ } }
        }
        setFramework(parsed);
      } else { setFramework(null); }
    });
    // 旧評価基準
    fetch(`/api/clinic/evaluation-criteria?gradeId=${selectedGrade.id}`).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) {
        try { setLegacyCriteria({ ...d[0], categories: typeof d[0].categories === 'string' ? JSON.parse(d[0].categories) : d[0].categories }); } catch { setLegacyCriteria(d[0]); }
      } else { setLegacyCriteria(null); }
    });
  }, [selectedGrade]);

  const generateFramework = async () => {
    if (!selectedGrade) return;
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/grade-evaluation/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevelId: selectedGrade.id }),
      });
      const data = await res.json();
      if (data.knowledgeCriteria || data.mindsetCriteria) { setPreview(data); }
      else { setMessage(data.error || '生成に失敗しました'); }
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const savePreview = async () => {
    if (!preview || !selectedGrade) return;
    setSaving(true);
    try {
      await fetch('/api/clinic/grade-evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLevelId: selectedGrade.id,
          gradeLevel: selectedGrade.level_number,
          knowledgeWeight: 25, skillWeight: 25, mindsetWeight: 50,
          knowledgeCriteria: preview.knowledgeCriteria,
          skillCriteria: preview.skillCriteria,
          mindsetCriteria: preview.mindsetCriteria,
          promotionRequirements: preview.promotionRequirements,
          demotionRequirements: preview.demotionRequirements,
          requiredLearning: preview.requiredLearning,
          requiredCertifications: preview.requiredCertifications,
          promotionExam: preview.promotionExam,
        }),
      });
      // 再取得
      const res = await fetch(`/api/clinic/grade-evaluation?gradeLevelId=${selectedGrade.id}`);
      const d = await res.json();
      if (d && d.id) {
        const parsed = { ...d };
        for (const key of ['knowledge_criteria', 'skill_criteria', 'mindset_criteria', 'promotion_requirements', 'demotion_requirements', 'required_learning', 'required_certifications', 'promotion_exam']) {
          if (typeof parsed[key] === 'string') { try { parsed[key] = JSON.parse(parsed[key]); } catch { /* keep */ } }
        }
        setFramework(parsed);
      }
      setPreview(null);
      setMessage('保存しました');
    } finally { setSaving(false); }
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16,
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const kw = framework?.knowledge_weight ?? 25;
  const sw = framework?.skill_weight ?? 25;
  const mw = framework?.mindset_weight ?? 50;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📋 評価制度</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>等級別の評価基準（知識25%・スキル25%・マインド50%）をAIで生成</p>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* 評価配分バー */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>評価配分</div>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 36 }}>
          <div style={{ width: `${kw}%`, background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>📚 知識 {kw}%</div>
          <div style={{ width: `${sw}%`, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>🎯 スキル {sw}%</div>
          <div style={{ width: `${mw}%`, background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>💎 マインド {mw}%</div>
        </div>
      </div>

      {/* アチーブメント原則 5段階 */}
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

      {/* 等級セレクター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {grades.map(g => (
          <button key={g.id} onClick={() => setSelectedGrade(g)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: selectedGrade?.id === g.id ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-card)',
            color: selectedGrade?.id === g.id ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${selectedGrade?.id === g.id ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>Lv.{g.level_number} {g.name}</button>
        ))}
      </div>

      {grades.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>先に等級制度を登録してください��🏅 等級制度ページ）</div>}

      {selectedGrade && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={generateFramework} disabled={generating} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 13,
          }}>
            {generating ? '生成中...' : '🤖 AIで評価基準を生成'}
          </button>
        </div>
      )}

      {/* プレビュー */}
      {preview && (
        <div style={{ padding: 16, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>生成結果プレビュー</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700 }}>📚 知識基準</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{(preview.knowledgeCriteria || []).length}項目</div>
            </div>
            <div style={{ padding: 10, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>🎯 スキル基準</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{(preview.skillCriteria || []).length}項目</div>
            </div>
            <div style={{ padding: 10, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 700 }}>💎 マインド基準</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{(preview.mindsetCriteria || []).length}項目</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={savePreview} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '✅ 採用して保存'}</button>
            <button onClick={() => setPreview(null)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
          </div>
        </div>
      )}

      {/* サブタブ */}
      {selectedGrade && framework && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {SUB_TABS.map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: subTab === t.key ? 'var(--accent-soft)' : 'var(--bg-card)',
                color: subTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${subTab === t.key ? 'var(--border-accent)' : 'var(--border)'}`,
              }}>{t.label}</button>
            ))}
          </div>

          {/* 知識基準 */}
          {subTab === 'knowledge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(framework.knowledge_criteria || []).map((c: any, i: number) => (
                <div key={i} style={{ ...cardStyle, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{c.item}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{c.description}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[{ l: 5, k: 'achievementLevel5', color: '#4ade80' }, { l: 3, k: 'achievementLevel3', color: '#fbbf24' }, { l: 1, k: 'achievementLevel1', color: '#94a3b8' }].map(lv => (
                      <div key={lv.l} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: lv.color, width: 40, flexShrink: 0 }}>Lv{lv.l}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{c[lv.k]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(framework.knowledge_criteria || []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>まだ知識基準が生成されていません</div>}
            </div>
          )}

          {/* スキル基準 */}
          {subTab === 'skill' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(framework.skill_criteria || []).map((c: any, i: number) => (
                <div key={i} style={{ ...cardStyle, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{c.item}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{c.description}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[{ l: 5, k: 'achievementLevel5', color: '#4ade80' }, { l: 3, k: 'achievementLevel3', color: '#fbbf24' }, { l: 1, k: 'achievementLevel1', color: '#94a3b8' }].map(lv => (
                      <div key={lv.l} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: lv.color, width: 40, flexShrink: 0 }}>Lv{lv.l}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{c[lv.k]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(framework.skill_criteria || []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>まだスキル基準が生成されていません</div>}
            </div>
          )}

          {/* マインド基準 */}
          {subTab === 'mindset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(framework.mindset_criteria || []).map((c: any, i: number) => (
                <div key={i} style={{ ...cardStyle, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{c.item}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{c.description}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[5, 4, 3, 2, 1].map(lv => {
                      const ml = MINDSET_LEVELS.find(m => m.level === lv)!;
                      return (
                        <div key={lv} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: ml.color, width: 80, flexShrink: 0 }}>Lv{lv} {ml.label}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{c[`level${lv}`]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(framework.mindset_criteria || []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>まだマインド基準が生成されていません</div>}
            </div>
          )}

          {/* 昇格条件 */}
          {subTab === 'promotion' && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>⬆️ 昇格条件</div>
              {(framework.promotion_requirements || []).length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {(framework.promotion_requirements as string[]).map((r: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.6 }}>{r}</li>
                  ))}
                </ul>
              ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>まだ設定されていません</div>}

              {framework.required_certifications && (framework.required_certifications as string[]).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📜 必須資格</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(framework.required_certifications as string[]).map((c: string, i: number) => (
                      <span key={i} style={{ padding: '4px 12px', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 20, fontSize: 12, color: '#6c63ff' }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {framework.promotion_exam && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📝 昇格試験</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>形式：{framework.promotion_exam.format}</div>
                  {framework.promotion_exam.content && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {(framework.promotion_exam.content as string[]).map((c: string, i: number) => (
                        <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>合格基準：{framework.promotion_exam.passingCriteria}</div>
                </div>
              )}
            </div>
          )}

          {/* 降格条件 */}
          {subTab === 'demotion' && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>⬇️ 降格条件</div>
              {(framework.demotion_requirements || []).length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {(framework.demotion_requirements as string[]).map((r: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.6 }}>{r}</li>
                  ))}
                </ul>
              ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>まだ設定されていません</div>}
            </div>
          )}

          {/* 必須の学び */}
          {subTab === 'learning' && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📖 必須の学び・研修</div>
              {(framework.required_learning || []).length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {(framework.required_learning as string[]).map((r: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.6 }}>{r}</li>
                  ))}
                </ul>
              ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>まだ設定されていません</div>}
            </div>
          )}
        </>
      )}

      {/* ��レームワーク未生成の場合、旧評価基準を表示 */}
      {selectedGrade && !framework && legacyCriteria && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>※ 旧形式の評価基準が登録されています。新フレームワーク（知識/スキル/マインド）をAI生成してください。</div>
          {(Array.isArray(legacyCriteria.categories) ? legacyCriteria.categories : []).map((cat: any, ci: number) => (
            <div key={ci} style={{ ...cardStyle, marginBottom: 8, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{cat.name}（{cat.weight}%）</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(cat.criteria || []).length}項目</div>
            </div>
          ))}
        </div>
      )}

      <AIDialogueButton contextType="evaluation" contextLabel="評価制度・等級基準" />
    </div>
  );
}
