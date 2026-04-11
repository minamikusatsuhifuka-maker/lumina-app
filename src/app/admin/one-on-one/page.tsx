'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts';

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

  const getSuggestions = async (meeting: any) => {
    setSuggesting(true);
    setSuggestions('');
    try {
      const res = await fetch('/api/clinic/one-on-one/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: meeting.staff_name,
          discussion: meeting.discussion,
          achievements: meeting.achievements,
          challenges: meeting.challenges,
          actionItems: meeting.action_items,
          aiAnalysis: meeting.ai_analysis,
          growthStage: meeting.growth_stage,
        }),
      });
      const data = await res.json();
      if (data.result) setSuggestions(data.result);
    } catch { setMessage('❌ サジェスト生成に失敗しました'); }
    finally { setSuggesting(false); }
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
  const [staffHistory, setStaffHistory] = useState<any[]>([]);
  const [staffListData, setStaffListData] = useState<any[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSuggestion, setDraftSuggestion] = useState<string>('');

  useEffect(() => {
    fetch('/api/clinic/staff')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaffListData(d); });
  }, []);

  const loadStaffHistory = async (name: string) => {
    try {
      const res = await fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const withScores = data
          .filter((m: any) => m.mindset_score || m.motivation_level)
          .sort((a: any, b: any) => (a.meeting_date || '').localeCompare(b.meeting_date || ''));
        setStaffHistory(withScores);
      }
    } catch {}
  };

  const fetchDraftSuggestion = async (staffName: string) => {
    if (!staffName) return;
    setDraftLoading(true);
    setDraftSuggestion('');
    try {
      // 過去の記録を取得
      const meetings = await fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(staffName)}`)
        .then(r => r.json());
      const recent = Array.isArray(meetings) ? meetings.slice(0, 3) : [];
      if (recent.length === 0) { setDraftLoading(false); return; }

      const res = await fetch('/api/clinic/one-on-one/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName,
          discussion: recent[0]?.discussion || '',
          achievements: recent[0]?.achievements || '',
          challenges: recent[0]?.challenges || '',
          actionItems: recent[0]?.action_items || '',
          aiAnalysis: recent[0]?.ai_analysis || '',
          growthStage: recent[0]?.growth_stage || '',
        }),
      });
      const data = await res.json();
      if (data.result) setDraftSuggestion(data.result);
    } catch {}
    finally { setDraftLoading(false); }
  };

  const formatDate = (d: string) => d ? d.split('T')[0].replace(/-/g, '/') : '';
  const staffList = [...new Set(meetings.map(m => m.staff_name))];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🤝 1on1ミーティング</h1>
        <Link href="/admin/one-on-one/staff" style={{ padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
          👤 スタッフ別サマリー
        </Link>
      </div>
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
              <select value={form.staff_name} onChange={e => {
                const name = e.target.value;
                setForm(f => ({ ...f, staff_name: name }));
                if (name) fetchDraftSuggestion(name);
              }}
                style={{ width: '100%', padding: '9px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
                <option value="">スタッフを選択してください</option>
                {staffListData.map(s => (
                  <option key={s.id} value={s.name}>{s.name}（{s.position || ''}）</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>ミーティング日</div>
              <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* AI下書きサジェスト */}
          {draftLoading && (
            <div style={{ padding: '8px 12px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 8, fontSize: 12, color: '#6c63ff', marginBottom: 12 }}>
              💭 過去の記録から今回聞くべきことを考えています...
            </div>
          )}
          {draftSuggestion && !draftLoading && (
            <div style={{ marginBottom: 12, padding: 12, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>💡 今回の1on1で聞くといい問いかけ（過去の記録から）</div>
              {draftSuggestion.split(/【問いかけ[①②③]】/).filter(Boolean).slice(0, 2).map((block, i) => {
                const [question] = block.trim().split('→ 意図：');
                return (
                  <div key={i} style={{ marginBottom: 6, padding: '8px 10px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>問いかけ {['①', '②'][i]}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>「{question.trim()}」</div>
                  </div>
                );
              })}
              <button onClick={() => setDraftSuggestion('')}
                style={{ marginTop: 4, fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
          )}

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
                <div key={m.id} onClick={() => { setSelected(m); loadStaffHistory(m.staff_name); }} style={{
                  ...cardStyle, cursor: 'pointer',
                  border: selected?.id === m.id ? '2px solid #6c63ff' : '1px solid var(--border)', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{m.staff_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatDate(m.meeting_date)} {m.goals && `• ${m.goals.slice(0, 30)}...`}
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(selected.meeting_date)}</div>
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

                {/* 成長グラフ */}
                {staffHistory.length >= 2 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                      📈 成長推移グラフ
                    </div>
                    <div style={{ width: '100%', minHeight: 180 }}>
                      <LineChart
                        width={380}
                        height={180}
                        data={staffHistory.map(m => ({
                          date: formatDate(m.meeting_date),
                          マインド: m.mindset_score || null,
                          モチベーション: m.motivation_level || null,
                        }))}
                        margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,99,255,0.1)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(value: any) => [`${value}点`]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="マインド" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: '#8b5cf6' }} connectNulls />
                        <Line type="monotone" dataKey="モチベーション" stroke="#4ade80" strokeWidth={2} dot={{ r: 4, fill: '#4ade80' }} connectNulls />
                      </LineChart>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                      過去{staffHistory.length}回の記録
                    </div>
                  </div>
                )}

                <button onClick={() => analyzeWithAI(selected)} disabled={analyzing} style={{
                  width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 16,
                }}>{analyzing ? '🤖 分析中...' : '🤖 AIで分析する'}</button>

                {/* AIサジェストボタン */}
                <button onClick={() => getSuggestions(selected)} disabled={suggesting}
                  style={{
                    width: '100%', padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer', marginTop: 8,
                    background: suggesting ? 'rgba(29,158,117,0.3)' : 'linear-gradient(135deg, #1D9E75, #0F6E56)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                  }}>
                  {suggesting ? '💭 考え中...' : '💡 次回の問いかけをAIが提案'}
                </button>

                {/* サジェスト表示 */}
                {suggestions && (
                  <div style={{ marginTop: 12, padding: 14, background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', marginBottom: 10 }}>💡 次回の1on1で使える問いかけ</div>
                    {suggestions.split(/【問いかけ[①②③]】/).filter(Boolean).map((block, i) => {
                      const [question, ...rest] = block.trim().split('→ 意図：');
                      return (
                        <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                            問いかけ {['①', '②', '③'][i]}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: rest[0] ? 6 : 0 }}>
                            「{question.trim()}」
                          </div>
                          {rest[0] && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                              意図：{rest[0].trim()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button onClick={() => setSuggestions('')}
                      style={{ marginTop: 4, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                      閉じる
                    </button>
                  </div>
                )}

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
