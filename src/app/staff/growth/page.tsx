'use client';
import { useState, useEffect } from 'react';

type Tab = 'discovery' | 'goals' | 'alignment' | 'log';

export default function StaffGrowthPage() {
  const [tab, setTab] = useState<Tab>('discovery');
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

  useEffect(() => {
    fetch('/api/clinic/personal-growth-plans?staffId=me').then(r => r.json()).then(d => {
      if (d?.id) { setPlan(d); setGf({ lifeVision: d.life_vision || '', personalMission: d.personal_mission || '', coreValues: d.core_values || '', shortTermGoals: d.short_term_goals || '', longTermGoals: d.long_term_goals || '' }); }
    });
    fetch('/api/clinic/self-management-logs?staffId=me').then(r => r.json()).then(d => { if (Array.isArray(d)) setLogs(d.slice(0, 7)); });
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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const tabs: { key: Tab; label: string }[] = [
    { key: 'discovery', label: '💎 自己発見' }, { key: 'goals', label: '🎯 目標設定' },
    { key: 'alignment', label: '✨ 自己実現×理念' }, { key: 'log', label: '📝 セルフマネジメント' },
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

      {tab === 'discovery' && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>🔭 人生ビジョン</label><textarea value={gf.lifeVision} onChange={e => setGf(p => ({ ...p, lifeVision: e.target.value }))} placeholder="10年後どうありたいか" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} /></div>
          <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>🎯 個人ミッション</label><input value={gf.personalMission} onChange={e => setGf(p => ({ ...p, personalMission: e.target.value }))} placeholder="自分のミッション（一文で）" style={inputStyle} /></div>
          <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>💎 自分のコア価値</label><input value={gf.coreValues} onChange={e => setGf(p => ({ ...p, coreValues: e.target.value }))} placeholder="大切にしている価値（カンマ区切り）" style={inputStyle} /></div>
          <button onClick={savePlan} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>{saving ? '保存中...' : '💾 保存'}</button>
        </div>
      )}

      {tab === 'goals' && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>短期目標（1〜3ヶ月）</label><textarea value={gf.shortTermGoals} onChange={e => setGf(p => ({ ...p, shortTermGoals: e.target.value }))} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} /></div>
          <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>長期目標（1〜5年）</label><textarea value={gf.longTermGoals} onChange={e => setGf(p => ({ ...p, longTermGoals: e.target.value }))} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} /></div>
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
