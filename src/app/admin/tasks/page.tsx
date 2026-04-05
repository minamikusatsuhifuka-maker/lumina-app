'use client';
import { useState, useEffect } from 'react';

const STATUS_COLS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: '📝 ToDo', in_progress: '🔄 進行中', done: '✅ 完了' };
const PRI_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f5a623', low: '#4ade80' };
const PRI_LABELS: Record<string, string> = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' };

const STATUS_BORDER: Record<string, string> = { todo: '#d1d5db', in_progress: '#3b82f6', done: '#22c55e' };
const STATUS_BG: Record<string, string> = { todo: 'transparent', in_progress: 'rgba(59,130,246,0.04)', done: 'rgba(34,197,94,0.04)' };
const STATUS_BADGE_BG: Record<string, string> = { todo: 'rgba(156,163,175,0.12)', in_progress: 'rgba(59,130,246,0.12)', done: 'rgba(34,197,94,0.12)' };
const STATUS_BADGE_COLOR: Record<string, string> = { todo: '#6b7280', in_progress: '#2563eb', done: '#16a34a' };
const PRI_BADGE_BG: Record<string, string> = { high: 'rgba(239,68,68,0.1)', medium: 'rgba(245,158,11,0.1)', low: 'rgba(34,197,94,0.1)' };

const nextStatus = (s: string) => s === 'todo' ? 'in_progress' : 'done';
const prevStatus = (s: string) => s === 'done' ? 'in_progress' : 'todo';
const isOverdue = (d: string) => d && new Date(d) < new Date(new Date().toDateString());
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
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
          <button onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>{viewMode === 'kanban' ? '≡ リスト' : '📋 カード'}</button>
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
        /* カンバン表示（色分け付き） */
        <div style={{ display: 'flex', gap: 14 }}>
          {STATUS_COLS.map(s => (
            <div key={s} style={{ flex: 1, minWidth: 250 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>{STATUS_LABELS[s]}（{byStatus(s).length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byStatus(s).map(t => (
                  <div key={t.id} style={{
                    padding: 12, background: STATUS_BG[t.status] || 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    borderLeft: `4px solid ${STATUS_BORDER[t.status]}`,
                    opacity: t.status === 'done' ? 0.7 : 1,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 6, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                    <div style={{ display: 'flex', gap: 6, fontSize: 11, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ padding: '1px 8px', borderRadius: 10, background: PRI_BADGE_BG[t.priority], color: PRI_COLORS[t.priority], fontWeight: 600 }}>{PRI_LABELS[t.priority]}</span>
                      {t.assignee_name && <span style={{ color: 'var(--text-muted)' }}>👤 {t.assignee_name}</span>}
                      {t.due_date && <span style={{ color: isOverdue(t.due_date) ? '#ef4444' : 'var(--text-muted)' }}>📅 {fmt(t.due_date)}{isOverdue(t.due_date) ? ' ⚠️' : ''}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      {s !== 'todo' && <button onClick={() => updateStatus(t.id, prevStatus(t.status))} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>←</button>}
                      {s !== 'done' && <button onClick={() => updateStatus(t.id, nextStatus(t.status))} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontSize: 10, cursor: 'pointer' }}>→</button>}
                      <button onClick={() => deleteTask(t.id)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, cursor: 'pointer', marginLeft: 'auto' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* リスト表示 */
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              borderLeft: `4px solid ${STATUS_BORDER[t.status]}`,
              background: STATUS_BG[t.status],
              opacity: t.status === 'done' ? 0.7 : 1,
            }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: STATUS_BADGE_BG[t.status], color: STATUS_BADGE_COLOR[t.status], fontWeight: 600, whiteSpace: 'nowrap' }}>{STATUS_LABELS[t.status]}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: PRI_BADGE_BG[t.priority], color: PRI_COLORS[t.priority], fontWeight: 600, whiteSpace: 'nowrap' }}>{PRI_LABELS[t.priority]}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.status === 'done' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>👤 {t.assignee_name ?? '未設定'}</span>
              {t.due_date && <span style={{ fontSize: 11, whiteSpace: 'nowrap', color: isOverdue(t.due_date) ? '#ef4444' : 'var(--text-muted)' }}>📅 {fmt(t.due_date)}{isOverdue(t.due_date) ? ' ⚠️' : ''}</span>}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {t.status !== 'todo' && <button onClick={() => updateStatus(t.id, prevStatus(t.status))} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>←</button>}
                {t.status !== 'done' && <button onClick={() => updateStatus(t.id, nextStatus(t.status))} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontSize: 10, cursor: 'pointer' }}>→</button>}
              </div>
              <button onClick={() => deleteTask(t.id)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>🗑</button>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>タスクがありません</div>}
        </div>
      )}
    </div>
  );
}
