'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

type Staff = {
  id: string; name: string; name_kana: string; position: string;
  department: string; hired_at: string; status: string; current_grade_id: string;
};

type StaffMetric = {
  last_meeting_days: number | null;
  last_mindset_score: number | null;
  last_growth_stage: string | null;
  current_grade_label: string | null;
  grade_level_number: number | null;
};

const STAGE_COLORS: Record<string, string> = {
  'Lv1知る': '#94a3b8',
  'Lv2わかる': '#60a5fa',
  'Lv3行う': '#fbbf24',
  'Lv4できる': '#4ade80',
  'Lv5分かち合う': '#a78bfa',
};

const STAGES = ['すべて', 'Lv1知る', 'Lv2わかる', 'Lv3行う', 'Lv4できる', 'Lv5分かち合う'];

export default function StaffListPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [metrics, setMetrics] = useState<Record<string, StaffMetric>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPos, setFilterPos] = useState('すべて');
  const [filterStage, setFilterStage] = useState('すべて');
  const [filterStatus, setFilterStatus] = useState<'all' | 'follow'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'grade'>('card');

  useEffect(() => {
    Promise.all([
      fetch('/api/clinic/staff').then(r => r.json()),
      fetch('/api/clinic/staff/summary').then(r => r.json()).catch(() => ({ summary: [] })),
    ]).then(([staffData, summaryData]) => {
      if (Array.isArray(staffData)) setStaff(staffData);
      if (summaryData?.summary) {
        const map: Record<string, StaffMetric> = {};
        summaryData.summary.forEach((s: any) => {
          map[s.id] = {
            last_meeting_days: s.last_meeting_days,
            last_mindset_score: s.last_mindset_score,
            last_growth_stage: s.last_growth_stage,
            current_grade_label: s.current_grade_label,
            grade_level_number: s.grade_level_number,
          };
        });
        setMetrics(map);
      }
      setLoading(false);
    });
  }, []);

  const positions = ['すべて', ...Array.from(new Set(staff.map(s => s.position).filter(Boolean)))];

  const needsFollow = (s: Staff) => {
    const m = metrics[s.id];
    if (!m) return false;
    return m.last_meeting_days === null || m.last_meeting_days > 30;
  };

  const filtered = staff.filter(s => {
    const matchSearch = !search || s.name?.includes(search) || s.name_kana?.includes(search);
    const matchPos = filterPos === 'すべて' || s.position === filterPos;
    const m = metrics[s.id];
    const matchStage = filterStage === 'すべて' || m?.last_growth_stage === filterStage;
    const matchStatus = filterStatus === 'all' || needsFollow(s);
    return matchSearch && matchPos && matchStage && matchStatus;
  });

  const followCount = staff.filter(needsFollow).length;

  const calcYears = (hiredAt: string) => {
    if (!hiredAt) return '';
    const diff = Date.now() - new Date(hiredAt).getTime();
    const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor((diff % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    return years > 0 ? `${years}年${months}ヶ月` : `${months}ヶ月`;
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>👥 スタッフ支援</h1>
        <Link href="/admin/staff/new" style={{ padding: '9px 18px', borderRadius: 8, border: 'none', textDecoration: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          ＋ 新規スタッフ登録
        </Link>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>スタッフの成長・基本情報・書類・記録を支援</p>

      {/* フォロー必要アラート */}
      {followCount > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: '#d97706', flex: 1 }}>
            <strong>{followCount}名</strong>のスタッフが30日以上1on1未実施です
          </span>
          <button onClick={() => setFilterStatus(filterStatus === 'follow' ? 'all' : 'follow')}
            style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: filterStatus === 'follow' ? '#f59e0b' : 'rgba(245,158,11,0.2)', color: filterStatus === 'follow' ? '#fff' : '#d97706', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {filterStatus === 'follow' ? '全員表示' : '該当者だけ見る'}
          </button>
        </div>
      )}

      {/* 検索・フィルター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 名前・フリガナで検索"
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        <select value={filterPos} onChange={e => setFilterPos(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
          {STAGES.map(s => <option key={s} value={s}>{s === 'すべて' ? '🌱 成長ステージ' : s}</option>)}
        </select>
      </div>

      {/* 表示切り替えタブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ key: 'card', label: '👤 カード表示' }, { key: 'grade', label: '🏅 等級別表示' }].map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key as any)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: viewMode === v.key ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)', borderColor: viewMode === v.key ? '#6c63ff' : 'var(--border)', color: viewMode === v.key ? '#6c63ff' : 'var(--text-muted)' }}>
            {v.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{filtered.length}名表示中</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15 }}>該当するスタッフがいません</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(s => {
            const m = metrics[s.id];
            const follow = needsFollow(s);
            const stageColor = m?.last_growth_stage ? STAGE_COLORS[m.last_growth_stage] || '#94a3b8' : null;
            const mindScore = m?.last_mindset_score;
            const days = m?.last_meeting_days;

            return (
              <Link key={s.id} href={`/admin/staff/${s.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: 16, background: 'var(--bg-secondary)',
                  border: `1.5px solid ${follow ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                  borderRadius: 14, cursor: 'pointer', transition: 'border-color 0.15s',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* フォロー必要バッジ */}
                  {follow && (
                    <div style={{ position: 'absolute', top: 10, right: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', fontSize: 10, fontWeight: 700, color: '#d97706' }}>
                      要フォロー
                    </div>
                  )}

                  {/* スタッフ名・アバター */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                      {s.name?.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.position}{s.department ? ` / ${s.department}` : ''}</div>
                    </div>
                  </div>

                  {/* バッジ行 */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {m?.current_grade_label && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', border: '1px solid rgba(108,99,255,0.2)' }}>
                        🏅 {m.current_grade_label}
                      </span>
                    )}
                    {m?.last_growth_stage && stageColor && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}35` }}>
                        🌱 {m.last_growth_stage}
                      </span>
                    )}
                    {s.hired_at && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        {calcYears(s.hired_at)}
                      </span>
                    )}
                  </div>

                  {/* マインドスコアバー */}
                  {mindScore !== null && mindScore !== undefined && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                        <span>🧠 マインドスコア</span>
                        <span style={{ fontWeight: 600, color: mindScore >= 8 ? '#4ade80' : mindScore >= 5 ? '#6c63ff' : '#f59e0b' }}>{mindScore}/10</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(mindScore / 10) * 100}%`, height: '100%', background: mindScore >= 8 ? '#4ade80' : mindScore >= 5 ? '#6c63ff' : '#f59e0b', borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}

                  {/* 最終1on1 */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: days === null ? '#ef4444' : days > 30 ? '#f59e0b' : '#4ade80' }}>
                    🤝 最終1on1：{days === null ? '未実施' : days === 0 ? '今日' : `${days}日前`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AIDialogueButton contextType="staff" contextLabel="スタッフ育成・採用相談" />
    </div>
  );
}
