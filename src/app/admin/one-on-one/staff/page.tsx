'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const GROWTH_STAGES = [
  { key: 'Lv1知る',       color: '#94a3b8' },
  { key: 'Lv2わかる',     color: '#60a5fa' },
  { key: 'Lv3行う',       color: '#fbbf24' },
  { key: 'Lv4できる',     color: '#4ade80' },
  { key: 'Lv5分かち合う', color: '#a78bfa' },
];

export default function OneOnOneStaffSummaryPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [staffMeetings, setStaffMeetings] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    fetch('/api/clinic/one-on-one')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setMeetings(d);
          const names = Array.from(new Set(d.map((m: any) => m.staff_name).filter(Boolean))) as string[];
          setStaffList(names);
          if (names.length > 0) {
            setSelectedStaff(names[0]);
          }
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedStaff) return;
    setLoadingStaff(true);
    fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(selectedStaff)}`)
      .then(r => r.json())
      .then(d => {
        setStaffMeetings(Array.isArray(d) ? d.sort((a: any, b: any) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()) : []);
        setLoadingStaff(false);
      });
  }, [selectedStaff]);

  const chartData = staffMeetings
    .filter(m => m.mindset_score || m.motivation_level)
    .map(m => ({
      date: new Date(m.meeting_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
      マインド: m.mindset_score || null,
      モチベーション: m.motivation_level || null,
    }));

  const cardStyle: React.CSSProperties = {
    padding: 16, background: 'var(--bg-secondary)',
    border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12,
  };

  const latestMeeting = staffMeetings[staffMeetings.length - 1];
  const avgMindset = staffMeetings.filter(m => m.mindset_score).length > 0
    ? Math.round(staffMeetings.reduce((s, m) => s + (m.mindset_score || 0), 0) / staffMeetings.filter(m => m.mindset_score).length)
    : null;
  const avgMotivation = staffMeetings.filter(m => m.motivation_level).length > 0
    ? Math.round(staffMeetings.reduce((s, m) => s + (m.motivation_level || 0), 0) / staffMeetings.filter(m => m.motivation_level).length)
    : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>🤝 スタッフ別 1on1サマリー</h1>
        <Link href="/admin/one-on-one" style={{ fontSize: 13, color: '#6c63ff', textDecoration: 'none' }}>← 1on1一覧へ</Link>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>スタッフごとの1on1履歴・成長推移をまとめて確認できます</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : staffList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <div>1on1の記録がまだありません</div>
          <Link href="/admin/one-on-one" style={{ display: 'inline-block', marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#6c63ff', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            1on1を記録する
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>

          {/* スタッフリスト */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>スタッフを選択</div>
            {staffList.map(name => (
              <button key={name} onClick={() => setSelectedStaff(name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid', marginBottom: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: selectedStaff === name ? 'rgba(108,99,255,0.12)' : 'var(--bg-secondary)',
                  color: selectedStaff === name ? '#6c63ff' : 'var(--text-primary)',
                  borderColor: selectedStaff === name ? 'rgba(108,99,255,0.4)' : 'var(--border)',
                }}>
                {name}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                  {meetings.filter(m => m.staff_name === name).length}回
                </div>
              </button>
            ))}
          </div>

          {/* サマリー */}
          <div>
            {loadingStaff ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
            ) : (
              <>
                {/* サマリーカード */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>総回数</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#6c63ff' }}>{staffMeetings.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>回</div>
                  </div>
                  <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>平均マインド</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: avgMindset ? (avgMindset >= 70 ? '#4ade80' : avgMindset >= 50 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)' }}>
                      {avgMindset ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</div>
                  </div>
                  <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>平均やる気</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: avgMotivation ? (avgMotivation >= 70 ? '#4ade80' : avgMotivation >= 50 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)' }}>
                      {avgMotivation ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</div>
                  </div>
                </div>

                {/* 成長グラフ */}
                {chartData.length >= 1 && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12 }}>📈 成長推移グラフ</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,99,255,0.1)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="マインド" stroke="#6c63ff" strokeWidth={2} dot={{ r: 5 }} connectNulls />
                        <Line type="monotone" dataKey="モチベーション" stroke="#4ade80" strokeWidth={2} dot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 最新のAI分析 */}
                {latestMeeting?.ai_analysis && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                      🤖 最新AI分析（{new Date(latestMeeting.meeting_date).toLocaleDateString('ja-JP')}）
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{latestMeeting.ai_analysis}</div>
                  </div>
                )}

                {/* 1on1履歴一覧 */}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, marginTop: 4 }}>📋 1on1履歴（新しい順）</div>
                {[...staffMeetings].reverse().map(m => {
                  const stage = GROWTH_STAGES.find(s => s.key === m.growth_stage);
                  return (
                    <div key={m.id} style={cardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {new Date(m.meeting_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {m.mindset_score && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontWeight: 700 }}>
                              マインド {m.mindset_score}
                            </span>
                          )}
                          {m.motivation_level && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontWeight: 700 }}>
                              やる気 {m.motivation_level}
                            </span>
                          )}
                          {stage && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${stage.color}20`, color: stage.color, fontWeight: 700 }}>
                              {stage.key}
                            </span>
                          )}
                        </div>
                      </div>
                      {m.goals && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>🎯 目標：{m.goals}</div>}
                      {m.achievements && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>✨ 成果：{m.achievements}</div>}
                      {m.challenges && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>⚡ 課題：{m.challenges}</div>}
                      {m.action_items && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                          📌 アクション：{m.action_items}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
