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
  const [selectedStage, setSelectedStage] = useState<any>(null);
  const [careerPosition, setCareerPosition] = useState('');

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
        <div>
          {grades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級を先に登録してください</div>
          ) : (
            <>
              {/* 職種タブ */}
              {positions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  <button onClick={() => setCareerPosition('')} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: !careerPosition ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: !careerPosition ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${!careerPosition ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>全職種</button>
                  {positions.map(p => (
                    <button key={p.id} onClick={() => setCareerPosition(p.name)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: careerPosition === p.name ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: careerPosition === p.name ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${careerPosition === p.name ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{p.name}</button>
                  ))}
                </div>
              )}

              {/* ステップ表示 */}
              <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 'max-content' }}>
                  {grades.map((g, i) => {
                    const skills = (() => { try { return JSON.parse(g.skills || '[]'); } catch { return []; } })();
                    const salary = g.salary_min ? `${Math.round(g.salary_min / 10000)}〜${Math.round(g.salary_max / 10000)}万` : null;
                    const role = g.role || (roles[Math.min(i, roles.length - 1)]?.name || '—');
                    const isSelected = selectedStage?.id === g.id;

                    return (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div onClick={() => setSelectedStage(isSelected ? null : g)} style={{
                          width: 176, padding: 14, borderRadius: 14,
                          border: `2px solid ${isSelected ? '#6c63ff' : 'rgba(108,99,255,0.2)'}`,
                          background: isSelected ? 'rgba(108,99,255,0.08)' : 'var(--bg-secondary)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(108,99,255,0.15)', color: '#6c63ff' }}>Grade {g.level_number}</span>
                            {salary && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{salary}</span>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{g.name}</div>
                          <div style={{ fontSize: 12, color: '#6c63ff', marginBottom: 6 }}>👤 {role}</div>
                          {skills.slice(0, 2).map((s: string, j: number) => (
                            <div key={j} style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {s}</div>
                          ))}
                        </div>
                        {i < grades.length - 1 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 22, color: 'rgba(108,99,255,0.4)' }}>→</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>成長</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 選択したステージの詳細 */}
              {selectedStage && (
                <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '2px solid rgba(108,99,255,0.3)', borderRadius: 16, marginTop: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Grade {selectedStage.level_number} {selectedStage.name} の詳細</div>
                  {selectedStage.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>{selectedStage.description}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: '🎯 スキル要件', data: selectedStage.skills },
                      { label: '📚 知識要件', data: selectedStage.knowledge },
                      { label: '💡 マインド要件', data: selectedStage.mindset },
                      { label: '🏅 必要資格', data: selectedStage.required_certifications },
                    ].map(section => {
                      const items = parseJson(section.data);
                      return items.length > 0 ? (
                        <div key={section.label} style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{section.label}</div>
                          {items.map((item: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>• {item}</div>)}
                        </div>
                      ) : null;
                    })}
                  </div>
                  {selectedStage.requirements_promotion && (
                    <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📈 昇格条件</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedStage.requirements_promotion}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
