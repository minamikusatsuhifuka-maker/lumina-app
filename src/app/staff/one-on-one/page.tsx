'use client';
import { useState, useEffect } from 'react';

const GROWTH_STAGE_COLORS: Record<string, string> = {
  'Lv1知る': '#94a3b8',
  'Lv2わかる': '#60a5fa',
  'Lv3行う': '#fbbf24',
  'Lv4できる': '#4ade80',
  'Lv5分かち合う': '#a78bfa',
};

export default function StaffOneOnOnePage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState('');

  useEffect(() => {
    // 自分の名前を取得してから1on1を取得
    fetch('/api/clinic/staff/my-grade')
      .then(r => r.json())
      .then(d => {
        const name = d.name || '';
        setMyName(name);
        if (name) {
          return fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(name)}`)
            .then(r => r.json())
            .then(data => {
              if (Array.isArray(data)) {
                setMeetings(data.sort((a: any, b: any) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()));
              }
            });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🤝 1on1の振り返り</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>院長との面談記録を振り返り、自分の成長を確認しましょう</p>

      {meetings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>まだ1on1の記録がありません</div>
          <div style={{ fontSize: 13 }}>院長との面談後、ここに記録が表示されます</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexDirection: selected ? 'row' : 'column' }}>
          {/* 記録一覧 */}
          <div style={{ flex: selected ? '0 0 280px' : '1', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meetings.map(m => (
              <div key={m.id} onClick={() => setSelected(selected?.id === m.id ? null : m)}
                style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: selected?.id === m.id ? '1px solid rgba(108,99,255,0.4)' : '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {new Date(m.meeting_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  {m.growth_stage && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: (GROWTH_STAGE_COLORS[m.growth_stage] || '#94a3b8') + '20', color: GROWTH_STAGE_COLORS[m.growth_stage] || '#94a3b8' }}>
                      {m.growth_stage}
                    </span>
                  )}
                </div>
                {m.achievements && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {m.achievements.slice(0, 60)}{m.achievements.length > 60 ? '...' : ''}
                  </div>
                )}
                {(m.mindset_score || m.motivation_level) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {m.mindset_score && <span style={{ fontSize: 10, color: '#6c63ff' }}>マインド {m.mindset_score}/10</span>}
                    {m.motivation_level && <span style={{ fontSize: 10, color: '#4ade80' }}>意欲 {m.motivation_level}/10</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 詳細パネル */}
          {selected && (
            <div style={{ flex: 1, padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, alignSelf: 'flex-start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {new Date(selected.meeting_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
              </div>

              {[
                { label: '🎯 目標・テーマ', value: selected.goals },
                { label: '✨ 達成・成長したこと', value: selected.achievements },
                { label: '💬 話し合った内容', value: selected.discussion },
                { label: '🔍 課題・困っていること', value: selected.challenges },
                { label: '📌 次回までのアクション', value: selected.action_items },
              ].filter(item => item.value).map(item => (
                <div key={item.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {item.value}
                  </div>
                </div>
              ))}

              {selected.ai_analysis && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>🤖 AI分析</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{selected.ai_analysis}</div>
                </div>
              )}

              {selected.next_meeting_date && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, fontSize: 12, color: '#4ade80' }}>
                  📅 次回：{new Date(selected.next_meeting_date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
