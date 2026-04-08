'use client';
import { useState, useEffect, use } from 'react';

type Tab = 'overview' | 'tasks' | 'progress' | 'chat';
const STATUS_COLS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: '📝 ToDo', in_progress: '🔄 進行中', done: '✅ 完了' };
const PRI_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f5a623', low: '#4ade80' };

export default function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [message, setMessage] = useState('');

  // タスク追加
  const [newTask, setNewTask] = useState('');
  const [breakingDown, setBreakingDown] = useState(false);
  const [breakdownPreview, setBreakdownPreview] = useState<any[]>([]);

  // AIチャット
  const [chatMsg, setChatMsg] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [chatHistory, setChatHistory] = useState<{ msg: string; res: string }[]>([]);
  const [chatting, setChatting] = useState(false);
  const [taskFilter, setTaskFilter] = useState('');

  const fetchData = () => { fetch(`/api/clinic/strategies/${id}`).then(r => r.json()).then(d => { setStrategy(d); setLoading(false); }); };
  useEffect(() => { fetchData(); }, [id]);

  const tasks = strategy?.tasks || [];
  const tasksByStatus = (s: string) => tasks.filter((t: any) => t.status === s);
  const completedRate = tasks.length > 0 ? Math.round(tasksByStatus('done').length / tasks.length * 100) : 0;

  const addTask = async () => {
    if (!newTask.trim()) return;
    await fetch(`/api/clinic/strategies/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTask, description: '', priority: 'medium', dueInDays: 7 }) });
    setNewTask(''); fetchData();
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await fetch(`/api/clinic/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchData();
  };

  const breakdown = async () => {
    setBreakingDown(true);
    try {
      const res = await fetch(`/api/clinic/strategies/${id}/breakdown`, { method: 'POST' });
      const data = await res.json();
      if (data.tasks) setBreakdownPreview(data.tasks);
    } catch {} finally { setBreakingDown(false); }
  };

  const saveBreakdown = async () => {
    for (const t of breakdownPreview) {
      await fetch(`/api/clinic/strategies/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) });
    }
    setBreakdownPreview([]); fetchData();
  };

  const runChat = async () => {
    if (!chatMsg.trim()) return;
    setChatting(true); setChatResult('');
    try {
      const res = await fetch('/api/clinic/strategies/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: chatMsg, strategyId: id }) });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '', buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const l of lines) { if (!l.startsWith('data: ')) continue; try { const j = JSON.parse(l.slice(6)); if (j.type === 'text') { acc += j.content; setChatResult(acc); } } catch {} }
      }
      setChatHistory(prev => [...prev, { msg: chatMsg, res: acc }]);
      setChatMsg('');
    } catch {} finally { setChatting(false); }
  };

  const updateStatus = async (status: string) => {
    await fetch(`/api/clinic/strategies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchData();
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!strategy) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>戦略が見つかりません</div>;

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
      {/* 左カラム */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{strategy.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{strategy.category}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['draft', 'active', 'completed'].map(s => (
              <button key={s} onClick={() => updateStatus(s)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: strategy.status === s ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: strategy.status === s ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${strategy.status === s ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>
                {s === 'draft' ? '📝 ドラフト' : s === 'active' ? '▶️ 実行中' : '✅ 完了'}
              </button>
            ))}
          </div>
        </div>

        {message && <div style={{ padding: 8, background: 'rgba(74,222,128,0.1)', borderRadius: 6, fontSize: 12, color: '#4ade80', marginBottom: 10 }}>{message}</div>}

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {([{ key: 'overview' as Tab, label: '📋 概要' }, { key: 'tasks' as Tab, label: '✅ タスク' }, { key: 'progress' as Tab, label: '📊 進捗' }]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: tab === t.key ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${tab === t.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{t.label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {strategy.description && <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{strategy.description}</div>}
            {strategy.background && <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>背景・課題</div><div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{strategy.background}</div></div>}
            {strategy.goal && <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>目標</div><div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{strategy.goal}</div></div>}
          </div>
        )}

        {tab === 'tasks' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }} placeholder="タスクを追加" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addTask} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ 追加</button>
              <button onClick={breakdown} disabled={breakingDown} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>{breakingDown ? '分解中...' : '🤖 AI分解'}</button>
            </div>

            {breakdownPreview.length > 0 && (
              <div style={{ padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 8 }}>AIが{breakdownPreview.length}件のタスクを提案</div>
                {breakdownPreview.map((t: any, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>• {t.title}（{t.assigneeRole}）</div>)}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={saveBreakdown} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>全て追加</button>
                  <button onClick={() => setBreakdownPreview([])} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>キャンセル</button>
                </div>
              </div>
            )}

            {/* サマリーバー */}
            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>タスク合計: <b style={{ color: 'var(--text-primary)' }}>{tasks.length}件</b></span>
              <span>ToDo: <b>{tasksByStatus('todo').length}</b></span>
              <span>進行中: <b>{tasksByStatus('in_progress').length}</b></span>
              <span>完了: <b>{tasksByStatus('done').length}</b></span>
              <span>進捗: <b style={{ color: completedRate >= 80 ? '#4ade80' : completedRate >= 50 ? '#f5a623' : '#6c63ff' }}>{completedRate}%</b></span>
            </div>

            {/* プログレスバー */}
            <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${completedRate}%`, background: completedRate >= 80 ? '#4ade80' : completedRate >= 50 ? '#f5a623' : '#6c63ff', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>

            {/* フィルターバー */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[
                { key: '', label: `全て(${tasks.length})` },
                { key: 'todo', label: `📝 ToDo(${tasksByStatus('todo').length})` },
                { key: 'in_progress', label: `🔄 進行中(${tasksByStatus('in_progress').length})` },
                { key: 'done', label: `✅ 完了(${tasksByStatus('done').length})` },
              ].map(f => (
                <button key={f.key} onClick={() => setTaskFilter(f.key)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: taskFilter === f.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: taskFilter === f.key ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${taskFilter === f.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{f.label}</button>
              ))}
            </div>

            {/* カードグリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {(taskFilter ? tasks.filter((t: any) => t.status === taskFilter) : tasks).map((t: any) => {
                const statusStyles: Record<string, React.CSSProperties> = {
                  todo: { borderLeft: '4px solid #9ca3af', background: 'var(--bg-card)' },
                  in_progress: { borderLeft: '4px solid #3b82f6', background: 'rgba(59,130,246,0.04)' },
                  done: { borderLeft: '4px solid #22c55e', background: 'rgba(34,197,94,0.04)', opacity: 0.7 },
                };
                const priBadge: Record<string, { bg: string; color: string; label: string }> = {
                  high: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', label: '🔴 高' },
                  medium: { bg: 'rgba(245,166,35,0.1)', color: '#d97706', label: '🟡 中' },
                  low: { bg: 'rgba(74,222,128,0.1)', color: '#16a34a', label: '🟢 低' },
                };
                const stBadge: Record<string, { bg: string; color: string }> = {
                  todo: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
                  in_progress: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
                  done: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
                };
                const pri = priBadge[t.priority] || priBadge.medium;
                const stb = stBadge[t.status] || stBadge.todo;
                const isOverdue = t.target_date && new Date(t.target_date) < new Date();
                const getDaysLeft = (d: string) => {
                  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
                  if (days < 0) return `(${Math.abs(days)}日超過)`;
                  if (days === 0) return '(今日)';
                  return `(あと${days}日)`;
                };
                const prevStatus = (s: string) => s === 'done' ? 'in_progress' : 'todo';
                const nextStatus = (s: string) => s === 'todo' ? 'in_progress' : 'done';

                return (
                  <div key={t.id} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, ...statusStyles[t.status] }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: pri.bg, color: pri.color }}>{pri.label}</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: stb.bg, color: stb.color }}>{STATUS_LABELS[t.status]}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.title}</div>
                    {t.assignee_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {t.assignee_name}</div>}
                    {t.target_date && <div style={{ fontSize: 11, color: isOverdue ? '#ef4444' : 'var(--text-muted)', fontWeight: isOverdue ? 600 : 400 }}>📅 {new Date(t.target_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} {getDaysLeft(t.target_date)}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                      {t.status !== 'todo' && <button onClick={() => updateTaskStatus(t.id, prevStatus(t.status))} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>← 戻す</button>}
                      {t.status !== 'done' && <button onClick={() => updateTaskStatus(t.id, nextStatus(t.status))} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.08)', color: '#6c63ff', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>進める →</button>}
                      {t.status === 'done' && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 'auto' }}>✅ 完了</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'progress' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', border: `4px solid ${completedRate >= 80 ? '#4ade80' : completedRate >= 50 ? '#f5a623' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: completedRate >= 80 ? '#4ade80' : completedRate >= 50 ? '#f5a623' : '#ef4444' }}>{completedRate}%</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>タスク完了率</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tasksByStatus('done').length} / {tasks.length} タスク完了</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.filter((t: any) => t.status === 'done').map((t: any) => (
                <div key={t.id} style={{ padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>✅ {t.title}</span>
                  {t.completed_at && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(t.completed_at).toLocaleDateString('ja-JP')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 右カラム: AIチャット */}
      <div style={{ width: 320, flexShrink: 0, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', position: 'sticky', top: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>🤖 戦略AIアドバイザー</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {['次のアクションは？', '進捗を評価して', 'リスクを再確認', 'KPI達成方法は？'].map(q => (
            <button key={q} onClick={() => setChatMsg(q)} style={{ padding: '3px 8px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>{q}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {chatHistory.map((h, i) => (
            <div key={i}>
              <div style={{ padding: '6px 10px', background: 'rgba(108,99,255,0.1)', borderRadius: '10px 10px 2px 10px', fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{h.msg}</div>
              <div style={{ padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px 10px 10px 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{h.res}</div>
            </div>
          ))}
          {chatResult && !chatHistory.find(h => h.res === chatResult) && (
            <div style={{ padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{chatResult}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="質問..." style={{ flex: 1, padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
          <button onClick={runChat} disabled={chatting} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: chatting ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{chatting ? '...' : '送信'}</button>
        </div>
      </div>
    </div>
  );
}
