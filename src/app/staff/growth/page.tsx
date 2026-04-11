'use client';
import { useState, useEffect } from 'react';

type Tab = 'growth' | 'discovery' | 'goals' | 'alignment' | 'log';

export default function StaffGrowthPage() {
  const [tab, setTab] = useState<Tab>('growth');
  const [plan, setPlan] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // フォーム
  const [gf, setGf] = useState({ lifeVision: '', personalMission: '', coreValues: '', shortTermGoals: '', longTermGoals: '' });

  // AI分析
  const [alignResult, setAlignResult] = useState<any>(null);
  const [aligning, setAligning] = useState(false);

  // セルフマネジメントログ
  const [log, setLog] = useState({ dailyGoal: '', achievement: '', reflection: '', gratitude: '', tomorrowIntention: '', moodScore: 3, growthScore: 3 });
  const [logSaving, setLogSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  // 成長グラフ
  const [oneOnOneHistory, setOneOnOneHistory] = useState<any[]>([]);
  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [myName, setMyName] = useState('');

  // AI目標提案
  const [goalAiLoading, setGoalAiLoading] = useState(false);
  const [goalAiSuggestion, setGoalAiSuggestion] = useState('');
  const [goalAiField, setGoalAiField] = useState<string>('');

  useEffect(() => {
    fetch('/api/clinic/personal-growth-plans?staffId=me').then(r => r.json()).then(d => {
      if (d?.id) { setPlan(d); setGf({ lifeVision: d.life_vision || '', personalMission: d.personal_mission || '', coreValues: d.core_values || '', shortTermGoals: d.short_term_goals || '', longTermGoals: d.long_term_goals || '' }); }
    });
    fetch('/api/clinic/self-management-logs?staffId=me').then(r => r.json()).then(d => { if (Array.isArray(d)) setLogs(d.slice(0, 7)); });
    // 成長グラフ用データ
    fetch('/api/clinic/staff/my-grade').then(r => r.json()).then(d => {
      const name = d?.name || '';
      setMyName(name);
      if (name) {
        fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(name)}`).then(r => r.json())
          .then(data => { if (Array.isArray(data)) setOneOnOneHistory(data.filter((m: any) => m.mindset_score || m.motivation_level).slice(0, 10).reverse()); });
        fetch(`/api/clinic/staff-evaluation?staff_name=${encodeURIComponent(name)}`).then(r => r.json())
          .then(data => { if (Array.isArray(data)) setEvalHistory(data.sort((a: any, b: any) => a.period.localeCompare(b.period))); });
      }
    });
  }, []);

  const savePlan = async () => {
    setSaving(true);
    await fetch('/api/clinic/personal-growth-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: 'me', ...gf }) });
    setMessage('保存しました'); setSaving(false);
    setTimeout(() => setMessage(''), 2000);
  };

  const analyzeAlignment = async () => {
    setAligning(true); setAlignResult(null);
    try {
      const res = await fetch('/api/clinic/personal-growth-plans/ai-align', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: 'me' }) });
      const data = await res.json();
      if (data.alignmentScore !== undefined) setAlignResult(data);
      else setMessage(data.error || '分析に失敗しました');
    } catch { setMessage('分析に失敗しました'); }
    finally { setAligning(false); }
  };

  const saveLog = async () => {
    setLogSaving(true);
    await fetch('/api/clinic/self-management-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: 'me', logDate: new Date().toISOString().split('T')[0], ...log }) });
    setMessage('記録しました'); setLogSaving(false);
    setLog({ dailyGoal: '', achievement: '', reflection: '', gratitude: '', tomorrowIntention: '', moodScore: 3, growthScore: 3 });
    const d = await (await fetch('/api/clinic/self-management-logs?staffId=me')).json();
    if (Array.isArray(d)) setLogs(d.slice(0, 7));
  };

  const suggestGoalWithAI = async (field: string, currentValue: string) => {
    setGoalAiLoading(true);
    setGoalAiField(field);
    setGoalAiSuggestion('');
    try {
      const fieldLabels: Record<string, string> = {
        lifeVision: '人生ビジョン', personalMission: '個人ミッション',
        coreValues: 'コアバリュー', shortTermGoals: '短期目標', longTermGoals: '長期目標',
      };
      const res = await fetch('/api/clinic/brushup-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `クリニックスタッフの${fieldLabels[field] || field}を一緒に考えます。\n現在の入力：「${currentValue || '（未入力）'}」\n\nリードマネジメント・インサイドアウトの視点で、より具体的で心に響く表現を2〜3パターン提案してください。\n短く・温かく・行動につながる言葉で。\n\n【提案①】\n（提案文）\n\n【提案②】\n（提案文）`,
          category: 'growth',
        }),
      });
      const data = await res.json();
      const text = data.reply || data.result || '';
      setGoalAiSuggestion(text);
    } catch {}
    setGoalAiLoading(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const tabs: { key: Tab; label: string }[] = [
    { key: 'growth', label: '📈 成長グラフ' },
    { key: 'discovery', label: '💎 自己発見' },
    { key: 'goals', label: '🎯 目標設定' },
    { key: 'alignment', label: '✨ 自己実現×理念' },
    { key: 'log', label: '📝 セルフマネジメント' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>✨ 個人成長計画</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>自分を知り、目標を立て、成長を記録する</p>

      {message && <div style={{ padding: 8, background: 'rgba(74,222,128,0.1)', borderRadius: 6, fontSize: 12, color: '#4ade80', marginBottom: 10 }}>{message}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: tab === t.key ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${tab === t.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{t.label}</button>
        ))}
      </div>

      {tab === 'growth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* マインドスコア推移 */}
          <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🧠 マインドスコア推移（1on1記録より）</div>
            {oneOnOneHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
                1on1の記録が増えると成長グラフが表示されます
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {oneOnOneHistory.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>
                      {new Date(m.meeting_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                      {m.mindset_score && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: '#6c63ff', marginBottom: 2 }}>マインド</div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(m.mindset_score / 10) * 100}%`, height: '100%', background: '#6c63ff', borderRadius: 4 }} />
                          </div>
                        </div>
                      )}
                      {m.motivation_level && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: '#4ade80', marginBottom: 2 }}>意欲</div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(m.motivation_level / 10) * 100}%`, height: '100%', background: '#4ade80', borderRadius: 4 }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {m.mindset_score && <span style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff' }}>{m.mindset_score}</span>}
                      {m.motivation_level && <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{m.motivation_level}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 評価スコア推移 */}
          {evalHistory.length > 0 && (
            <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📊 評価スコア推移</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {evalHistory.map((ev: any, i: number) => {
                  const prev = evalHistory[i - 1];
                  const diff = prev ? (ev.total_score || 0) - (prev.total_score || 0) : null;
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{ev.period}</div>
                      <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${ev.total_score || 0}%`, height: '100%', background: (ev.total_score || 0) >= 80 ? '#4ade80' : (ev.total_score || 0) >= 60 ? '#f59e0b' : '#ef4444', borderRadius: 5 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{ev.total_score || 0}</span>
                        {diff !== null && (
                          <span style={{ fontSize: 11, color: diff > 0 ? '#4ade80' : diff < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                            {diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : '→'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 成長メッセージ */}
          <div style={{ padding: '12px 16px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            🌱 あなたの成長は数字だけではありません。日々の気づきと行動が積み重なって、やがて大きな変化になります。
          </div>
        </div>
      )}

      {tab === 'discovery' && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { key: 'lifeVision', label: '🔭 人生ビジョン', placeholder: '10年後どうありたいか', isTextarea: true },
            { key: 'personalMission', label: '🎯 個人ミッション', placeholder: '自分のミッション（一文で）', isTextarea: false },
            { key: 'coreValues', label: '💎 自分のコア価値', placeholder: '大切にしている価値（カンマ区切り）', isTextarea: false },
          ].map(field => (
            <div key={field.key}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{field.label}</label>
              {field.isTextarea ? (
                <textarea value={(gf as any)[field.key]} onChange={e => setGf(p => ({ ...p, [field.key]: e.target.value }))} placeholder={field.placeholder} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
              ) : (
                <input value={(gf as any)[field.key]} onChange={e => setGf(p => ({ ...p, [field.key]: e.target.value }))} placeholder={field.placeholder} style={inputStyle} />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => suggestGoalWithAI(field.key, (gf as any)[field.key])}
                  disabled={goalAiLoading && goalAiField === field.key}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.06)', color: '#6c63ff', fontSize: 11, cursor: 'pointer' }}>
                  {goalAiLoading && goalAiField === field.key ? '考え中...' : '💡 AIに提案してもらう'}
                </button>
              </div>
              {goalAiSuggestion && goalAiField === field.key && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#6c63ff', fontWeight: 700, marginBottom: 6 }}>💡 AI提案</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{goalAiSuggestion}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {goalAiSuggestion.split(/【提案[①②③]】/).filter(s => s.trim()).map((s, i) => (
                      <button key={i} onClick={() => { setGf(f => ({ ...f, [field.key]: s.trim() })); setGoalAiSuggestion(''); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                        案{['①', '②', '③'][i]}を使う
                      </button>
                    ))}
                    <button onClick={() => setGoalAiSuggestion('')}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={savePlan} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>{saving ? '保存中...' : '💾 保存'}</button>
        </div>
      )}

      {tab === 'goals' && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { key: 'shortTermGoals', label: '短期目標（1〜3ヶ月）' },
            { key: 'longTermGoals', label: '長期目標（1〜5年）' },
          ].map(field => (
            <div key={field.key}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{field.label}</label>
              <textarea value={(gf as any)[field.key]} onChange={e => setGf(p => ({ ...p, [field.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => suggestGoalWithAI(field.key, (gf as any)[field.key])}
                  disabled={goalAiLoading && goalAiField === field.key}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.06)', color: '#6c63ff', fontSize: 11, cursor: 'pointer' }}>
                  {goalAiLoading && goalAiField === field.key ? '考え中...' : '💡 AIに提案してもらう'}
                </button>
              </div>
              {goalAiSuggestion && goalAiField === field.key && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#6c63ff', fontWeight: 700, marginBottom: 6 }}>💡 AI提案</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{goalAiSuggestion}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {goalAiSuggestion.split(/【提案[①②③]】/).filter(s => s.trim()).map((s, i) => (
                      <button key={i} onClick={() => { setGf(f => ({ ...f, [field.key]: s.trim() })); setGoalAiSuggestion(''); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                        案{['①', '②', '③'][i]}を使う
                      </button>
                    ))}
                    <button onClick={() => setGoalAiSuggestion('')}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={savePlan} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>{saving ? '保存中...' : '💾 保存'}</button>
        </div>
      )}

      {tab === 'alignment' && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <button onClick={analyzeAlignment} disabled={aligning} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: aligning ? 'rgba(236,72,153,0.3)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
            {aligning ? '分析中...' : '🤖 私の夢とクリニックの重なりを分析'}
          </button>
          {alignResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 70, height: 70, borderRadius: '50%', border: `4px solid ${alignResult.alignmentScore >= 80 ? '#4ade80' : '#f5a623'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: alignResult.alignmentScore >= 80 ? '#4ade80' : '#f5a623' }}>{alignResult.alignmentScore}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>適合度</span>
                </div>
                <div style={{ flex: 1 }}>{alignResult.alignmentAreas?.map((a: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>✅ {a}</div>)}</div>
              </div>
              {alignResult.powerPartnerMessage && (
                <div style={{ padding: 14, background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: 12 }}>
                  <div style={{ fontSize: 12, color: '#ec4899', fontWeight: 600, marginBottom: 6 }}>🤝 パワーパートナーメッセージ</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, fontStyle: 'italic' }}>{alignResult.powerPartnerMessage}</div>
                </div>
              )}
              {alignResult.nextActionForGrowth?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🚀 今すぐできる成長アクション</div>
                  {alignResult.nextActionForGrowth.map((a: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {a}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📝 今日の記録</div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>今日の目標</label><input value={log.dailyGoal} onChange={e => setLog(p => ({ ...p, dailyGoal: e.target.value }))} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>達成したこと</label><input value={log.achievement} onChange={e => setLog(p => ({ ...p, achievement: e.target.value }))} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>振り返り・気づき</label><textarea value={log.reflection} onChange={e => setLog(p => ({ ...p, reflection: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>感謝（身近な人への意識）</label><input value={log.gratitude} onChange={e => setLog(p => ({ ...p, gratitude: e.target.value }))} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>明日の意図</label><input value={log.tomorrowIntention} onChange={e => setLog(p => ({ ...p, tomorrowIntention: e.target.value }))} style={inputStyle} /></div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>気分（1-5）</label>
                <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setLog(p => ({ ...p, moodScore: n }))} style={{ width: 32, height: 32, borderRadius: '50%', border: log.moodScore === n ? '2px solid #6c63ff' : '1px solid var(--border)', background: log.moodScore === n ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: log.moodScore === n ? '#6c63ff' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}</div>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>成長実感（1-5）</label>
                <div style={{ display: 'flex', gap: 4 }}>{[1,2,3,4,5].map(n => <button key={n} onClick={() => setLog(p => ({ ...p, growthScore: n }))} style={{ width: 32, height: 32, borderRadius: '50%', border: log.growthScore === n ? '2px solid #4ade80' : '1px solid var(--border)', background: log.growthScore === n ? 'rgba(74,222,128,0.15)' : 'var(--bg-card)', color: log.growthScore === n ? '#4ade80' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}</div>
              </div>
            </div>
            <button onClick={saveLog} disabled={logSaving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: logSaving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>{logSaving ? '記録中...' : '💾 記録する'}</button>
          </div>

          {logs.length > 0 && (
            <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>直近の記録</div>
              {logs.map((l: any) => (
                <div key={l.id} style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(l.log_date).toLocaleDateString('ja-JP')}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{l.daily_goal}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#6c63ff' }}>気分 {l.mood_score}</span>
                    <span style={{ color: '#4ade80' }}>成長 {l.growth_score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
