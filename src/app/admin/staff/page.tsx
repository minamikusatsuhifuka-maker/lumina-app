'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Staff = {
  id: string; name: string; name_kana: string; position: string;
  department: string; hired_at: string; status: string; current_grade_id: string;
};

export default function StaffListPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPos, setFilterPos] = useState('すべて');

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontSize: 16 }}>スタッフが登録されていません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>「＋ 新規スタッフ登録」から追加してください</div>
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
    </div>
  );
}
