'use client';

// AIメモ機能 Phase1（xLUMINA）
//   1. 目標・目的の設定(memo_goals) … AI重要度逆算の基準
//   2. クイックメモ入力(インボックス) + 「整理する」でAI(Gemini)が目標逆算で仕分け
//   3. 結果カードを人が確認・修正して確定（AIは提案・確定は人）
//   4. カテゴリ別ビュー / 4象限ビュー(第2象限を緑＋「ここに投資を」で強調)
// デザインは xLUMINA ダッシュボードのインラインスタイル/CSS変数トーンに合わせる。

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';

type View = 'inbox' | 'category' | 'matrix';
type QuadrantNum = 1 | 2 | 3 | 4;
type MemoKind = 'task' | 'idea' | 'note' | 'reference';

interface Memo {
  id: string;
  raw_text: string;
  status: string;
  kind: MemoKind | null;
  category_id: string | null;
  importance: number | null;
  urgency: number | null;
  quadrant: QuadrantNum | null;
  goal_ref: string | null;
  ai_summary: string | null;
  ai_reason: string | null;
  created_at: string;
}
interface Todo { id: string; memo_id: string; title: string; done: boolean; sort_order: number; }
interface Category { id: string; name: string; color: string | null; }
interface Goal { id: string; title: string; domain: string | null; detail: string | null; }

const QUADRANT: Record<QuadrantNum, { short: string; full: string; color: string; bg: string; emphasis: boolean }> = {
  1: { short: 'Q1', full: '重要 × 緊急', color: '#ef4444', bg: 'rgba(239,68,68,0.10)', emphasis: false },
  2: { short: 'Q2', full: '重要 × 非緊急', color: '#1D9E75', bg: 'rgba(29,158,117,0.12)', emphasis: true },
  3: { short: 'Q3', full: '非重要 × 緊急', color: '#EF9F27', bg: 'rgba(239,159,39,0.10)', emphasis: false },
  4: { short: 'Q4', full: '非重要 × 非緊急', color: '#7878a0', bg: 'rgba(120,120,160,0.10)', emphasis: false },
};
const KIND_LABEL: Record<MemoKind, string> = { task: 'タスク', idea: 'アイデア', note: 'メモ', reference: '参考' };
const KINDS: MemoKind[] = ['task', 'idea', 'note', 'reference'];

export default function MemoPage() {
  const { showToast } = useToast();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [view, setView] = useState<View>('inbox');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [triagingId, setTriagingId] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);

  // 目標フォーム
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDomain, setGoalDomain] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, g] = await Promise.all([
        fetch('/api/memos'), fetch('/api/memo-categories'), fetch('/api/memo-goals'),
      ]);
      if (m.ok) { const d = await m.json(); setMemos(d.memos || []); setTodos(d.todos || []); }
      if (c.ok) setCategories((await c.json()).categories || []);
      if (g.ok) setGoals((await g.json()).goals || []);
    } catch { showToast('読み込みに失敗しました', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const categoryName = useCallback((id: string | null) => categories.find((c) => c.id === id)?.name ?? null, [categories]);
  const goalTitleById = useCallback((id: string | null) => goals.find((g) => g.id === id)?.title ?? null, [goals]);

  const addMemo = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/memos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: text }) });
      if (res.ok) { const d = await res.json(); setMemos((p) => [d.memo, ...p]); setInput(''); }
      else showToast('保存に失敗しました', 'error');
    } finally { setBusy(false); }
  };

  const triage = async (id: string) => {
    setTriagingId(id);
    try {
      const res = await fetch(`/api/memos/${id}/triage`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (d.fallback) showToast('AI判定に失敗（暫定値で保存）。GEMINI設定をご確認ください', 'error');
        else showToast('整理しました', 'success');
        await load();
      } else { const d = await res.json().catch(() => ({})); showToast(d.error || 'AI判定に失敗しました', 'error'); }
    } finally { setTriagingId(null); }
  };

  const triageAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/memos/triage-all', { method: 'POST' });
      if (res.ok) { const d = await res.json(); showToast(`整理: ${d.triaged}件成功${d.failed ? ` / ${d.failed}件失敗` : ''}`, d.failed ? 'error' : 'success'); await load(); }
    } finally { setBusy(false); }
  };

  const patchMemo = async (id: string, patch: Partial<Memo>) => {
    setMemos((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await fetch(`/api/memos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  };

  const deleteMemo = async (id: string) => {
    setMemos((p) => p.filter((m) => m.id !== id));
    await fetch(`/api/memos/${id}`, { method: 'DELETE' });
  };

  const toggleTodo = async (t: Todo) => {
    setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch('/api/memo-todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, done: !t.done }) });
  };

  const addGoal = async () => {
    const title = goalTitle.trim();
    if (!title) return;
    const res = await fetch('/api/memo-goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, domain: goalDomain.trim() || null }) });
    if (res.ok) { const d = await res.json(); setGoals((p) => [...p, d.goal]); setGoalTitle(''); setGoalDomain(''); }
  };
  const deleteGoal = async (id: string) => {
    setGoals((p) => p.filter((g) => g.id !== id));
    await fetch(`/api/memo-goals?id=${id}`, { method: 'DELETE' });
  };

  const inbox = useMemo(() => memos.filter((m) => m.status === 'inbox'), [memos]);
  const triaged = useMemo(() => memos.filter((m) => m.status === 'triaged' || m.status === 'done'), [memos]);
  const todosByMemo = useCallback((id: string) => todos.filter((t) => t.memo_id === id), [todos]);

  const card: React.CSSProperties = { background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 12, padding: 14 };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🧭 AIメモ</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', marginTop: 6 }}>
          思いついたことをまず書き留め、「整理する」で目標から逆算してAIが仕分け。
          <span style={{ color: '#1D9E75', fontWeight: 700 }}>第2象限（重要×非緊急）</span>を見逃さず先回りで提案します。
        </p>
      </div>

      {/* 目標・目的の設定 */}
      <div style={{ ...card, marginBottom: 14 }}>
        <button onClick={() => setShowGoals((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          🎯 目標・目的（AI判断の基準）<span style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)' }}>{goals.length}件 {showGoals ? '▲' : '▼'}</span>
        </button>
        {showGoals && (
          <div style={{ marginTop: 10 }}>
            {goals.length === 0 && <p style={{ fontSize: 12, color: '#EF9F27' }}>目標が未設定です。設定するとAIの重要度判定が目標逆算になります。</p>}
            {goals.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-color,#f0f0f0)' }}>
                <span style={{ fontSize: 13, flex: 1 }}>{g.title}{g.domain && <span style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', marginLeft: 6 }}>#{g.domain}</span>}</span>
                <button onClick={() => deleteGoal(g.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>削除</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="目標（例：年内に学会発表）" style={inputStyle} />
              <input value={goalDomain} onChange={(e) => setGoalDomain(e.target.value)} placeholder="分野(任意)" style={{ ...inputStyle, width: 110 }} />
              <button onClick={addGoal} disabled={!goalTitle.trim()} style={btnPrimary}>追加</button>
            </div>
          </div>
        )}
      </div>

      {/* メモ入力 */}
      <div style={{ ...card, marginBottom: 14 }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addMemo(); }} placeholder="メモを入力（⌘/Ctrl+Enterで保存）…" rows={2} style={{ ...inputStyle, width: '100%', resize: 'none', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary,#9ca3af)' }}>インボックス {inbox.length}件</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {inbox.length > 0 && <button onClick={triageAll} disabled={busy} style={btnGhost}>{busy ? '整理中…' : 'まとめて整理'}</button>}
            <button onClick={addMemo} disabled={busy || !input.trim()} style={btnPrimary}>追加</button>
          </div>
        </div>
      </div>

      {/* ビュー切替 */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary,#f3f4f6)', padding: 4, borderRadius: 10, marginBottom: 14 }}>
        {([['inbox', 'インボックス'], ['category', 'カテゴリ別'], ['matrix', '4象限']] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: view === v ? 'var(--bg-secondary,#fff)' : 'transparent', color: view === v ? 'var(--text-primary)' : 'var(--text-secondary,#6b7280)' }}>{label}</button>
        ))}
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>読み込み中…</p>
        : view === 'inbox' ? (
          <>
            {inbox.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h2 style={sectionTitle}>未整理</h2>
                {inbox.map((m) => (
                  <div key={m.id} style={{ ...card, marginBottom: 8 }}>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, margin: 0 }}>{m.raw_text}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                      <button onClick={() => deleteMemo(m.id)} style={linkBtn}>削除</button>
                      <button onClick={() => triage(m.id)} disabled={triagingId === m.id} style={btnPrimary}>{triagingId === m.id ? 'AI判定中…' : '整理する'}</button>
                    </div>
                  </div>
                ))}
              </section>
            )}
            <section>
              <h2 style={sectionTitle}>整理済み（AI提案・人が確定/修正）</h2>
              {triaged.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>まだありません</p>
                : triaged.map((m) => (
                  <TriagedCard key={m.id} memo={m} categories={categories} goals={goals} categoryName={categoryName} goalTitleById={goalTitleById} todos={todosByMemo(m.id)} onPatch={patchMemo} onDelete={deleteMemo} onToggleTodo={toggleTodo} />
                ))}
            </section>
          </>
        ) : view === 'category' ? (
          <CategoryView memos={triaged} categories={categories} categoryName={categoryName} />
        ) : (
          <MatrixView memos={triaged} categoryName={categoryName} />
        )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };
const btnPrimary: React.CSSProperties = { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', marginBottom: 8 };

function TriagedCard(props: {
  memo: Memo; categories: Category[]; goals: Goal[];
  categoryName: (id: string | null) => string | null; goalTitleById: (id: string | null) => string | null;
  todos: Todo[]; onPatch: (id: string, p: Partial<Memo>) => void; onDelete: (id: string) => void; onToggleTodo: (t: Todo) => void;
}) {
  const { memo, categories, goals, categoryName, goalTitleById, todos, onPatch, onDelete, onToggleTodo } = props;
  const q = (memo.quadrant ?? 4) as QuadrantNum;
  const s = QUADRANT[q];
  const sel: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 6, padding: '4px 6px', fontSize: 12, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };

  return (
    <div style={{ border: `1px solid ${s.color}`, background: s.bg, borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: s.emphasis ? `0 0 0 2px ${s.color}33` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {memo.ai_summary && <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{memo.ai_summary}</p>}
          <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{memo.raw_text}</p>
        </div>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: s.color, background: '#ffffffcc', padding: '2px 10px', borderRadius: 20, height: 'fit-content' }}>{s.short}{s.emphasis && ' ★'}</span>
      </div>
      {memo.ai_reason && <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', marginTop: 8 }}>💡 {memo.ai_reason}</p>}
      {goalTitleById(memo.goal_ref) && <p style={{ fontSize: 12, color: '#1D9E75', marginTop: 4 }}>🎯 {goalTitleById(memo.goal_ref)}</p>}

      {todos.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', borderTop: '1px solid #00000010', paddingTop: 8 }}>
          {todos.map((t) => (
            <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '2px 0' }}>
              <input type="checkbox" checked={t.done} onChange={() => onToggleTodo(t)} />
              <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9ca3af' : 'inherit' }}>{t.title}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, borderTop: '1px solid #00000010', paddingTop: 10 }}>
        <select value={q} onChange={(e) => onPatch(memo.id, { quadrant: Number(e.target.value) as QuadrantNum })} style={sel}>
          {([1, 2, 3, 4] as QuadrantNum[]).map((n) => <option key={n} value={n}>{QUADRANT[n].short}: {QUADRANT[n].full}</option>)}
        </select>
        <select value={memo.kind ?? 'note'} onChange={(e) => onPatch(memo.id, { kind: e.target.value as MemoKind })} style={sel}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={memo.category_id ?? ''} onChange={(e) => onPatch(memo.id, { category_id: e.target.value || null })} style={sel}>
          <option value="">(カテゴリなし)</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={memo.goal_ref ?? ''} onChange={(e) => onPatch(memo.id, { goal_ref: e.target.value || null })} style={sel}>
          <option value="">(目標なし)</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>重要{memo.importance ?? '-'}/緊急{memo.urgency ?? '-'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {memo.status !== 'done'
            ? <button onClick={() => onPatch(memo.id, { status: 'done' })} style={{ ...btnGhost, padding: '4px 10px' }}>完了</button>
            : <button onClick={() => onPatch(memo.id, { status: 'triaged' })} style={{ ...linkBtn, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px' }}>戻す</button>}
          <button onClick={() => onDelete(memo.id)} style={linkBtn}>削除</button>
        </div>
      </div>
    </div>
  );
}

function CategoryView(props: { memos: Memo[]; categories: Category[]; categoryName: (id: string | null) => string | null }) {
  const { memos, categories, categoryName } = props;
  const groups = useMemo(() => {
    const map = new Map<string, Memo[]>();
    for (const m of memos) { const k = m.category_id ?? '__none__'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(m); }
    return map;
  }, [memos]);
  if (memos.length === 0) return <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>整理済みメモがありません</p>;
  const keys = [...categories.map((c) => c.id).filter((id) => groups.has(id)), ...(groups.has('__none__') ? ['__none__'] : [])];
  return (
    <div>
      {keys.map((k) => {
        const list = groups.get(k) || [];
        const name = k === '__none__' ? '未分類' : categoryName(k) || 'カテゴリ';
        return (
          <section key={k} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{name} <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>{list.length}</span></h3>
            {list.map((m) => {
              const q = (m.quadrant ?? 4) as QuadrantNum;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color,#e5e7eb)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13, background: 'var(--bg-secondary,#fff)' }}>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: QUADRANT[q].color, background: QUADRANT[q].bg, padding: '2px 7px', borderRadius: 12 }}>{QUADRANT[q].short}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.ai_summary || m.raw_text}</span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function MatrixView(props: { memos: Memo[]; categoryName: (id: string | null) => string | null }) {
  const { memos, categoryName } = props;
  if (memos.length === 0) return <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>整理済みメモがありません</p>;
  const by = (q: QuadrantNum) => memos.filter((m) => (m.quadrant ?? 4) === q);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {([2, 1, 4, 3] as QuadrantNum[]).map((q) => {
        const s = QUADRANT[q];
        const list = by(q);
        return (
          <div key={q} style={{ border: `1px solid ${s.color}`, background: s.bg, borderRadius: 12, padding: 14, boxShadow: s.emphasis ? `0 0 0 2px ${s.color}33` : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: s.color }}>{s.short} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary,#6b7280)' }}>{s.full}</span></h3>
              {s.emphasis && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: s.color, padding: '2px 8px', borderRadius: 12 }}>ここに投資を</span>}
            </div>
            {list.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 8 }}>なし</p>
              : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {list.map((m) => (
                  <li key={m.id} style={{ background: '#ffffffaa', borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{m.ai_summary || m.raw_text}</span>
                    {categoryName(m.category_id) && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>#{categoryName(m.category_id)}</span>}
                  </li>
                ))}
              </ul>}
          </div>
        );
      })}
    </div>
  );
}
