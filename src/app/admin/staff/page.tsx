'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

type Staff = {
  id: string; name: string; name_kana: string; position: string;
  department: string; hired_at: string; status: string; current_grade_id: string;
  current_grade_label?: string; grade_level_number?: number;
};

export default function StaffListPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPos, setFilterPos] = useState('すべて');
  const [viewMode, setViewMode] = useState<'card' | 'grade'>('card');

  useEffect(() => {
    fetch('/api/clinic/staff').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setStaff(data);
      setLoading(false);
    });
  }, []);

  const positions = ['すべて', ...Array.from(new Set(staff.map(s => s.position).filter(Boolean)))];
  const filtered = staff.filter(s => {
    const matchSearch = !search || s.name?.includes(search) || s.name_kana?.includes(search);
    const matchPos = filterPos === 'すべて' || s.position === filterPos;
    return matchSearch && matchPos;
  });

  const calcYears = (hiredAt: string) => {
    if (!hiredAt) return '';
    const diff = Date.now() - new Date(hiredAt).getTime();
    const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor((diff % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    return years > 0 ? `${years}年${months}ヶ月` : `${months}ヶ月`;
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>👥 スタッフ管理</h1>
        <Link href="/admin/staff/new" style={{
          padding: '9px 18px', borderRadius: 8, border: 'none', textDecoration: 'none',
          background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          ＋ 新規スタッフ登録
        </Link>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>スタッフの基本情報・書類・成長記録を管理</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 名前・フリガナで検索"
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        <select value={filterPos} onChange={e => setFilterPos(e.target.value)}
          style={{ padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ビュー切替 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { k: 'card', l: '🃏 カード表示' },
          { k: 'grade', l: '🏅 等級別表示' },
        ].map(v => (
          <button key={v.k} onClick={() => setViewMode(v.k as any)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: viewMode === v.k ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: viewMode === v.k ? '#6c63ff' : 'var(--text-muted)', borderColor: viewMode === v.k ? 'rgba(108,99,255,0.3)' : 'var(--border)' }}>
            {v.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontSize: 16 }}>スタッフが登録されていません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>「＋ 新規スタッフ登録」から追加してください</div>
        </div>
      ) : viewMode === 'grade' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[5, 4, 3, 2, 1, null].map(gradeNum => {
            const gradeStaff = filtered.filter(s =>
              gradeNum === null
                ? !s.grade_level_number
                : s.grade_level_number === gradeNum
            );
            if (gradeStaff.length === 0) return null;

            const GRADE_COLORS: Record<string, string> = {
              '5': '#8b5cf6', '4': '#06b6d4', '3': '#4ade80', '2': '#60a5fa', '1': '#94a3b8',
            };
            const color = gradeNum ? GRADE_COLORS[String(gradeNum)] : '#6b7280';
            const label = gradeStaff[0]?.current_grade_label || (gradeNum ? `G${gradeNum}` : '等級未設定');

            return (
              <div key={gradeNum ?? 'none'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: color + '20', color }}>{label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{gradeStaff.length}名</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {gradeStaff.map(s => (
                    <Link key={s.id} href={`/admin/staff/${s.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: `1px solid ${color}30`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {s.name?.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.position || '職種未設定'}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map(s => (
            <Link key={s.id} href={`/admin/staff/${s.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                    {s.name?.charAt(0)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</div>
                    {s.name_kana && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.name_kana}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                  {s.position && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{s.position}</span>}
                  {s.department && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{s.department}</span>}
                </div>
                {s.hired_at && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    入職: {new Date(s.hired_at).toLocaleDateString('ja-JP')}（{calcYears(s.hired_at)}）
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <AIDialogueButton contextType="staff" contextLabel="スタッフ育成・採用相談" />
    </div>
  );
}
