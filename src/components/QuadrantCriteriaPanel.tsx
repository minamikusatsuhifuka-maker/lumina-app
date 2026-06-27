'use client';

// 🧭 象限の判断基準（編集可能ナレッジ）パネル。
// /api/quadrant-criteria の CRUD を叩き、AI分類プロンプトに注入される“上乗せ”材料を編集する。
// AIは提案・確定は人。ここは判断材料の編集のみで、タスクの象限を自動確定/移動しない。

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

type Quadrant = 'q1' | 'q2' | 'q3' | 'q4' | 'common';
interface Criterion {
  id: string;
  quadrant: Quadrant;
  title: string;
  body: string;
  enabled: boolean;
  sort_order: number;
}

const TABS: { key: Quadrant | 'all'; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'q1', label: '第1(重要×緊急)' },
  { key: 'q2', label: '第2(重要×非緊急)' },
  { key: 'q3', label: '第3(非重要×緊急)' },
  { key: 'q4', label: '第4(非重要×非緊急)' },
  { key: 'common', label: '共通' },
];
const QLABEL: Record<Quadrant, string> = {
  q1: '第1象限',
  q2: '第2象限',
  q3: '第3象限',
  q4: '第4象限',
  common: '共通',
};

const card: React.CSSProperties = {
  border: '1px solid var(--border-color,#e5e7eb)',
  borderRadius: 12,
  padding: 14,
  background: 'var(--bg-secondary,#fff)',
  marginTop: 12,
};
const inputStyle: React.CSSProperties = { border: '1px solid var(--border-color,#d1d5db)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary,#fff)', color: 'var(--text-primary)' };
const btnPrimary: React.CSSProperties = { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const tiny: React.CSSProperties = { background: 'none', border: '1px solid var(--border-color,#d1d5db)', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary,#6b7280)' };

export default function QuadrantCriteriaPanel() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Criterion[]>([]);
  const [tab, setTab] = useState<Quadrant | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  // 追加フォーム
  const [newQuadrant, setNewQuadrant] = useState<Quadrant>('q2');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quadrant-criteria');
      if (!res.ok) { showToast('判断基準の読み込みに失敗しました', 'error'); return; }
      const d = await res.json();
      setItems(Array.isArray(d.criteria) ? d.criteria : []);
      setLoaded(true);
    } catch { showToast('判断基準の読み込みに失敗しました', 'error'); }
  }, [showToast]);

  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);

  const visible = items.filter((c) => tab === 'all' || c.quadrant === tab);

  const add = async () => {
    if (!newTitle.trim() && !newBody.trim()) { showToast('タイトルか本文を入力してください', 'warning'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/quadrant-criteria', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quadrant: newQuadrant, title: newTitle.trim(), body: newBody.trim(), sort_order: items.filter((c) => c.quadrant === newQuadrant).length }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.criterion) { showToast(d.error ?? '追加に失敗しました', 'error'); return; }
      setItems((p) => [...p, d.criterion]);
      setNewTitle(''); setNewBody('');
      showToast('基準を追加しました', 'success');
    } finally { setBusy(false); }
  };

  // 楽観更新＋API反映。失敗時は再読み込みで整合。
  const patch = async (id: string, fields: Partial<Pick<Criterion, 'title' | 'body' | 'enabled' | 'sort_order' | 'quadrant'>>) => {
    setItems((p) => p.map((c) => (c.id === id ? { ...c, ...fields } : c)));
    const res = await fetch('/api/quadrant-criteria', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) { showToast('更新に失敗しました', 'error'); load(); }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems((p) => p.filter((c) => c.id !== id));
    const res = await fetch(`/api/quadrant-criteria?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) { showToast('削除に失敗しました', 'error'); setItems(prev); }
  };

  const startEdit = (c: Criterion) => { setEditingId(c.id); setEditTitle(c.title); setEditBody(c.body); };
  const saveEdit = async () => {
    if (!editingId) return;
    await patch(editingId, { title: editTitle.trim(), body: editBody.trim() });
    setEditingId(null);
  };

  // 並び替え: 同象限内で隣の sort_order と入れ替え。
  const move = async (c: Criterion, dir: -1 | 1) => {
    const sameQ = items.filter((x) => x.quadrant === c.quadrant).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameQ.findIndex((x) => x.id === c.id);
    const swap = sameQ[idx + dir];
    if (!swap) return;
    await patch(c.id, { sort_order: swap.sort_order });
    await patch(swap.id, { sort_order: c.sort_order });
  };

  return (
    <div style={{ ...card }}>
      <button onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        🧭 象限の判断基準（AI分類に加味・編集可）<span style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)' }}>{loaded ? `${items.length}件 ` : ''}{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', margin: '0 0 8px' }}>
            各象限の一般的な判断基準です。AI分類のたびにプロンプトへ加味されます（重要度＝目標逆算・緊急度＝期限 と併用）。AIは提案で、確定は人が行います。
          </p>

          {/* 象限タブ */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ ...tiny, ...(tab === t.key ? { background: '#1D9E75', color: '#fff', borderColor: '#1D9E75' } : {}) }}>{t.label}</button>
            ))}
          </div>

          {/* 一覧 */}
          {loaded && visible.length === 0 && <p style={{ fontSize: 12, color: '#EF9F27' }}>この象限の基準はまだありません。下のフォームで追加できます。</p>}
          {visible.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color,#f0f0f0)' }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="タイトル" style={inputStyle} />
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} placeholder="本文（判断の目安）" rows={2} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={saveEdit} style={btnPrimary}>保存</button>
                    <button onClick={() => setEditingId(null)} style={btnGhost}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, opacity: c.enabled ? 1 : 0.45 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      <span style={{ fontSize: 10, color: '#6b7280', marginRight: 6 }}>{QLABEL[c.quadrant]}</span>{c.title || '（無題）'}
                    </div>
                    {c.body && <div style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.body}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title="上へ" onClick={() => move(c, -1)} style={tiny}>▲</button>
                      <button title="下へ" onClick={() => move(c, 1)} style={tiny}>▼</button>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => patch(c.id, { enabled: !c.enabled })} style={{ ...tiny, ...(c.enabled ? { color: '#1D9E75', borderColor: '#1D9E75' } : {}) }}>{c.enabled ? '有効' : '無効'}</button>
                      <button onClick={() => startEdit(c)} style={tiny}>編集</button>
                      <button onClick={() => remove(c.id)} style={{ ...tiny, color: '#dc2626', borderColor: '#fca5a5' }}>削除</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 追加フォーム */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-color,#e5e7eb)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <select value={newQuadrant} onChange={(e) => setNewQuadrant(e.target.value as Quadrant)} style={{ ...inputStyle, padding: '8px' }}>
                <option value="q1">第1象限(重要×緊急)</option>
                <option value="q2">第2象限(重要×非緊急)</option>
                <option value="q3">第3象限(非重要×緊急)</option>
                <option value="q4">第4象限(非重要×非緊急)</option>
                <option value="common">共通</option>
              </select>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="タイトル(任意)" style={{ ...inputStyle, flex: '1 1 160px' }} />
            </div>
            <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="判断の目安（例：締切はあるが成果への寄与が小さい→委譲・定型化・断る候補）" rows={2} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 6 }} />
            <button onClick={add} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? '⏳ 追加中...' : '＋ 基準を追加'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
