'use client';
import { useState, useEffect } from 'react';

const parseJson = (v: any): any[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

const DETAIL_TABS = [
  { key: 'skills', label: '🎯 スキル', field: 'skills' },
  { key: 'knowledge', label: '📚 知識', field: 'knowledge' },
  { key: 'mindset', label: '💡 マインド', field: 'mindset' },
  { key: 'continuous_learning', label: '📖 継続学習', field: 'continuous_learning' },
  { key: 'required_certifications', label: '🏅 資格', field: 'required_certifications' },
  { key: 'promotion_exam', label: '📝 昇格試験', field: 'promotion_exam' },
] as const;

export default function StaffGradePage() {
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGradeIdx, setSelectedGradeIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('skills');

  useEffect(() => {
    fetch('/api/clinic/grades')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setGrades(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (grades.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級データがありません</div>;

  const selectedGrade = grades[selectedGradeIdx];
  const currentTab = DETAIL_TABS.find(t => t.key === activeTab) || DETAIL_TABS[0];
  const items = parseJson(selectedGrade[currentTab.field]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📊 等級制度</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>各等級の要件と詳細</p>

      <div style={{ marginBottom: 20, padding: 12, borderRadius: 12, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
        <div style={{ fontSize: 12, color: '#14b8a6', lineHeight: 1.7 }}>
          ✨ この等級は「上下の位置」ではなく「あなたの関わりの広がり」を表しています。全員がアンバサダー（G5）を目指して成長しましょう。
        </div>
      </div>

      {/* 等級タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {grades.map((g, i) => (
          <button
            key={g.id}
            onClick={() => { setSelectedGradeIdx(i); setActiveTab('skills'); }}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: i === selectedGradeIdx ? '#fff' : 'var(--text-secondary)',
              background: i === selectedGradeIdx ? '#6c63ff' : 'var(--bg-secondary)',
              border: i === selectedGradeIdx ? '1px solid #6c63ff' : '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* 選択中の等級情報 */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedGrade.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>レベル {selectedGrade.level_number}</div>
          </div>
          {(selectedGrade.position || selectedGrade.role) && (
            <div style={{ textAlign: 'right' }}>
              {selectedGrade.position && <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600 }}>{selectedGrade.position}</div>}
              {selectedGrade.role && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{selectedGrade.role}</div>}
            </div>
          )}
        </div>
        {selectedGrade.description && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{selectedGrade.description}</div>
        )}
        {(selectedGrade.salary_min || selectedGrade.salary_max) && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            💰 給与レンジ: {selectedGrade.salary_min ? `${Number(selectedGrade.salary_min).toLocaleString()}円` : '—'} 〜 {selectedGrade.salary_max ? `${Number(selectedGrade.salary_max).toLocaleString()}円` : '—'}
          </div>
        )}
      </div>

      {/* 詳細タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {DETAIL_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
              background: activeTab === tab.key ? '#6c63ff' : 'transparent',
              border: activeTab === tab.key ? '1px solid #6c63ff' : '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* タブ内容 */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        minHeight: 150,
      }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>データが登録されていません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item: any, i: number) => (
              <div key={i} style={{
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
              }}>
                {typeof item === 'string' ? item : (item.name || item.title || item.label || JSON.stringify(item))}
                {typeof item === 'object' && item.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
