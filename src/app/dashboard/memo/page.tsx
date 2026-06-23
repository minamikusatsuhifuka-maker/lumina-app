'use client';

// AIメモ機能（xLUMINA）
//  Phase1: 目標設定→AI仕分け(目標逆算)→4象限/カテゴリ。第2象限を強調。
//  Phase2: 横断TODOビュー(象限優先) / 今日・今週 / カレンダー(due_date・予定日・.ics)。
//  Phase3: 第2象限フォーカス(目標寄与度順＋予定日を置く)/ 今週の第2象限カード / 短文コーチング。
// デザインは xLUMINA ダッシュボードのインラインスタイル/CSS変数トーンに合わせる。

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';

type View = 'inbox' | 'plan' | 'calendar' | 'focus' | 'category' | 'matrix' | 'done' | 'input' | 'goals';
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
  due_at: string | null;   // AI抽出の絶対日時(ISO)。終日は has_time=false
  has_time: boolean;       // 時刻指定の有無
  completed_at: string | null; // 完了印の時刻(done時)。未完了化でnull
  created_at: string;
}
interface Todo {
  id: string; memo_id: string; title: string; done: boolean; sort_order: number;
  due_date: string | null; scheduled_date: string | null; quadrant: QuadrantNum | null;
  due_at: string | null; has_time: boolean; completed_at: string | null;
}
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

// ============================================================
// 日付ヘルパ（ローカル基準。Postgresのdate列は 'YYYY-MM-DD' 文字列で返る前提）
// ============================================================
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localToday = () => fmtDate(new Date());
function weekRange(): { start: string; end: string } {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 月曜=0
  const start = new Date(d); start.setDate(d.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: fmtDate(start), end: fmtDate(end) };
}
const inRange = (s: string | null, a: string, b: string) => !!s && s >= a && s <= b;
const planDate = (t: Todo) => t.scheduled_date || t.due_date || null; // 計画上の日付（予定日優先）

// ============================================================
// 日時(due_at)ヘルパ。ユーザーはJST(Asia/Tokyo)前提のため、ブラウザのローカル時刻＝JSTで扱う。
// ============================================================
const timeOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// 表示用: has_time:true は「M/D HH:mm」、false は「M/D」
function fmtDueAt(iso: string | null, hasTime: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  const base = `${d.getMonth() + 1}/${d.getDate()}`;
  return hasTime ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
}
// 122: 期限の近さ(残り日数)を色付きバッジ情報に。due_at が 7日以内/超過のときのみ返す。
//   1日前=赤 / 3日前=橙 / 7日前=黄 / 超過=濃赤(暦日差・ローカル=JST基準)。
function dueInfo(iso: string | null): { days: number; label: string; color: string } | null {
  if (!iso) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(iso); if (isNaN(d0.getTime())) return null; d0.setHours(0, 0, 0, 0);
  const days = Math.round((d0.getTime() - t0.getTime()) / 86400000);
  if (days > 7) return null;
  if (days < 0) return { days, label: '期限超過', color: '#dc2626' };
  if (days === 0) return { days, label: '今日まで', color: '#ef4444' };
  if (days <= 1) return { days, label: 'あと1日', color: '#ef4444' };
  if (days <= 3) return { days, label: `あと${days}日`, color: '#EF9F27' };
  return { days, label: `あと${days}日`, color: '#eab308' };
}
// 完了日時の表示(M/D HH:mm)。
function fmtCompleted(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> 値(YYYY-MM-DDTHH:mm)
function isoToLocalDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// <input type="date"> 値(YYYY-MM-DD)
const isoToDateInput = (iso: string | null): string => (iso ? fmtDate(new Date(iso)) : '');
// 入力値 → ISO(UTC)
function localDTToISO(v: string): string | null { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); }
function dateToISO(v: string): string | null { if (!v) return null; const d = new Date(`${v}T00:00:00`); return isNaN(d.getTime()) ? null : d.toISOString(); }

// ============================================================
// .ics 生成（OAuth不要・どのカレンダーにも取り込める）
// ============================================================
function icsEscape(s: string) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsStamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function addOneDay(ymd: string) { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + 1); return fmtDate(d).replace(/-/g, ''); }
// ローカル(=JST)壁時計を YYYYMMDDTHHMMSS で。TZID=Asia/Tokyo と併用。
function icsLocalStamp(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; }
// has_time:true は時刻つきイベント(VALUE=DATE-TIME, TZID=Asia/Tokyo, 既定60分)、false は終日(VALUE=DATE)。
function buildICS(events: { uid: string; title: string; date: string; dueAt?: string | null; hasTime?: boolean }[]): string {
  const stamp = icsStamp();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//xLUMINA//AIメモ//JA', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@xlumina.jp`, `DTSTAMP:${stamp}`);
    if (e.hasTime && e.dueAt) {
      const start = new Date(e.dueAt);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART;TZID=Asia/Tokyo:${icsLocalStamp(start)}`, `DTEND;TZID=Asia/Tokyo:${icsLocalStamp(end)}`);
    } else {
      const dt = e.date.replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${dt}`, `DTEND;VALUE=DATE:${addOneDay(e.date)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function MemoPage() {
  const { showToast } = useToast();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [view, setView] = useState<View>('matrix'); // 初期表示は4象限（121）
  const [input, setInput] = useState('');
  // メモのまとめて追加（一括入力・1行1メモ）モード
  const [memoBulkMode, setMemoBulkMode] = useState(false);
  const [memoBulkText, setMemoBulkText] = useState('');
  const [memoBulkBusy, setMemoBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [triagingId, setTriagingId] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);

  // 目標フォーム
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDomain, setGoalDomain] = useState('');
  // まとめて登録（一括入力）モード
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // 125: 「追加したら自動で整理」トグル(localStorage記憶・既定OFF)
  const [autoTriage, setAutoTriage] = useState(false);
  useEffect(() => { try { setAutoTriage(localStorage.getItem('memo_auto_triage') === '1'); } catch { /* SSR/権限なし */ } }, []);
  const toggleAutoTriage = (v: boolean) => { setAutoTriage(v); try { localStorage.setItem('memo_auto_triage', v ? '1' : '0'); } catch { /* noop */ } };

  // 125: どこからでも使えるクイック入力(FAB)
  const [fabOpen, setFabOpen] = useState(false);
  const [fabText, setFabText] = useState('');
  const [fabBusy, setFabBusy] = useState(false);

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

  const memoById = useCallback((id: string) => memos.find((m) => m.id === id) ?? null, [memos]);
  const categoryName = useCallback((id: string | null) => categories.find((c) => c.id === id)?.name ?? null, [categories]);
  const goalTitleById = useCallback((id: string | null) => goals.find((g) => g.id === id)?.title ?? null, [goals]);
  // TODOの実効象限（TODO自身→由来メモ→Q4）
  const effQuadrant = useCallback((t: Todo): QuadrantNum => (t.quadrant ?? memoById(t.memo_id)?.quadrant ?? 4) as QuadrantNum, [memoById]);

  // 125: メモ1件を作成しstate反映。成功なら新規memo idを返す(自動整理の連結用)。単一入力/FAB共用。
  const createMemo = useCallback(async (text: string): Promise<string | null> => {
    const res = await fetch('/api/memos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: text }) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.memo) setMemos((p) => [d.memo, ...p]);
    return d.memo?.id ?? null;
  }, []);

  // 125: 追加直後の自動整理(既存triageを流用・新ロジックは作らない)。AIは提案・人が確定は維持。
  const runAutoTriage = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/memos/${id}/triage`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        await load();
        if (d.fallback) showToast('追加→AI判定に失敗（暫定値で保存）', 'error');
        else showToast('追加して整理しました', 'success');
      } else { await load(); showToast('追加しました（整理は失敗）', 'warning'); }
    } catch { await load(); showToast('追加しました（整理は失敗）', 'warning'); }
  }, [load, showToast]);

  const addMemo = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const id = await createMemo(text);
      if (!id) { showToast('保存に失敗しました', 'error'); return; }
      setInput('');
      if (autoTriage) { setTriagingId(id); await runAutoTriage(id); setTriagingId(null); }
    } finally { setBusy(false); }
  };

  // 125: FABクイック入力の保存(タブ切替なしで即投入)。自動整理ONなら追加直後にtriage。
  const submitFab = async () => {
    const text = fabText.trim();
    if (!text || fabBusy) return;
    setFabBusy(true);
    try {
      const id = await createMemo(text);
      if (!id) { showToast('保存に失敗しました', 'error'); return; }
      setFabText('');
      setFabOpen(false);
      if (autoTriage) await runAutoTriage(id);
      else showToast('追加しました', 'success');
    } finally { setFabBusy(false); }
  };

  // 一括入力テキストを「1行＝1メモ」で追加（空行スキップ・トリムはAPI側でも実施）
  const bulkAddMemos = async () => {
    const texts = memoBulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (texts.length === 0) { showToast('追加できる行がありません', 'warning'); return; }
    setMemoBulkBusy(true);
    try {
      const res = await fetch('/api/memos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error ?? '一括追加に失敗しました', 'error'); return; }
      if (Array.isArray(d.memos) && d.memos.length > 0) {
        // 入力順で返るため、新しい順の一覧へは逆順で先頭に積む
        setMemos((p) => [...[...d.memos].reverse(), ...p]);
      }
      setMemoBulkText('');
      setMemoBulkMode(false);
      const parts = [`${d.inserted ?? 0}件を追加`];
      if (d.skipped) parts.push(`重複${d.skipped}件スキップ`);
      if (d.truncated) parts.push(`上限超過${d.truncated}件`);
      showToast(parts.join(' / '), 'success');
      // 125: 自動整理ONなら既存のバッチtriage(triage-all)で一気に整理(レート配慮は既存に倣う)。
      if (autoTriage && (d.inserted ?? 0) > 0) {
        try {
          const r = await fetch('/api/memos/triage-all', { method: 'POST' });
          if (r.ok) { const dd = await r.json(); showToast(`自動整理: ${dd.triaged}件成功${dd.failed ? ` / ${dd.failed}件失敗` : ''}`, dd.failed ? 'error' : 'success'); }
          await load();
        } catch { /* 整理失敗は黙ってinboxに残す(後追い可) */ }
      }
    } catch {
      showToast('通信エラー', 'error');
    } finally {
      setMemoBulkBusy(false);
    }
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
    const res = await fetch(`/api/memos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    // サーバ確定値(completed_at 等)を反映。完了タブの完了日時を即時に表示するため。
    if (res.ok) { const d = await res.json().catch(() => null); if (d?.memo) setMemos((p) => p.map((m) => (m.id === id ? d.memo : m))); }
  };

  const deleteMemo = async (id: string) => {
    setMemos((p) => p.filter((m) => m.id !== id));
    setTodos((p) => p.filter((t) => t.memo_id !== id));
    await fetch(`/api/memos/${id}`, { method: 'DELETE' });
  };

  const toggleTodo = async (t: Todo) => {
    setTodos((p) => p.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch('/api/memo-todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, done: !t.done }) });
  };

  // TODOの締切/予定日/象限/並びを更新（楽観的）
  const patchTodo = async (id: string, patch: Partial<Todo>) => {
    setTodos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch('/api/memo-todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
  };

  // Q2フォーカスから「実行予定」を作る（todoが無いメモを予定に落とす）
  const addTodo = async (memoId: string, title: string, extra: Partial<Todo> = {}) => {
    const res = await fetch('/api/memo-todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memo_id: memoId, title, ...extra }) });
    if (res.ok) { const d = await res.json(); setTodos((p) => [...p, d.todo]); return d.todo as Todo; }
    return null;
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

  // 一括入力テキストを「1行＝1目標」でパース。
  // 各行を最初の区切り（: ： ｜ | タブ）で domain / title に分割。区切り無しは title のみ。
  const parseBulkGoals = (text: string): { title: string; domain: string | null }[] => {
    const out: { title: string; domain: string | null }[] = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue; // 空行スキップ
      const m = line.match(/^(.*?)\s*[:：｜|\t]\s*(.*)$/);
      if (m && m[2].trim()) {
        out.push({ domain: m[1].trim() || null, title: m[2].trim() });
      } else {
        out.push({ domain: null, title: line });
      }
    }
    return out;
  };

  const bulkAddGoals = async () => {
    const items = parseBulkGoals(bulkText);
    if (items.length === 0) { showToast('登録できる行がありません', 'warning'); return; }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/memo-goals/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error ?? '一括登録に失敗しました', 'error'); return; }
      if (Array.isArray(d.goals) && d.goals.length > 0) {
        setGoals((p) => [...p, ...d.goals]);
      }
      setBulkText('');
      setBulkMode(false);
      const parts = [`${d.inserted ?? 0}件を登録`];
      if (d.skipped) parts.push(`重複${d.skipped}件スキップ`);
      if (d.truncated) parts.push(`上限超過${d.truncated}件`);
      showToast(parts.join(' / '), 'success');
    } catch {
      showToast('通信エラー', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const inbox = useMemo(() => memos.filter((m) => m.status === 'inbox'), [memos]);
  // アクティブ(整理済み・未完了)。4象限/カテゴリ/インボックス整理済み・第2象限の表示はこれを使う。
  const active = useMemo(() => memos.filter((m) => m.status === 'triaged'), [memos]);
  // 完了(終了フォルダ)。完了日の新しい順。
  const doneMemos = useMemo(
    () => memos.filter((m) => m.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [memos],
  );
  const todosByMemo = useCallback((id: string) => todos.filter((t) => t.memo_id === id), [todos]);

  // 今週の第2象限カード用：未完了のQ2メモを重要度降順（目標紐付け優先）
  const q2Memos = useMemo(() =>
    active.filter((m) => (m.quadrant ?? 4) === 2)
      .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || (a.goal_ref ? -1 : 0) - (b.goal_ref ? -1 : 0)),
    [active]);

  // 124: タブバー横スクロールの手がかり（続きがある側にフェードを出し、端到達で消す）
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [tabFade, setTabFade] = useState({ left: false, right: false });
  const updateTabFade = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setTabFade((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);
  useEffect(() => {
    updateTabFade();
    window.addEventListener('resize', updateTabFade);
    return () => window.removeEventListener('resize', updateTabFade);
  }, [updateTabFade]);

  const card: React.CSSProperties = { background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 12, padding: 14 };

  // 123: 「目標・目的」タブの中身（旧・常時表示セクションを機能無変更で移設）
  const goalsSection = (
    <div style={{ ...card }}>
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
          {!bulkMode ? (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="目標（例：年内に学会発表）" style={inputStyle} />
                <input value={goalDomain} onChange={(e) => setGoalDomain(e.target.value)} placeholder="分野(任意)" style={{ ...inputStyle, width: 110 }} />
                <button onClick={addGoal} disabled={!goalTitle.trim()} style={btnPrimary}>追加</button>
              </div>
              <button onClick={() => setBulkMode(true)} style={{ ...btnGhost, marginTop: 8, padding: '6px 12px', fontSize: 12 }}>📋 まとめて登録</button>
            </>
          ) : (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'1行に1目標。「分野: 目標本文」の形式（分野は任意）。\n例:\n健康: 週3回の運動を習慣化する\n育成: 自律的に成長する組織をつくる\n最新知見を継続的にアップデートする'}
                rows={6}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', margin: '6px 0 0' }}>
                区切りは <code>:</code> <code>：</code> <code>｜</code> <code>|</code> タブ のいずれか。区切りなしの行は目標本文のみ。最大50件・重複はスキップ。
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={bulkAddGoals} disabled={bulkBusy || !bulkText.trim()} style={{ ...btnPrimary, opacity: bulkBusy || !bulkText.trim() ? 0.6 : 1 }}>
                  {bulkBusy ? '⏳ 登録中...' : '一括登録'}
                </button>
                <button onClick={() => { setBulkMode(false); setBulkText(''); }} disabled={bulkBusy} style={btnGhost}>キャンセル</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // 123: 「メモ入力」タブの中身（旧・常時表示セクションを機能無変更で移設）
  const memoInputSection = (
    <div style={{ ...card }}>
      {!memoBulkMode ? (
        <>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addMemo(); }} placeholder="メモを入力（⌘/Ctrl+Enterで保存）…" rows={5} style={{ ...inputStyle, width: '100%', minHeight: 120, maxHeight: '70vh', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary,#9ca3af)' }}>インボックス {inbox.length}件</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setMemoBulkMode(true)} style={{ ...btnGhost, padding: '8px 12px', fontSize: 12 }}>📋 まとめて追加</button>
              {inbox.length > 0 && <button onClick={triageAll} disabled={busy} style={btnGhost}>{busy ? '整理中…' : 'まとめて整理'}</button>}
              <button onClick={addMemo} disabled={busy || !input.trim()} style={btnPrimary}>追加</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={memoBulkText}
            onChange={(e) => setMemoBulkText(e.target.value)}
            placeholder={'1行＝1メモ。空行はスキップ。最大100件。複数行の長いメモは単一入力欄を使ってください。\n例:\n院内勉強会の年間カリキュラムを設計する\n選択理論の本を1日10ページ読み進める\nアチーブメント受講費を6/25までに支払う'}
            rows={10}
            style={{ ...inputStyle, width: '100%', minHeight: 220, maxHeight: '70vh', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', margin: '6px 0 0' }}>
            追加後はインボックスに <code>未整理</code> で入ります。各メモは「整理する」/「まとめて整理」で象限判定されます（自動では実行しません）。
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={bulkAddMemos} disabled={memoBulkBusy || !memoBulkText.trim()} style={{ ...btnPrimary, opacity: memoBulkBusy || !memoBulkText.trim() ? 0.6 : 1 }}>
              {memoBulkBusy ? '⏳ 追加中...' : '一括追加'}
            </button>
            <button onClick={() => { setMemoBulkMode(false); setMemoBulkText(''); }} disabled={memoBulkBusy} style={btnGhost}>キャンセル</button>
          </div>
        </>
      )}
      {/* 125: 追加したら自動で整理(既定OFF・localStorage記憶)。ONでも後から手修正可。 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color,#f0f0f0)', fontSize: 12, color: 'var(--text-secondary,#6b7280)', cursor: 'pointer' }}>
        <input type="checkbox" checked={autoTriage} onChange={(e) => toggleAutoTriage(e.target.checked)} />
        <span>⚡ 追加したら自動で整理（AIが象限・カテゴリ・目標まで判定）<span style={{ color: '#9ca3af' }}>※既定OFF・AI実行</span></span>
      </label>
    </div>
  );

  // 124: タブ順（よく使う「メモ入力」「目標・目的」を先頭2つに固める。既定は4象限のまま）
  const TABS: [View, string][] = [
    ['input', '📝 メモ入力'], ['goals', '🎯 目標・目的'], ['matrix', '4象限'], ['focus', '第2象限'], ['plan', '計画'],
    ['calendar', 'カレンダー'], ['category', 'カテゴリ別'], ['inbox', 'インボックス'], ['done', '完了'],
  ];

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🧭 AIメモ</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', marginTop: 6 }}>
          思いついたことをまず書き留め、「整理する」で目標から逆算してAIが仕分け。
          <span style={{ color: '#1D9E75', fontWeight: 700 }}>第2象限（重要×非緊急）</span>を見逃さず先回りで提案します。
        </p>
      </div>

      {/* 123/124: ビュー切替タブ（ページ最上部）。9タブで狭幅は横スクロール＋続きがある側にフェードの手がかり。 */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <div ref={tabBarRef} onScroll={updateTabFade} style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary,#f3f4f6)', padding: 4, borderRadius: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', minWidth: 84, padding: '8px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: view === v ? 'var(--bg-secondary,#fff)' : 'transparent', color: view === v ? (v === 'focus' ? '#1D9E75' : 'var(--text-primary)') : 'var(--text-secondary,#6b7280)' }}>{label}</button>
          ))}
        </div>
        {/* 左/右フェード（端到達で非表示・クリックを妨げない pointerEvents:none） */}
        {tabFade.left && (
          <div aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 32, pointerEvents: 'none', borderRadius: '7px 0 0 7px', background: 'linear-gradient(to left, transparent, var(--bg-tertiary,#f3f4f6))', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--text-secondary,#9ca3af)', fontSize: 14, paddingLeft: 2 }}>‹</div>
        )}
        {tabFade.right && (
          <div aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, right: 4, width: 32, pointerEvents: 'none', borderRadius: '0 7px 7px 0', background: 'linear-gradient(to right, transparent, var(--bg-tertiary,#f3f4f6))', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: 'var(--text-secondary,#9ca3af)', fontSize: 14, paddingRight: 2 }}>›</div>
        )}
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>読み込み中…</p>
        : view === 'input' ? memoInputSection
        : view === 'goals' ? goalsSection
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
              {active.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>まだありません</p>
                : active.map((m) => (
                  <TriagedCard key={m.id} memo={m} categories={categories} goals={goals} categoryName={categoryName} goalTitleById={goalTitleById} todos={todosByMemo(m.id)} onPatch={patchMemo} onDelete={deleteMemo} onToggleTodo={toggleTodo} collapsible />
                ))}
            </section>
          </>
        ) : view === 'plan' ? (
          <PlanView todos={todos} memoById={memoById} categories={categories} categoryName={categoryName} effQuadrant={effQuadrant} onToggle={toggleTodo} onPatch={patchTodo} />
        ) : view === 'calendar' ? (
          <CalendarView todos={todos} memoById={memoById} onToggle={toggleTodo} />
        ) : view === 'focus' ? (
          <>
            {/* 123: 「今週の第2象限」カードは常時最上部固定をやめ、第2象限タブ先頭へ移設 */}
            {q2Memos.length > 0 && <WeeklyQ2Card memos={q2Memos} todos={todos} goalTitleById={goalTitleById} onOpen={() => setView('focus')} />}
            <FocusView memos={q2Memos} todos={todos} goalTitleById={goalTitleById} onToggleTodo={toggleTodo} onPatchTodo={patchTodo} onAddTodo={addTodo} />
          </>
        ) : view === 'category' ? (
          <CategoryView memos={active} categories={categories} categoryName={categoryName} />
        ) : view === 'done' ? (
          <DoneView memos={doneMemos} categoryName={categoryName} onPatch={patchMemo} onDelete={deleteMemo} />
        ) : (
          <>
            {/* 123: ⏰期限が近いTODOアラートは既定の4象限ビュー先頭に表示（読み込み時に気づける） */}
            <UpcomingDueCard memos={active} />
            <MatrixView memos={active} categoryName={categoryName} />
          </>
        )}

      {/* 125: どこからでもクイック入力(FAB)。どのタブでも右下＋で1行メモを即投入。 */}
      <button
        onClick={() => setFabOpen(true)}
        aria-label="メモをクイック追加"
        title="メモをクイック追加"
        style={{ position: 'fixed', right: 20, bottom: 24, zIndex: 60, width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#1D9E75', color: '#fff', fontSize: 28, lineHeight: 1, boxShadow: '0 6px 20px rgba(29,158,117,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >＋</button>

      {fabOpen && (
        <div
          onClick={() => setFabOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, background: 'var(--bg-secondary,#fff)', border: '1px solid var(--border-color,#e5e7eb)', borderRadius: 14, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>⚡ クイック入力</span>
              <button onClick={() => setFabOpen(false)} style={{ ...linkBtn, fontSize: 18 }} aria-label="閉じる">×</button>
            </div>
            <textarea
              autoFocus
              value={fabText}
              onChange={(e) => setFabText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); setFabOpen(false); }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitFab(); }
              }}
              placeholder="思いついたことを1行で（⌘/Ctrl+Enterで保存・Escで閉じる）…"
              rows={3}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--text-secondary,#6b7280)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoTriage} onChange={(e) => toggleAutoTriage(e.target.checked)} />
              <span>⚡ 追加したら自動で整理<span style={{ color: '#9ca3af' }}>（既定OFF・AI実行）</span></span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setFabOpen(false)} disabled={fabBusy} style={btnGhost}>キャンセル</button>
              <button onClick={submitFab} disabled={fabBusy || !fabText.trim()} style={{ ...btnPrimary, opacity: fabBusy || !fabText.trim() ? 0.6 : 1 }}>{fabBusy ? '⏳ 追加中...' : '追加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };
const btnPrimary: React.CSSProperties = { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', marginBottom: 8 };
const dateInput: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 6, padding: '3px 6px', fontSize: 11, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };

// ============================================================
// 今週の第2象限カード（Phase3 ナッジ）
// ============================================================
function WeeklyQ2Card(props: { memos: Memo[]; todos: Todo[]; goalTitleById: (id: string | null) => string | null; onOpen: () => void }) {
  const { memos, todos, goalTitleById, onOpen } = props;
  const { start, end } = weekRange();
  // 今週すでに予定枠に入っているQ2の数
  const scheduledThisWeek = todos.filter((t) => (t.quadrant ?? 2) === 2 && !t.done && inRange(t.scheduled_date, start, end)).length;
  const top = memos.slice(0, 3);
  return (
    <div style={{ border: '1px solid #1D9E75', background: 'rgba(29,158,117,0.08)', borderRadius: 12, padding: 14, marginBottom: 14, boxShadow: '0 0 0 2px rgba(29,158,117,0.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#1D9E75' }}>🌱 今週の第2象限</h2>
        <span style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)' }}>予定済み {scheduledThisWeek}件 / 候補 {memos.length}件</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', margin: '0 0 8px' }}>
        緊急ではないが、最も人生を前に進める領域。<b style={{ color: '#1D9E75' }}>ここに先に時間を払う（代価の先払い）。</b>
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
        {top.map((m) => (
          <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', background: '#fff', padding: '1px 7px', borderRadius: 10 }}>重要{m.importance ?? '-'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.ai_summary || m.raw_text}</span>
            {goalTitleById(m.goal_ref) && <span style={{ fontSize: 10, color: '#1D9E75', flexShrink: 0 }}>🎯</span>}
          </li>
        ))}
      </ul>
      <button onClick={onOpen} style={{ ...btnPrimary, padding: '6px 14px' }}>第2象限を予定に落とす →</button>
    </div>
  );
}

// ============================================================
// ⏰ 期限が近いTODO（122・アプリ内アラート）
//   アクティブな整理済みメモのうち due_at が7日以内/超過のものを、近い順に色分け表示。
//   既存の通知センター(🔔)に加えて、画面上でも確実に気づけるようにする常設セクション。
// ============================================================
function UpcomingDueCard(props: { memos: Memo[] }) {
  const items = props.memos
    .map((m) => ({ m, info: dueInfo(m.due_at) }))
    .filter((x): x is { m: Memo; info: NonNullable<ReturnType<typeof dueInfo>> } => x.info !== null)
    .sort((a, b) => a.info.days - b.info.days);
  if (items.length === 0) return null;
  return (
    <div style={{ border: '1px solid #EF9F27', background: 'rgba(239,159,39,0.08)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#EF9F27' }}>⏰ 期限が近いTODO</h2>
        <span style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)' }}>{items.length}件</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.slice(0, 8).map(({ m, info }) => (
          <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#fff', background: info.color, padding: '1px 8px', borderRadius: 10, minWidth: 52, textAlign: 'center' }}>{info.label}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.ai_summary || m.raw_text}</span>
            {m.due_at && <span style={{ flexShrink: 0, fontSize: 10, color: '#9ca3af' }}>{fmtDueAt(m.due_at, m.has_time)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// 完了ビュー（終了フォルダ・122）
//   チェック/「完了」で done 化したメモを完了日の新しい順に一覧。
//   「元に戻す（未完了化）」と「削除」を用意。アクティブ表示からは外れている。
// ============================================================
function DoneView(props: {
  memos: Memo[]; categoryName: (id: string | null) => string | null;
  onPatch: (id: string, p: Partial<Memo>) => void; onDelete: (id: string) => void;
}) {
  const { memos, categoryName, onPatch, onDelete } = props;
  if (memos.length === 0) return <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>完了したメモはまだありません</p>;
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', margin: '0 0 10px' }}>
        チェック/「完了」で終えたメモが、完了日の新しい順にここに集まります（{memos.length}件）。
      </p>
      {memos.map((m) => {
        const q = (m.quadrant ?? 4) as QuadrantNum;
        const s = QUADRANT[q];
        const catName = categoryName(m.category_id);
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color,#e5e7eb)', borderLeft: `3px solid ${s.color}`, borderRadius: 8, padding: '8px 12px', marginBottom: 6, background: 'var(--bg-secondary,#fff)' }}>
            <span style={{ flexShrink: 0, color: '#1D9E75', fontSize: 14 }}>✓</span>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 7px', borderRadius: 10 }}>{s.short}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#6b7280', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.ai_summary || m.raw_text}</span>
            {catName && <span style={{ flexShrink: 0, fontSize: 10, color: '#9ca3af' }}>#{catName}</span>}
            {m.completed_at && <span style={{ flexShrink: 0, fontSize: 10, color: '#1D9E75' }}>完了 {fmtCompleted(m.completed_at)}</span>}
            <button onClick={() => onPatch(m.id, { status: 'triaged' })} style={{ ...linkBtn, border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>元に戻す</button>
            <button onClick={() => onDelete(m.id)} style={{ ...linkBtn, flexShrink: 0 }}>削除</button>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 整理済みカード（Phase1）
// ============================================================
// AI抽出日時の確認・編集・クリア（human-in-the-loop）。終日⇄時刻つきを「時刻指定」で切替。
function DueAtField(props: { memo: Memo; onPatch: (id: string, p: Partial<Memo>) => void }) {
  const { memo, onPatch } = props;
  const hasTime = memo.has_time;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, borderTop: '1px solid #00000010', paddingTop: 10 }}>
      <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600 }}>📅 日時（AI抽出・編集可）</span>
      {hasTime ? (
        <input type="datetime-local" value={isoToLocalDT(memo.due_at)} onChange={(e) => onPatch(memo.id, { due_at: localDTToISO(e.target.value), has_time: true })} style={dateInput} />
      ) : (
        <input type="date" value={isoToDateInput(memo.due_at)} onChange={(e) => onPatch(memo.id, { due_at: dateToISO(e.target.value), has_time: false })} style={dateInput} />
      )}
      <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
        <input type="checkbox" checked={hasTime} onChange={(e) => onPatch(memo.id, { has_time: e.target.checked })} /> 時刻指定
      </label>
      {memo.due_at
        ? <button onClick={() => onPatch(memo.id, { due_at: null, has_time: false })} style={linkBtn}>クリア</button>
        : <span style={{ fontSize: 10, color: '#9ca3af' }}>日付を選ぶとカレンダー/計画に表示</span>}
    </div>
  );
}

function TriagedCard(props: {
  memo: Memo; categories: Category[]; goals: Goal[];
  categoryName: (id: string | null) => string | null; goalTitleById: (id: string | null) => string | null;
  todos: Todo[]; onPatch: (id: string, p: Partial<Memo>) => void; onDelete: (id: string) => void; onToggleTodo: (t: Todo) => void;
  collapsible?: boolean; // true: 折りたたみ式（1行・クリックで展開）。インボックスで使用
}) {
  const { memo, categories, goals, categoryName, goalTitleById, todos, onPatch, onDelete, onToggleTodo, collapsible } = props;
  const [open, setOpen] = useState(!collapsible); // 折りたたみ対象は既定で閉じる
  const q = (memo.quadrant ?? 4) as QuadrantNum;
  const s = QUADRANT[q];
  const sel: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 6, padding: '4px 6px', fontSize: 12, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };
  const title = memo.ai_summary || memo.raw_text.split('\n')[0];
  const catName = categoryName(memo.category_id);

  return (
    <div style={{ border: `1px solid ${s.color}`, background: s.bg, borderRadius: 12, marginBottom: 10, boxShadow: s.emphasis ? `0 0 0 2px ${s.color}33` : undefined, overflow: 'hidden' }}>
      {/* 1行ヘッダ（クリックで開閉・アコーディオン） */}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: s.color, background: '#ffffffcc', padding: '2px 9px', borderRadius: 20 }}>{s.short}{s.emphasis && ' ★'}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {catName && <span style={{ flexShrink: 0, fontSize: 10, color: '#6b7280', background: '#ffffffaa', padding: '1px 7px', borderRadius: 10 }}>#{catName}</span>}
        {memo.due_at && <span style={{ flexShrink: 0, fontSize: 10, color: '#1D9E75' }}>📅 {fmtDueAt(memo.due_at, memo.has_time)}</span>}
        {(() => { const di = dueInfo(memo.due_at); return di ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#fff', background: di.color, padding: '1px 7px', borderRadius: 10 }}>{di.label}</span> : null; })()}
        <span style={{ flexShrink: 0, fontSize: 11, color: '#9ca3af' }} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', margin: 0, whiteSpace: 'pre-wrap' }}>{memo.raw_text}</p>
          {memo.ai_reason && <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', marginTop: 8 }}>💡 {memo.ai_reason}</p>}
          {goalTitleById(memo.goal_ref) && <p style={{ fontSize: 12, color: '#1D9E75', marginTop: 4 }}>🎯 {goalTitleById(memo.goal_ref)}</p>}

          {todos.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', borderTop: '1px solid #00000010', paddingTop: 8 }}>
              {todos.map((t) => (
                <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '2px 0' }}>
                  <input type="checkbox" checked={t.done} onChange={() => onToggleTodo(t)} />
                  <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9ca3af' : 'inherit' }}>{t.title}</span>
                  {t.scheduled_date && <span style={{ fontSize: 10, color: '#1D9E75', marginLeft: 'auto' }}>📅 {t.scheduled_date}</span>}
                </li>
              ))}
            </ul>
          )}

          {/* AI抽出日時（確認・編集・クリア） */}
          <DueAtField memo={memo} onPatch={onPatch} />

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
      )}
    </div>
  );
}

// ============================================================
// 計画ビュー（横断TODO + 今日/今週）Phase2
// ============================================================
type SortMode = 'quadrant' | 'due' | 'manual';
function PlanView(props: {
  todos: Todo[]; memoById: (id: string) => Memo | null; categories: Category[];
  categoryName: (id: string | null) => string | null; effQuadrant: (t: Todo) => QuadrantNum;
  onToggle: (t: Todo) => void; onPatch: (id: string, p: Partial<Todo>) => void;
}) {
  const { todos, memoById, categories, categoryName, effQuadrant, onToggle, onPatch } = props;
  const [openOnly, setOpenOnly] = useState(true);
  const [quadFilter, setQuadFilter] = useState<0 | QuadrantNum>(0);
  const [catFilter, setCatFilter] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('quadrant');

  const today = localToday();
  const { start, end } = weekRange();
  const catOf = (t: Todo) => memoById(t.memo_id)?.category_id ?? null;

  const filtered = useMemo(() => {
    let list = todos.slice();
    if (openOnly) list = list.filter((t) => !t.done);
    if (quadFilter) list = list.filter((t) => effQuadrant(t) === quadFilter);
    if (catFilter) list = list.filter((t) => catOf(t) === catFilter);
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (sortMode === 'manual') return a.sort_order - b.sort_order;
      if (sortMode === 'due') {
        const da = planDate(a), db = planDate(b);
        if (da && db && da !== db) return da < db ? -1 : 1;
        if (!!da !== !!db) return da ? -1 : 1;
        return effQuadrant(a) - effQuadrant(b);
      }
      // quadrant
      const qa = effQuadrant(a), qb = effQuadrant(b);
      if (qa !== qb) return qa - qb;
      const da = planDate(a), db = planDate(b);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (!!da !== !!db) return da ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, openOnly, quadFilter, catFilter, sortMode, effQuadrant]);

  // 今日/今週やること（未完了）
  const todayItems = useMemo(() => todos.filter((t) => !t.done && (planDate(t) === today || effQuadrant(t) === 1)), [todos, today, effQuadrant]);
  const weekItems = useMemo(() => todos.filter((t) => !t.done && inRange(planDate(t), start, end)), [todos, start, end]);

  const move = (t: Todo, dir: -1 | 1) => {
    const idx = filtered.indexOf(t);
    const swap = filtered[idx + dir];
    if (!swap) return;
    onPatch(t.id, { sort_order: swap.sort_order });
    onPatch(swap.id, { sort_order: t.sort_order });
  };

  const usedCats = categories.filter((c) => todos.some((t) => catOf(t) === c.id));

  return (
    <div>
      {/* 今日/今週 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
        <TodayWeekBox title="今日やること" hint="Q1(重要×緊急)は即・本日期日/予定" items={todayItems} memoById={memoById} onToggle={onToggle} />
        <TodayWeekBox title="今週やること" hint="今週の期日・予定日に入っているもの" items={weekItems} memoById={memoById} onToggle={onToggle} />
      </div>

      {/* フィルタ/ソート */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> 未完了のみ
        </label>
        <select value={quadFilter} onChange={(e) => setQuadFilter(Number(e.target.value) as 0 | QuadrantNum)} style={{ ...dateInput, fontSize: 12 }}>
          <option value={0}>全象限</option>
          {([1, 2, 3, 4] as QuadrantNum[]).map((n) => <option key={n} value={n}>{QUADRANT[n].short}: {QUADRANT[n].full}</option>)}
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...dateInput, fontSize: 12 }}>
          <option value="">全カテゴリ</option>
          {usedCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ ...dateInput, fontSize: 12, marginLeft: 'auto' }}>
          <option value="quadrant">並び: 象限優先</option>
          <option value="due">並び: 期日近い順</option>
          <option value="manual">並び: 手動</option>
        </select>
      </div>

      {filtered.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>該当するTODOがありません</p>
        : filtered.map((t) => {
          const m = memoById(t.memo_id);
          const q = effQuadrant(t);
          const s = QUADRANT[q];
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color,#e5e7eb)', borderLeft: `3px solid ${s.color}`, borderRadius: 8, padding: '8px 10px', marginBottom: 6, background: 'var(--bg-secondary,#fff)' }}>
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9ca3af' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                {m && <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.ai_summary || m.raw_text}{categoryName(m.category_id) && ` ・ #${categoryName(m.category_id)}`}</div>}
              </div>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 7px', borderRadius: 10 }}>{s.short}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 9, color: '#9ca3af' }}>締切
                  <input type="date" value={t.due_date ?? ''} onChange={(e) => onPatch(t.id, { due_date: e.target.value || null })} style={{ ...dateInput, marginLeft: 4 }} />
                </label>
                <label style={{ fontSize: 9, color: '#1D9E75' }}>予定
                  <input type="date" value={t.scheduled_date ?? ''} onChange={(e) => onPatch(t.id, { scheduled_date: e.target.value || null })} style={{ ...dateInput, marginLeft: 4 }} />
                </label>
              </div>
              <button onClick={() => downloadICS(`todo-${t.id}.ics`, buildICS([{ uid: t.id, title: t.title, date: planDate(t) || localToday(), dueAt: t.due_at, hasTime: t.has_time }]))} title=".icsで書き出し" style={{ ...linkBtn, fontSize: 14 }}>📅</button>
              {sortMode === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => move(t, -1)} style={{ ...linkBtn, lineHeight: 1, padding: 0 }}>▲</button>
                  <button onClick={() => move(t, 1)} style={{ ...linkBtn, lineHeight: 1, padding: 0 }}>▼</button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function TodayWeekBox(props: { title: string; hint: string; items: Todo[]; memoById: (id: string) => Memo | null; onToggle: (t: Todo) => void }) {
  const { title, hint, items, memoById, onToggle } = props;
  return (
    <div style={{ background: 'var(--bg-secondary,#fff)', border: '1px solid var(--border-color,#e5e7eb)', borderRadius: 12, padding: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>{title} <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>{items.length}</span></h3>
      <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 8px' }}>{hint}</p>
      {items.length === 0 ? <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 8 }}>なし</p>
        : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.slice(0, 8).map((t) => {
            const q = (t.quadrant ?? memoById(t.memo_id)?.quadrant ?? 4) as QuadrantNum;
            return (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0' }}>
                <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} />
                <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: QUADRANT[q].color }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              </li>
            );
          })}
        </ul>}
    </div>
  );
}

// ============================================================
// カレンダービュー（月ビュー + アジェンダ + .ics一括）Phase2
// ============================================================
function CalendarView(props: { todos: Todo[]; memoById: (id: string) => Memo | null; onToggle: (t: Todo) => void }) {
  const { todos, memoById, onToggle } = props;
  const now = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() }); // m: 0-11

  // 日付→TODO（予定日優先、なければ締切）
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos) {
      const d = planDate(t);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    return map;
  }, [todos]);

  const first = new Date(ym.y, ym.m, 1);
  const startPad = (first.getDay() + 6) % 7; // 月曜始まり
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym.y}-${pad(ym.m + 1)}-${pad(d)}`);
  const today = localToday();

  const prev = () => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }));
  const next = () => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }));

  // アジェンダ（今日以降の予定/締切、近い順）
  const agenda = useMemo(() =>
    todos.filter((t) => !t.done && planDate(t) && planDate(t)! >= today)
      .sort((a, b) => (planDate(a)! < planDate(b)! ? -1 : 1)).slice(0, 30),
    [todos, today]);

  const exportAll = () => {
    const events = todos.filter((t) => planDate(t)).map((t) => ({ uid: t.id, title: t.title, date: planDate(t)!, dueAt: t.due_at, hasTime: t.has_time }));
    if (events.length === 0) return;
    downloadICS('xlumina-memo-todos.ics', buildICS(events));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prev} style={{ ...btnGhost, padding: '4px 10px' }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{ym.y}年{ym.m + 1}月</span>
          <button onClick={next} style={{ ...btnGhost, padding: '4px 10px' }}>›</button>
        </div>
        <button onClick={exportAll} style={{ ...btnGhost, padding: '6px 12px' }}>📅 全予定を.icsで書き出し</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 16 }}>
        {['月', '火', '水', '木', '金', '土', '日'].map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>{w}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} style={{ minHeight: 64, border: '1px solid var(--border-color,#eee)', borderRadius: 6, padding: 3, background: d === today ? 'rgba(29,158,117,0.08)' : 'var(--bg-secondary,#fff)', opacity: d ? 1 : 0.3 }}>
            {d && <>
              <div style={{ fontSize: 10, color: d === today ? '#1D9E75' : '#9ca3af', fontWeight: d === today ? 700 : 400 }}>{Number(d.slice(-2))}</div>
              {(byDate.get(d) || []).slice(0, 3).map((t) => {
                const q = (t.quadrant ?? memoById(t.memo_id)?.quadrant ?? 4) as QuadrantNum;
                return (
                  <div key={t.id} title={t.title} style={{ fontSize: 9, marginTop: 1, padding: '1px 3px', borderRadius: 3, background: QUADRANT[q].bg, color: QUADRANT[q].color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.done ? 'line-through' : 'none' }}>{t.has_time && t.due_at ? `${timeOf(t.due_at)} ` : ''}{t.title}</div>
                );
              })}
              {(byDate.get(d) || []).length > 3 && <div style={{ fontSize: 9, color: '#9ca3af' }}>+{(byDate.get(d) || []).length - 3}</div>}
            </>}
          </div>
        ))}
      </div>

      <h3 style={{ ...sectionTitle, marginBottom: 8 }}>今後の予定（アジェンダ）</h3>
      {agenda.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 16, fontSize: 13 }}>予定日・締切のあるTODOがありません</p>
        : agenda.map((t) => {
          const m = memoById(t.memo_id);
          const q = (t.quadrant ?? m?.quadrant ?? 4) as QuadrantNum;
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color,#e5e7eb)', borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 13, background: 'var(--bg-secondary,#fff)' }}>
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} />
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#1D9E75', minWidth: 78 }}>{planDate(t)}{t.has_time && t.due_at ? ` ${timeOf(t.due_at)}` : ''}{t.scheduled_date ? ' 予定' : ' 締切'}</span>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: QUADRANT[q].color, background: QUADRANT[q].bg, padding: '2px 6px', borderRadius: 10 }}>{QUADRANT[q].short}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <button onClick={() => downloadICS(`todo-${t.id}.ics`, buildICS([{ uid: t.id, title: t.title, date: planDate(t)!, dueAt: t.due_at, hasTime: t.has_time }]))} style={{ ...linkBtn, marginLeft: 'auto', fontSize: 14 }}>📅</button>
            </div>
          );
        })}
    </div>
  );
}

// ============================================================
// 第2象限フォーカスビュー（Phase3）
// ============================================================
function FocusView(props: {
  memos: Memo[]; todos: Todo[]; goalTitleById: (id: string | null) => string | null;
  onToggleTodo: (t: Todo) => void; onPatchTodo: (id: string, p: Partial<Todo>) => void;
  onAddTodo: (memoId: string, title: string, extra?: Partial<Todo>) => Promise<Todo | null>;
}) {
  const { memos, todos, goalTitleById, onToggleTodo, onPatchTodo, onAddTodo } = props;
  const [coach, setCoach] = useState<Record<string, { loading: boolean; message: string }>>({});

  const fetchCoach = async (m: Memo) => {
    if (coach[m.id]?.loading) return;
    setCoach((p) => ({ ...p, [m.id]: { loading: true, message: '' } }));
    try {
      const res = await fetch('/api/memo-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: m.ai_summary || m.raw_text, goal: goalTitleById(m.goal_ref) || '' }),
      });
      const d = res.ok ? await res.json() : { message: '' };
      setCoach((p) => ({ ...p, [m.id]: { loading: false, message: d.message || '' } }));
    } catch {
      setCoach((p) => ({ ...p, [m.id]: { loading: false, message: '' } }));
    }
  };

  if (memos.length === 0) return (
    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 13 }}>
      第2象限（重要×非緊急）の項目はまだありません。<br />メモを整理すると、緊急ではないが目標に資するものがここに集まります。
    </div>
  );

  return (
    <div>
      <div style={{ border: '1px solid #1D9E75', background: 'rgba(29,158,117,0.06)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', color: '#1D9E75' }}>🌱 第2象限フォーカス</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', margin: 0 }}>
          緊急ではないが、最も人生を前に進める領域。ここに先に時間を払う（<b style={{ color: '#1D9E75' }}>代価の先払い</b>）。<br />
          目標への寄与度が高い順に並べています。「いつ投資する？」に予定日を置き、予定に落とし込みましょう。
        </p>
      </div>

      {memos.map((m) => {
        const mt = todos.filter((t) => t.memo_id === m.id);
        const c = coach[m.id];
        return (
          <div key={m.id} style={{ border: '1px solid #1D9E75', background: 'rgba(29,158,117,0.10)', borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 0 0 2px rgba(29,158,117,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{m.ai_summary || m.raw_text}</p>
                {goalTitleById(m.goal_ref) && <p style={{ fontSize: 12, color: '#1D9E75', margin: '4px 0 0' }}>🎯 {goalTitleById(m.goal_ref)}</p>}
              </div>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#1D9E75', background: '#fff', padding: '2px 10px', borderRadius: 20, height: 'fit-content' }}>寄与 {m.importance ?? '-'}/5</span>
            </div>

            {/* TODOがある場合：各TODOに予定日 */}
            {mt.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', borderTop: '1px solid #00000010', paddingTop: 10 }}>
                {mt.map((t) => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
                    <input type="checkbox" checked={t.done} onChange={() => onToggleTodo(t)} />
                    <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9ca3af' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <label style={{ fontSize: 10, color: '#1D9E75', flexShrink: 0 }}>いつ投資する？
                      <input type="date" value={t.scheduled_date ?? ''} onChange={(e) => onPatchTodo(t.id, { scheduled_date: e.target.value || null })} style={{ ...dateInput, marginLeft: 4 }} />
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              // TODOが無い（アイデア/メモ）場合：実行予定を作って予定に落とす
              <div style={{ marginTop: 10, borderTop: '1px solid #00000010', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#1D9E75' }}>いつ投資する？</span>
                <input type="date" onChange={(e) => { if (e.target.value) onAddTodo(m.id, m.ai_summary || m.raw_text.slice(0, 40), { scheduled_date: e.target.value, quadrant: 2 }); }} style={dateInput} />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>日付を選ぶと実行予定が作成され、計画/カレンダーに表示されます</span>
              </div>
            )}

            {/* コーチング（任意・短文・AI失敗時は非表示） */}
            <div style={{ marginTop: 10 }}>
              {!c ? (
                <button onClick={() => fetchCoach(m)} style={{ ...linkBtn, color: '#1D9E75', fontSize: 12 }}>💬 コーチングを見る</button>
              ) : c.loading ? (
                <span style={{ fontSize: 12, color: '#9ca3af' }}>💬 …</span>
              ) : c.message ? (
                <p style={{ fontSize: 12, color: '#1D9E75', fontStyle: 'italic', margin: 0, background: '#fff', borderRadius: 8, padding: '8px 10px' }}>💬 {c.message}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// カテゴリ別ビュー（Phase1）
// ============================================================
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

// ============================================================
// 4象限ビュー（Phase1）
// ============================================================
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
                    {(() => { const di = dueInfo(m.due_at); return di ? <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: di.color, padding: '1px 6px', borderRadius: 8, marginLeft: 6 }}>{di.label}</span> : null; })()}
                  </li>
                ))}
              </ul>}
          </div>
        );
      })}
    </div>
  );
}
