'use client';
import { useState, useEffect } from 'react';

const COLUMNS = [
  { key: 'todo', label: '未着手', color: '#6c63ff' },
  { key: 'in_progress', label: '進行中', color: '#f5a623' },
  { key: 'done', label: '完了', color: '#00d4b8' },
] as const;

const priorityColor: Record<string, string> = {
  high: '#ef4444',
  medium: '#f5a623',
  low: '#6c63ff',
};

export default function StaffTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clinic/tasks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTasks(data);
        setLoading(false);
      });
  }, []);

  const handleComplete = async (id: string) => {
    setUpdating(id);
    const res = await fetch(`/api/clinic/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    if (res.ok) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t));
    }
    setUpdating(null);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>📌 タスクボード</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* カラムヘッダー */}
              <div style={{ padding: '12px 16px', borderBottom: '2px solid ' + col.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 10, padding: '2px 8px' }}>{colTasks.length}</span>
              </div>

              {/* カード一覧 */}
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
                {colTasks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>タスクなし</div>
                )}
                {colTasks.map(task => (
                  <div key={task.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                    {/* 優先度バッジ */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                        background: priorityColor[task.priority] || '#888',
                        borderRadius: 6,
                        padding: '2px 8px',
                        textTransform: 'uppercase',
                      }}>
                        {task.priority || 'medium'}
                      </span>
                      {task.category && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{task.category}</span>
                      )}
                    </div>

                    {/* タイトル */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{task.title}</div>

                    {/* 期限 */}
                    {task.due_date && (
                      <div style={{
                        fontSize: 11,
                        color: new Date(task.due_date) < new Date() && task.status !== 'done' ? '#ef4444' : 'var(--text-muted)',
                        marginBottom: 8,
                      }}>
                        📅 {new Date(task.due_date).toLocaleDateString('ja-JP')}
                      </div>
                    )}

                    {/* 担当者 */}
                    {task.assignee_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>👤 {task.assignee_name}</div>
                    )}

                    {/* 完了ボタン */}
                    {col.key !== 'done' && (
                      <button
                        onClick={() => handleComplete(task.id)}
                        disabled={updating === task.id}
                        style={{
                          width: '100%',
                          padding: '6px 0',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fff',
                          background: updating === task.id ? '#555' : '#00d4b8',
                          border: 'none',
                          borderRadius: 6,
                          cursor: updating === task.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {updating === task.id ? '更新中...' : '完了にする ✓'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
