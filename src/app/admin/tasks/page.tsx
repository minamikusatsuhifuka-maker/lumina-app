'use client';
import { useState, useEffect } from 'react';

const STATUS_COLS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: '📝 ToDo', in_progress: '🔄 進行中', done: '✅ 完了' };
const PRI_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f5a623', low: '#4ade80' };

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [filterPri, setFilterPri] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [saving, setSaving] = useState(false);

  const fetchTasks = () => { fetch('/api/clinic/tasks').then(r => r.json()).then(d => { if (Array.isArray(d)) setTasks(d); setLoading(false); }); };
  useEffect(() => { fetchTasks(); }, []);

  const filtered = tasks.filter(t => {
    if (filterPri && t.priority !== filterPri) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (search && !t.title?.includes(search) && !t.assignee_name?.includes(search)) return false;
    return true;
  });

  const byStatus = (s: string) => filtered.filter(t => t.status === s);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/clinic/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchTasks();
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    await fetch('/api/clinic/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle, assigneeName: newAssignee, priority: newPriority }) });
    setNewTitle(''); setNewAssignee(''); setShowAdd(false); fetchTasks(); setSaving(false);
  };

  const deleteTask = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch(`/api/clinic/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  };

  const inputStyle: React.CSSProperties = { padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>✅ タスク管理</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setViewMode(viewMode === 'kanban' ? 'table' : 'kanban')} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>{viewMode === 'kanban' ? '📋 テーブル' : '📝 カンバン'}</button>
          <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>＋ タスク追加</button>
        </div>
      </div>

      {/* フィルター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 検索" style={{ ...inputStyle, width: 180 }} />
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={inputStyle}><option value="">優先度: 全て</option><option value="high">🔴 高</option><option value="medium">🟡 中</option><option value="low">🟢 低</option></select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}><option value="">状態: 全て</option><option value="todo">ToDo</option><option value="in_progress">進行中</option><option value="done">完了</option></select>
      </div>

      {showAdd && (
        <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="タスクタイトル" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
          <input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} placeholder="担当者" style={{ ...inputStyle, width: 120 }} />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={inputStyle}><option value="high">🔴 高</option><option value="medium">🟡 中</option><option value="low">🟢 低</option></select>
          <button onClick={addTask} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '...' : '追加'}</button>
          <button onClick={() => setShowAdd(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : viewMode === 'kanban' ? (
        <div style={{ display: 'flex', gap: 14 }}>
          {STATUS_COLS.map(s => (
            <div key={s} style={{ flex: 1, minWidth: 250 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>{STATUS_LABELS[s]}（{byStatus(s).length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byStatus(s).map(t => (
                  <div key={t.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t.title}</div>
                    <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {t.assignee_name && <span>{t.assignee_name}</span>}
                      <span style={{ color: PRI_COLORS[t.priority] }}>{t.priority}</span>
                      {t.due_date && <span>〜{new Date(t.due_date).toLocaleDateString('ja-JP')}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {s !== 'todo' && <button onClick={() => updateStatus(t.id, 'todo')} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 9, cursor: 'pointer' }}>← ToDo</button>}
                      {s === 'todo' && <button onClick={() => updateStatus(t.id, 'in_progress')} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 9, cursor: 'pointer' }}>→ 進行中</button>}
                      {s === 'in_progress' && <button onClick={() => updateStatus(t.id, 'done')} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 9, cursor: 'pointer' }}>→ 完了</button>}
                      <button onClick={() => deleteTask(t.id)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 9, cursor: 'pointer', marginLeft: 'auto' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              {['タイトル', '担当者', '優先度', '状態', '期限', '操作'].map(h => (
                <th key={h} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(t => (
              <tr key={t.id}>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 600 }}>{t.title}</td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{t.assignee_name || '—'}</td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: PRI_COLORS[t.priority] }}>{t.priority}</td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12 }}>
                    <option value="todo">ToDo</option><option value="in_progress">進行中</option><option value="done">完了</option>
                  </select>
                </td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('ja-JP') : '—'}</td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)' }}><button onClick={() => deleteTask(t.id)} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>🗑</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
