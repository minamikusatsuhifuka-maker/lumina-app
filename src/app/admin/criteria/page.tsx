'use client';
import { useState, useEffect } from 'react';
import { AITextReviser } from '@/components/clinic/AITextReviser';

const CATS = [
  { key: '', label: '全て' }, { key: 'philosophy', label: '理念' }, { key: 'grade', label: '等級' },
  { key: 'evaluation', label: '評価' }, { key: 'strategy', label: '戦略' }, { key: 'hiring', label: '採用' },
  { key: 'mindset', label: 'マインド' }, { key: 'handbook', label: 'ハンドブック' }, { key: 'growth', label: '成長哲学' },
];

export default function CriteriaPage() {
  const [criteria, setCriteria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState('philosophy');
  const [newText, setNewText] = useState('');
  const [newPri, setNewPri] = useState(5);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editPri, setEditPri] = useState(5);

  const fetchData = () => { fetch('/api/clinic/criteria').then(r => r.json()).then(d => { if (Array.isArray(d)) setCriteria(d); setLoading(false); }); };
  useEffect(() => { fetchData(); }, []);

  const filtered = filterCat ? criteria.filter(c => c.category === filterCat) : criteria;

  const add = async () => {
    if (!newText.trim()) return;
    await fetch('/api/clinic/criteria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: newCat, criterion: newText, priority: newPri }) });
    setNewText(''); setShowAdd(false); fetchData();
  };

  const save = async (id: string) => {
    await fetch('/api/clinic/criteria', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, criterion: editText, priority: editPri }) });
    setEditId(null); fetchData();
  };

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch('/api/clinic/criteria', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchData();
  };

  const catLabel = (cat: string) => CATS.find(c => c.key === cat)?.label || cat;
  const inputStyle: React.CSSProperties = { padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🧭 AIの判断基準</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>＋ 手動で追加</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>AIとの対話から蓄積された院長の価値観・判断基準。全APIのプロンプトに自動反映されます。</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATS.map(c => (
          <button key={c.key} onClick={() => setFilterCat(c.key)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filterCat === c.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: filterCat === c.key ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${filterCat === c.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{c.label}</button>
        ))}
      </div>

      {showAdd && (
        <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} style={{ ...inputStyle, width: 120 }}>{CATS.filter(c => c.key).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="判断基準を入力" style={{ ...inputStyle, flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>重要度</span>
              <input type="range" min={1} max={10} value={newPri} onChange={e => setNewPri(Number(e.target.value))} style={{ width: 60 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', width: 20 }}>{newPri}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={add} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>追加</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🧭</div><div>判断基準がまだありません</div><div style={{ fontSize: 13, marginTop: 8 }}>各ページの「AIと対話」で自動蓄積されます</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {editId === c.id ? (
                <div>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const }} />
                  <AITextReviser text={editText} onRevised={(revised) => setEditText(revised)} defaultPurpose="philosophy" purposes={['philosophy', 'teal', 'warm', 'simple']} compact={true} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>重要度</span>
                      <input type="range" min={1} max={10} value={editPri} onChange={e => setEditPri(Number(e.target.value))} style={{ width: 60 }} />
                      <span style={{ fontSize: 12, color: '#6c63ff', width: 16 }}>{editPri}</span>
                    </div>
                    <button onClick={() => save(c.id)} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>💾 保存</button>
                    <button onClick={() => setEditId(null)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontWeight: 600 }}>{catLabel(c.category)}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>重要度 {c.priority}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.5 }}>{c.criterion}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 10 }}>
                    <button onClick={() => { setEditId(c.id); setEditText(c.criterion); setEditPri(c.priority); }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => del(c.id)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
