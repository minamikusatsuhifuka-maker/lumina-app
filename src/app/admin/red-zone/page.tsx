'use client';
import { useState, useEffect } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

const CATEGORIES = [
  { key: 'all', label: '全て', icon: '📋' },
  { key: 'harassment', label: 'ハラスメント', icon: '⚠️' },
  { key: 'attitude', label: '態度の問題', icon: '😤' },
  { key: 'legal', label: '法的問題', icon: '⚖️' },
  { key: 'moral', label: 'モラル', icon: '🚫' },
  { key: 'work', label: '職務上', icon: '💼' },
];

type RedZone = {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  consequence: string;
};

export default function RedZonePage() {
  const [rules, setRules] = useState<RedZone[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // 手動追加
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ category: 'attitude', title: '', description: '', severity: 'critical', consequence: '' });

  useEffect(() => {
    fetch('/api/clinic/red-zone').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setRules(d);
      setLoading(false);
    });
  }, []);

  const generateSuggestions = async () => {
    setGenerating(true); setMessage(''); setSuggestions([]);
    try {
      const res = await fetch('/api/clinic/red-zone/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (data.redZones) { setSuggestions(data.redZones); }
      else { setMessage(data.error || '生成に失敗しました'); }
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const adoptSuggestion = async (s: any) => {
    setSaving(s.title);
    try {
      const res = await fetch('/api/clinic/red-zone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => [...prev, { ...s, id: data.id }]);
        setSuggestions(prev => prev.filter(p => p.title !== s.title));
        setMessage(`「${s.title}」を採用しました`);
      }
    } finally { setSaving(null); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('このレッドゾーンルールを削除しますか？')) return;
    await fetch('/api/clinic/red-zone', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleAddSubmit = async () => {
    if (!addForm.title || !addForm.description) return;
    setSaving('add');
    try {
      const res = await fetch('/api/clinic/red-zone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm) });
      const data = await res.json();
      if (data.success) {
        setRules(prev => [...prev, { ...addForm, id: data.id }]);
        setAddForm({ category: 'attitude', title: '', description: '', severity: 'critical', consequence: '' });
        setShowAdd(false);
        setMessage('追加しました');
      }
    } finally { setSaving(null); }
  };

  const filtered = catFilter === 'all' ? rules : rules.filter(r => r.category === catFilter);

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🚫 レッドゾーン管理</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>絶対に許容されない行動・態度を定義します</p>
      <div style={{ padding: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#ef4444', marginBottom: 20, lineHeight: 1.6 }}>
        これらの行動は当クリニックで絶対に許容されません。該当した場合は退職勧告または即時解雇となります。
      </div>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* アクションボタン */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={generateSuggestions} disabled={generating} style={{
          padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          {generating ? '生成中...' : '🤖 AIにレッドゾーンを提案してもらう'}
        </button>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
        }}>
          ➕ 手動で追加
        </button>
      </div>

      {/* 手動追加フォーム */}
      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>レッドゾーンを追加</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>カテゴリ</label>
              <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle }}>
                {CATEGORIES.filter(c => c.key !== 'all').map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>重大度</label>
              <select value={addForm.severity} onChange={e => setAddForm(p => ({ ...p, severity: e.target.value }))} style={{ ...inputStyle }}>
                <option value="critical">即時退職勧告</option>
                <option value="serious">警告→改善なければ退職</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>タイトル</label>
            <input value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="例：パワーハラスメント" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>説明</label>
            <textarea value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="具体的な行動の説明" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>処遇・結果</label>
            <input value={addForm.consequence} onChange={e => setAddForm(p => ({ ...p, consequence: e.target.value }))} style={inputStyle} placeholder="例：即時退職勧告・法的措置" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAddSubmit} disabled={saving === 'add' || !addForm.title || !addForm.description} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {saving === 'add' ? '保存中...' : '💾 保存'}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* AI提案一覧 */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🤖 AI提案（{suggestions.length}件）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ ...cardStyle, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: s.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: s.severity === 'critical' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                      {s.severity === 'critical' ? '即退職' : '警告→退職'}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {CATEGORIES.find(c => c.key === s.category)?.label || s.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.description}</div>
                  {s.consequence && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>処遇：{s.consequence}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => adoptSuggestion(s)} disabled={saving === s.title} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {saving === s.title ? '...' : '✅ 採用'}
                  </button>
                  <button onClick={() => setSuggestions(prev => prev.filter((_, j) => j !== i))} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                    ✕ 却下
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* カテゴリタブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCatFilter(c.key)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: catFilter === c.key ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: catFilter === c.key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${catFilter === c.key ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>{c.icon} {c.label}{c.key !== 'all' ? ` (${rules.filter(r => r.category === c.key).length})` : ` (${rules.length})`}</button>
        ))}
      </div>

      {/* 登録済みルール一覧 */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(rule => (
            <div key={rule.id} style={{ ...cardStyle, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: rule.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: rule.severity === 'critical' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                      {rule.severity === 'critical' ? '即退職勧告' : '警告→退職'}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {CATEGORIES.find(c => c.key === rule.category)?.label || rule.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{rule.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rule.description}</div>
                  {rule.consequence && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>処遇：{rule.consequence}</div>}
                </div>
                <button onClick={() => deleteRule(rule.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px 8px' }}>✕ 削除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          レッドゾーンが登録されていません。AIに提案してもらいましょう。
        </div>
      )}

      <AIDialogueButton contextType="evaluation" contextLabel="レッドゾーン・退職勧告基準" />
    </div>
  );
}
