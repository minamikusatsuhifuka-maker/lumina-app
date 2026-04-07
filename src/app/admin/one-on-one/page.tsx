'use client';
import { useState, useEffect } from 'react';

const NEEDS_LABELS: Record<string, string> = {
  survival: '🏠 生存',
  love_belonging: '❤️ 愛所属',
  power: '💪 力',
  freedom: '🦋 自由',
  fun: '🎯 楽しみ',
};

const GROWTH_STAGES = [
  { key: 'Lv1知る',      color: '#94a3b8' },
  { key: 'Lv2わかる',    color: '#60a5fa' },
  { key: 'Lv3行う',      color: '#fbbf24' },
  { key: 'Lv4できる',    color: '#4ade80' },
  { key: 'Lv5分かち合う', color: '#a78bfa' },
];

export default function OneOnOnePage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    staff_name: '',
    meeting_date: new Date().toISOString().split('T')[0],
    goals: '', discussion: '', achievements: '', challenges: '', action_items: '',
    next_meeting_date: '',
  });

  useEffect(() => {
    fetch('/api/clinic/one-on-one')
      .then(r => r.json())
      .then(d => setMeetings(Array.isArray(d) ? d : []));
  }, []);

  const saveMeeting = async () => {
    if (!form.staff_name.trim()) { setMessage('スタッフ名を入力してください'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/clinic/one-on-one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setSelected(data);
      setTab('list');
      setMessage('✅ ミーティングを記録しました');
      const updated = await fetch('/api/clinic/one-on-one').then(r => r.json());
      setMeetings(Array.isArray(updated) ? updated : []);
      setTimeout(() => setMessage(''), 3000);
    } catch { setMessage('❌ 保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const analyzeWithAI = async (meeting: any) => {
    setAnalyzing(true);
    const model = localStorage.getItem('lumina_ai_model') || 'claude';
    try {
      const res = await fetch('/api/clinic/one-on-one/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id, staffName: meeting.staff_name,
          goals: meeting.goals, discussion: meeting.discussion,
          achievements: meeting.achievements, challenges: meeting.challenges, model,
        }),
      });
      const data = await res.json();
      if (data.ai_analysis) {
        setSelected((prev: any) => ({ ...prev, ...data }));
        setMessage('✅ AI分析完了！');
        setTimeout(() => setMessage(''), 3000);
      } else { setMessage('❌ ' + (data.error || '分析に失敗しました')); }
    } catch { setMessage('❌ エラーが発生しました'); }
    finally { setAnalyzing(false); }
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, background: 'var(--bg-secondary)',
    border: '1px solid var(--border)', borderRadius: 16, marginBottom: 16,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 10, color: 'var(--text-primary)', fontSize: 13,
    lineHeight: 1.7, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
  };
  const staffList = [...new Set(meetings.map(m => m.staff_name))];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 80 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>🤝 1on1ミーティング</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        スタッフとの対話を記録・AI分析・成長を可視化
      </p>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.includes('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.includes('✅') ? '#4ade80' : '#ef4444',
        }}>{message}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'list', label: `📋 記録一覧（${meetings.length}件）` },
          { key: 'new',  label: '➕ 新規記録' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: tab === t.key ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            border: tab === t.key ? 'none' : '1px solid var(--border)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'new' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📝 ミーティングを記録</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>スタッフ名 *</div>
              <input value={form.staff_name} onChange={e => setForm(f => ({ ...f, staff_name: e.target.value }))}
                placeholder="例：田中さくら" list="staff-list" style={inputStyle} />
              <datalist id="staff-list">{staffList.map(name => <option key={name} value={name} />)}</datalist>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>ミーティング日</div>
              <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          {[
            { key: 'goals',       label: '🎯 今回のテーマ・目標',   rows: 2,  placeholder: '例：G2への昇格に向けた課題整理' },
            { key: 'discussion',  label: '💬 話し合った内容',       rows: 4,  placeholder: '例：患者対応での強みと改善点について話し合った...' },
            { key: 'achievements',label: '✅ 達成・成長したこと',   rows: 2,  placeholder: '例：先月から報連相が改善され、チームの雰囲気が良くなった' },
            { key: 'challenges',  label: '🔥 課題・悩み',           rows: 2,  placeholder: '例：自費カウンセリングの成約率が低い' },
            { key: 'action_items',label: '📌 次回までのアクション', rows: 2,  placeholder: '例：カウンセリングのロールプレイを週1回実施する' },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{field.label}</div>
              <textarea value={(form as any)[field.key]} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder} rows={field.rows} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>📅 次回ミーティング予定日</div>
            <input type="date" value={form.next_meeting_date} onChange={e => setForm(f => ({ ...f, next_meeting_date: e.target.value }))}
              style={{ ...inputStyle, width: 'auto' }} />
          </div>
          <button onClick={saveMeeting} disabled={saving} style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontSize: 14, fontWeight: 700,
          }}>{saving ? '保存中...' : '💾 記録を保存する'}</button>
        </div>
      )}

      {tab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap: 16 }}>
          <div>
            {meetings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                まだ記録がありません。「新規記録」から追加してください。
              </div>
            ) : meetings.map(m => {
              const stage = GROWTH_STAGES.find(s => s.key === m.growth_stage);
              return (
                <div key={m.id} onClick={() => setSelected(m)} style={{
                  ...cardStyle, cursor: 'pointer',
                  border: selected?.id === m.id ? '2px solid #6c63ff' : '1px solid var(--border)', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{m.staff_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.meeting_date} {m.goals && `• ${m.goals.slice(0, 30)}...`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {stage && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${stage.color}20`, color: stage.color, fontWeight: 700 }}>{stage.key}</span>}
                      {m.motivation_level && <span style={{ fontSize: 11, fontWeight: 800, color: m.motivation_level >= 70 ? '#4ade80' : m.motivation_level >= 50 ? '#f59e0b' : '#ef4444' }}>やる気{m.motivation_level}</span>}
                    </div>
                  </div>
                  {m.dominant_needs && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {(Array.isArray(m.dominant_needs) ? m.dominant_needs : []).map((n: string) => (
                        <span key={n} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{NEEDS_LABELS[n] || n}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selected && (
            <div style={{ position: 'sticky', top: 20, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.staff_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.meeting_date}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                </div>

                {[
                  { label: '🎯 テーマ・目標', value: selected.goals },
                  { label: '💬 話し合った内容', value: selected.discussion },
                  { label: '✅ 達成・成長', value: selected.achievements },
                  { label: '🔥 課題・悩み', value: selected.challenges },
                  { label: '📌 アクションアイテム', value: selected.action_items },
                ].filter(f => f.value).map(field => (
                  <div key={field.label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{field.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{field.value}</div>
                  </div>
                ))}

                <button onClick={() => analyzeWithAI(selected)} disabled={analyzing} style={{
                  width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 16,
                }}>{analyzing ? '🤖 分析中...' : '🤖 AIで分析する'}</button>

                {selected.ai_analysis && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                      {[
                        { label: 'マインドスコア', value: selected.mindset_score, color: '#8b5cf6' },
                        { label: 'モチベーション', value: selected.motivation_level, color: '#4ade80' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: 12, textAlign: 'center', background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: 10 }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {selected.growth_stage && (() => {
                      const stage = GROWTH_STAGES.find(s => s.key === selected.growth_stage);
                      return stage ? (
                        <div style={{ padding: '8px 14px', borderRadius: 10, marginBottom: 12, background: `${stage.color}15`, border: `1px solid ${stage.color}40`, fontSize: 13, fontWeight: 700, color: stage.color, textAlign: 'center' }}>
                          成長段階：{stage.key}
                        </div>
                      ) : null;
                    })()}

                    {selected.dominant_needs && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>💡 主要欲求</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(Array.isArray(selected.dominant_needs) ? selected.dominant_needs : []).map((n: string) => (
                            <span key={n} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 12, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontWeight: 600 }}>{NEEDS_LABELS[n] || n}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>🤖 AI分析</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 10 }}>
                        {selected.ai_analysis}
                      </div>
                    </div>

                    {selected.next_agenda && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📅 次回ミーティングの議題（AI提案）</div>
                        {(Array.isArray(selected.next_agenda) ? selected.next_agenda : []).map((agenda: string, i: number) => (
                          <div key={i} style={{ padding: '6px 10px', marginBottom: 6, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderLeft: '3px solid #06b6d4', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {i + 1}. {agenda}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button onClick={async () => {
                  if (!confirm('このミーティング記録を削除しますか？')) return;
                  await fetch(`/api/clinic/one-on-one?id=${selected.id}`, { method: 'DELETE' });
                  setSelected(null);
                  const updated = await fetch('/api/clinic/one-on-one').then(r => r.json());
                  setMeetings(Array.isArray(updated) ? updated : []);
                }} style={{
                  marginTop: 12, width: '100%', padding: '6px', borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                  color: '#ef4444', fontSize: 12, cursor: 'pointer',
                }}>🗑 削除</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
