'use client';
import { useState, useEffect } from 'react';

type Tab = 'position' | 'role' | 'careermap';

export default function DefinitionsPage() {
  const [tab, setTab] = useState<Tab>('position');
  const [positions, setPositions] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // 新規追加
  const [newName, setNewName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    const [p, r, g] = await Promise.all([
      fetch('/api/clinic/position-definitions').then(r => r.json()),
      fetch('/api/clinic/role-definitions').then(r => r.json()),
      fetch('/api/clinic/grades').then(r => r.json()),
    ]);
    if (Array.isArray(p)) setPositions(p);
    if (Array.isArray(r)) setRoles(r);
    if (Array.isArray(g)) setGrades(g);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const parseJson = (v: any) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };

  const generatePosition = async () => {
    if (!newName.trim()) return;
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/position-definitions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positionName: newName }) });
      const data = await res.json();
      if (data.name) setPreview({ ...data, type: 'position' });
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const generateRole = async () => {
    if (!newName.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/clinic/role-definitions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleName: newName, levelOrder: roles.length + 1 }) });
      const data = await res.json();
      if (data.name) setPreview({ ...data, type: 'role' });
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const savePreview = async () => {
    if (!preview) return;
    setSaving(true);
    const endpoint = preview.type === 'position' ? '/api/clinic/position-definitions' : '/api/clinic/role-definitions';
    const body = preview.type === 'position'
      ? { name: preview.name, description: preview.description, responsibilities: JSON.stringify(preview.responsibilities || []), requiredBaseSkills: JSON.stringify(preview.requiredBaseSkills || []), careerPath: preview.careerPath }
      : { name: preview.name, levelOrder: preview.levelOrder || roles.length + 1, description: preview.description, responsibilities: JSON.stringify(preview.responsibilities || []), authority: preview.authority, leadershipRequirements: preview.leadershipRequirements };
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setPreview(null); setNewName(''); fetchAll(); setSaving(false);
  };

  const cardStyle: React.CSSProperties = { padding: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📌 職種・役職定義</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>クリニックの職種・役職を定義し、等級制度と連携</p>

      {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([{ key: 'position' as Tab, label: '職種定義' }, { key: 'role' as Tab, label: '役職定義' }, { key: 'careermap' as Tab, label: 'キャリアマップ' }]).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPreview(null); setNewName(''); }} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === t.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
            color: tab === t.key ? '#6c63ff' : 'var(--text-muted)',
            border: `1px solid ${tab === t.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* 職種定義 */}
      {tab === 'position' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="職種名（例：看護師）" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={generatePosition} disabled={generating || !newName.trim()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{generating ? '生成中...' : '🤖 AIで生成'}</button>
          </div>

          {preview?.type === 'position' && (
            <div style={{ ...cardStyle, marginBottom: 16, border: '1px solid rgba(108,99,255,0.3)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{preview.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{preview.description}</div>
              {preview.responsibilities?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>責務: {preview.responsibilities.join(' / ')}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={savePreview} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '保存中...' : '✅ 保存'}</button>
                <button onClick={() => setPreview(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
              </div>
            </div>
          )}

          {positions.map(p => (
            <div key={p.id} style={{ ...cardStyle, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p.description}</div>
              {parseJson(p.responsibilities).length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>責務: {parseJson(p.responsibilities).join(' / ')}</div>}
              {p.career_path && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>キャリアパス: {p.career_path}</div>}
            </div>
          ))}
          {positions.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>職種が登録されていません</div>}
        </div>
      )}

      {/* 役職定義 */}
      {tab === 'role' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="役職名（例：リーダー）" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={generateRole} disabled={generating || !newName.trim()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{generating ? '生成中...' : '🤖 AIで生成'}</button>
          </div>

          {preview?.type === 'role' && (
            <div style={{ ...cardStyle, marginBottom: 16, border: '1px solid rgba(108,99,255,0.3)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{preview.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{preview.description}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={savePreview} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '保存中...' : '✅ 保存'}</button>
                <button onClick={() => setPreview(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
              </div>
            </div>
          )}

          {roles.map(r => (
            <div key={r.id} style={{ ...cardStyle, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontWeight: 700 }}>{r.level_order}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{r.description}</div>
            </div>
          ))}
          {roles.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>役職が登録されていません</div>}
        </div>
      )}

      {/* キャリアマップ */}
      {tab === 'careermap' && (
        <div style={{ overflowX: 'auto' }}>
          {grades.length === 0 || positions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>職種と等級を先に登録してください</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>職種</th>
                  {grades.map(g => <th key={g.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'center', color: '#6c63ff', fontWeight: 700 }}>Lv.{g.level_number}<br />{g.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.id}>
                    <td style={{ padding: '10px 12px', border: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</td>
                    {grades.map(g => (
                      <td key={g.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {g.role || (roles[Math.min(g.level_number - 1, roles.length - 1)]?.name || '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
