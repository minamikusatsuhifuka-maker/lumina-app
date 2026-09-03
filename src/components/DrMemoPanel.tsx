'use client';

// 208（案A）: 追従「🗒 カテゴリメモ」— ボタンを押すと右下に非モーダルのパネルが開き、
// カテゴリを選んで（または作って）メモをDBに保存する。保存先は AIメモ（112〜127）の memos / memo_categories。
//
// - 表示可否は🎛表示設定（既定 off・R-48）。縦位置は useFloatingSlot('drmemo') が決める（座標の直書きをしない）
// - 📝メモ小窓（PipMemoPanel＝localStorage・PiP別窓のその場の走り書き）とは用途が違うので別枠
// - ディープリサーチ画面ではお題が context_ref に自動で入る（lib/dr-memo-context.ts）
// - 一覧は必ずページング（DR_MEMO_PAGE_SIZE）。削除は2段階（確認ダイアログは使わない）
// - カテゴリ削除ではメモを消さず未分類に落とす（FK ON DELETE SET NULL）。その旨を画面に出す

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTheme, useFloatingSlot } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/Toast';
import { jstDateTimeString } from '@/lib/jst';
import { getDrMemoContext, subscribeDrMemoContext } from '@/lib/dr-memo-context';
import {
  DR_MEMO_CATEGORY_COLORS,
  DR_MEMO_CATEGORY_KEY,
  DR_MEMO_PAGE_SIZE,
  DR_MEMO_UNCATEGORIZED,
  DR_MEMO_UNCATEGORIZED_LABEL,
  categoryIdOf,
  drMemoToastMessage,
  memoListQuery,
  moveItem,
  resolveCategoryChoice,
  sortOrderPatches,
} from '@/lib/dr-memo';

type Category = { id: string; name: string; color: string | null; is_auto: boolean; sort_order: number; memo_count: number };
type Memo = { id: string; raw_text: string; category_id: string | null; context_ref: string | null; created_at: string };

const ACCENT = '#6c63ff';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const smallBtn: CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};
// R-43: 警告色は #B45309（白背景・クリーム背景とも 4.5:1 以上）
const dangerBtn: CSSProperties = { ...smallBtn, color: '#B45309', borderColor: 'rgba(180,83,9,0.5)' };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DrMemoPanel() {
  const { floating } = useTheme();
  const fabBottom = useFloatingSlot('drmemo');
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [choice, setChoice] = useState<string>(DR_MEMO_UNCATEGORIZED);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmMemoId, setConfirmMemoId] = useState<string | null>(null);
  const [confirmCatId, setConfirmCatId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [error, setError] = useState('');
  const saveLock = useRef(false); // R-87: 二重発火は同期的な ref で閉じる

  useEffect(() => {
    setMounted(true);
    setContext(getDrMemoContext());
    return subscribeDrMemoContext(setContext);
  }, []);

  const loadCategories = useCallback(async (): Promise<Category[]> => {
    const res = await fetch('/api/memo-categories');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list: Category[] = ((await res.json()).categories ?? []).map((c: Category) => ({ ...c, memo_count: c.memo_count ?? 0, sort_order: c.sort_order ?? 0 }));
    setCats(list);
    return list;
  }, []);

  const loadMemos = useCallback(async (c: string, offset = 0) => {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/memos?${memoListQuery(c, offset, DR_MEMO_PAGE_SIZE)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: Memo[] = data.memos ?? [];
      setMemos((prev) => (offset > 0 ? [...prev, ...rows] : rows));
      setHasMore(!!data.has_more);
      setError('');
    } catch (e) {
      // 一覧の失敗は入力を妨げない（R-39）。理由は出す
      setError(`一覧の取得に失敗しました（${errText(e)}）`);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 開いたときに読み込む（閉じている間は通信しない）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadCategories();
        if (cancelled) return;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(DR_MEMO_CATEGORY_KEY);
        } catch {
          /* 読めない環境は未分類 */
        }
        const c = resolveCategoryChoice(saved, list.map((x) => x.id));
        setChoice(c);
        await loadMemos(c);
      } catch (e) {
        if (!cancelled) setError(`カテゴリの取得に失敗しました（${errText(e)}）`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loadCategories, loadMemos]);

  const selectChoice = (c: string) => {
    setChoice(c);
    try {
      localStorage.setItem(DR_MEMO_CATEGORY_KEY, c);
    } catch {
      /* noop */
    }
    setEditingId(null);
    setConfirmMemoId(null);
    void loadMemos(c);
  };

  const catOf = (id: string | null) => (id ? cats.find((c) => c.id === id) ?? null : null);

  const save = async () => {
    if (saveLock.current) return;
    const body = text.trim();
    if (!body) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const categoryId = categoryIdOf(choice);
      const res = await fetch('/api/memos', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ raw_text: body, category_id: categoryId, context_ref: getDrMemoContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `保存に失敗しました（HTTP ${res.status}）`);
        showToast('保存に失敗しました。本文は入力欄に残っています', 'error');
        return;
      }
      setText('');
      setError('');
      const memo: Memo = data.memo;
      setMemos((prev) => [memo, ...prev]);
      if (memo.category_id) setCats((prev) => prev.map((c) => (c.id === memo.category_id ? { ...c, memo_count: c.memo_count + 1 } : c)));
      showToast(drMemoToastMessage(catOf(categoryId)?.name ?? null), 'success');
    } catch (e) {
      setError(`通信エラー（${errText(e)}）`);
      showToast('保存に失敗しました。本文は入力欄に残っています', 'error');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/memo-categories', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `カテゴリの作成に失敗しました（HTTP ${res.status}）`);
        return;
      }
      const cat: Category = { ...data.category, memo_count: data.category?.memo_count ?? 0, sort_order: data.category?.sort_order ?? 0 };
      setCats((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]));
      setNewCatName('');
      setShowNewCat(false);
      selectChoice(cat.id);
      showToast(`📁 カテゴリ「${cat.name}」を作成しました`, 'success');
    } catch (e) {
      setError(`通信エラー（${errText(e)}）`);
    }
  };

  const patchMemo = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/memos/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).memo as Memo;
  };

  const saveEdit = async (id: string) => {
    const body = editText.trim();
    if (!body) return;
    try {
      const memo = await patchMemo(id, { raw_text: body });
      setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, raw_text: memo.raw_text } : m)));
      setEditingId(null);
      showToast('✏️ メモを更新しました', 'success');
    } catch (e) {
      setError(`更新に失敗しました（${errText(e)}）`);
    }
  };

  const moveMemoTo = async (id: string, categoryId: string | null) => {
    try {
      const memo = await patchMemo(id, { category_id: categoryId });
      const before = memos.find((m) => m.id === id)?.category_id ?? null;
      setCats((prev) =>
        prev.map((c) => {
          if (c.id === before) return { ...c, memo_count: Math.max(0, c.memo_count - 1) };
          if (c.id === memo.category_id) return { ...c, memo_count: c.memo_count + 1 };
          return c;
        }),
      );
      // 絞り込み中の一覧からは外れる（別カテゴリへ移したため）
      setMemos((prev) => prev.filter((m) => m.id !== id));
      showToast(`📁 「${catOf(memo.category_id)?.name ?? DR_MEMO_UNCATEGORIZED_LABEL}」へ移動しました`, 'success');
    } catch (e) {
      setError(`移動に失敗しました（${errText(e)}）`);
    }
  };

  const deleteMemo = async (id: string) => {
    try {
      const res = await fetch(`/api/memos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const target = memos.find((m) => m.id === id);
      setMemos((prev) => prev.filter((m) => m.id !== id));
      if (target?.category_id) setCats((prev) => prev.map((c) => (c.id === target.category_id ? { ...c, memo_count: Math.max(0, c.memo_count - 1) } : c)));
      setConfirmMemoId(null);
      showToast('🗑 メモを削除しました', 'info');
    } catch (e) {
      setError(`削除に失敗しました（${errText(e)}）`);
    }
  };

  const patchCategory = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/memo-categories', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ id, ...patch }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).category as Category;
  };

  const saveRename = async (id: string) => {
    const name = renameText.trim();
    if (!name) return;
    try {
      const cat = await patchCategory(id, { name });
      setCats((prev) => prev.map((c) => (c.id === id ? { ...c, name: cat.name } : c)));
      setRenameId(null);
    } catch (e) {
      setError(`名前の変更に失敗しました（${errText(e)}）`);
    }
  };

  const setColor = async (id: string, color: string | null) => {
    try {
      const cat = await patchCategory(id, { color });
      setCats((prev) => prev.map((c) => (c.id === id ? { ...c, color: cat.color } : c)));
    } catch (e) {
      setError(`色の変更に失敗しました（${errText(e)}）`);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = moveItem(cats, index, dir);
    setCats(next);
    try {
      for (const p of sortOrderPatches(next)) await patchCategory(p.id, { sort_order: p.sort_order });
      setCats((prev) => prev.map((c, i) => ({ ...c, sort_order: i })));
    } catch (e) {
      setError(`並び替えの保存に失敗しました（${errText(e)}）`);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const res = await fetch(`/api/memo-categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCats((prev) => prev.filter((c) => c.id !== id));
      setConfirmCatId(null);
      showToast(`📁 カテゴリを削除しました。メモは「${DR_MEMO_UNCATEGORIZED_LABEL}」に移動しました`, 'info');
      // 選択中のカテゴリを消したら未分類へ（メモはそこに残っている）。他を見ていても未分類の件数が変わるので一覧は取り直す
      if (choice === id) selectChoice(DR_MEMO_UNCATEGORIZED);
      else void loadMemos(choice);
    } catch (e) {
      setError(`カテゴリの削除に失敗しました（${errText(e)}）`);
    }
  };

  if (!mounted) return null;
  // 243: 設定でoffなら何も描かない（既定off・R-48）
  if (!floating.drmemo) return null;

  const chip = (active: boolean, color?: string | null): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    border: active ? `2px solid ${color || ACCENT}` : '1px solid var(--border)',
    background: active ? `${color || ACCENT}18` : 'var(--bg-primary)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <>
      <button
        type="button"
        data-drmemo-fab
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'カテゴリメモを閉じる' : 'カテゴリメモを開く（カテゴリ分けして保存）'}
        style={{
          position: 'fixed',
          right: 16,
          bottom: fabBottom,
          zIndex: 9998,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: open ? `2px solid ${ACCENT}` : '1px solid rgba(108,99,255,0.3)',
          background: open ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : '#1a1a2e',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
        }}
      >
        🗒
      </button>

      {open && (
        <div
          data-drmemo-panel
          role="dialog"
          aria-modal="false"
          aria-label="カテゴリメモ"
          style={{
            position: 'fixed',
            // 追従ボタン列（right:16・幅48）の**左隣**に置き、上段のボタン（📖等・z 9998）と一切重ねない（R-48）。
            // 当初は「自分のボタンの1段上」に置いたが、上段のボタンがパネル右下の🗑を覆ってクリックできなかった（C94で実測）
            right: 76,
            bottom: fabBottom,
            zIndex: 9997,
            width: 'min(400px, calc(100vw - 92px))',
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            color: 'var(--text-primary)',
          }}
        >
          {/* ── ヘッダー ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>🗒 カテゴリメモ</span>
            {context && (
              <span data-drmemo-context title={context} style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                🔭 お題: {context}
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button type="button" data-drmemo-manage aria-pressed={manage} onClick={() => setManage((v) => !v)} title="カテゴリの管理（名前・色・並び・削除）" style={{ ...smallBtn, borderColor: manage ? ACCENT : 'var(--border)' }}>
                ⚙
              </button>
              <button type="button" data-drmemo-close onClick={() => setOpen(false)} title="閉じる" style={smallBtn}>
                ✕
              </button>
            </span>
          </div>

          {/* ── カテゴリ選択 ── */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
            <button type="button" data-drmemo-cat={DR_MEMO_UNCATEGORIZED} aria-pressed={choice === DR_MEMO_UNCATEGORIZED} onClick={() => selectChoice(DR_MEMO_UNCATEGORIZED)} style={chip(choice === DR_MEMO_UNCATEGORIZED)}>
              {DR_MEMO_UNCATEGORIZED_LABEL}
            </button>
            {cats.map((c) => (
              <button key={c.id} type="button" data-drmemo-cat={c.id} aria-pressed={choice === c.id} onClick={() => selectChoice(c.id)} style={chip(choice === c.id, c.color)} title={c.name}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || ACCENT, flexShrink: 0 }} />
                {c.name}
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.memo_count}</span>
              </button>
            ))}
            {showNewCat ? (
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  data-drmemo-newcat-input
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createCategory();
                    if (e.key === 'Escape') setShowNewCat(false);
                  }}
                  placeholder="カテゴリ名"
                  style={{ width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12 }}
                />
                <button type="button" data-drmemo-newcat-create onClick={() => void createCategory()} disabled={!newCatName.trim()} style={{ ...smallBtn, opacity: newCatName.trim() ? 1 : 0.5 }}>
                  作成
                </button>
              </span>
            ) : (
              <button type="button" data-drmemo-newcat onClick={() => setShowNewCat(true)} style={chip(false)} title="新しいカテゴリを作って選ぶ">
                ＋新規
              </button>
            )}
          </div>

          {/* ── カテゴリ管理（⚙） ── */}
          {manage && (
            <div data-drmemo-manage-list style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {cats.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>カテゴリはまだありません（「＋新規」で作れます）</div>}
              {cats.map((c, i) => (
                <div key={c.id} data-drmemo-cat-row={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                  {renameId === c.id ? (
                    <>
                      <input
                        data-drmemo-cat-rename-input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRename(c.id);
                          if (e.key === 'Escape') setRenameId(null);
                        }}
                        style={{ flex: 1, minWidth: 100, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12 }}
                      />
                      <button type="button" data-drmemo-cat-rename-save onClick={() => void saveRename(c.id)} style={smallBtn}>
                        保存
                      </button>
                      <button type="button" onClick={() => setRenameId(null)} style={smallBtn}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || ACCENT, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ display: 'inline-flex', gap: 3 }} title="色">
                        {DR_MEMO_CATEGORY_COLORS.map((col) => (
                          <button
                            key={col}
                            type="button"
                            data-drmemo-cat-color={col}
                            onClick={() => void setColor(c.id, col)}
                            aria-label={`色 ${col}`}
                            style={{ width: 14, height: 14, borderRadius: '50%', background: col, border: c.color === col ? '2px solid var(--text-primary)' : '1px solid transparent', cursor: 'pointer', padding: 0 }}
                          />
                        ))}
                      </span>
                      <button type="button" data-drmemo-cat-up onClick={() => void move(i, -1)} disabled={i === 0} style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1 }} title="上へ">
                        ▲
                      </button>
                      <button type="button" data-drmemo-cat-down onClick={() => void move(i, 1)} disabled={i === cats.length - 1} style={{ ...smallBtn, opacity: i === cats.length - 1 ? 0.4 : 1 }} title="下へ">
                        ▼
                      </button>
                      <button
                        type="button"
                        data-drmemo-cat-rename
                        onClick={() => {
                          setRenameId(c.id);
                          setRenameText(c.name);
                        }}
                        style={smallBtn}
                      >
                        ✏
                      </button>
                      {confirmCatId === c.id ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#B45309' }}>
                          <span>メモは未分類に移動します（消えません）</span>
                          <button type="button" data-drmemo-cat-delete-confirm onClick={() => void deleteCategory(c.id)} style={dangerBtn}>
                            本当に削除
                          </button>
                          <button type="button" onClick={() => setConfirmCatId(null)} style={smallBtn}>
                            取消
                          </button>
                        </span>
                      ) : (
                        <button type="button" data-drmemo-cat-delete onClick={() => setConfirmCatId(c.id)} style={dangerBtn} title="カテゴリを削除（メモは未分類に移動）">
                          🗑
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── 入力 ── */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <textarea
              data-drmemo-input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder={`思いついたことをそのまま（保存先: ${catOf(categoryIdOf(choice))?.name ?? DR_MEMO_UNCATEGORIZED_LABEL}）`}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⌘/Ctrl + Enter で保存</span>
              <button
                type="button"
                data-drmemo-save
                onClick={() => void save()}
                disabled={saving || !text.trim()}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving || !text.trim() ? 'not-allowed' : 'pointer', opacity: saving || !text.trim() ? 0.6 : 1 }}
              >
                {saving ? '保存中…' : '💾 保存'}
              </button>
            </div>
            {error && (
              <div data-drmemo-error style={{ marginTop: 6, fontSize: 11, color: '#B45309' }}>
                {error}
              </div>
            )}
          </div>

          {/* ── 一覧（このカテゴリ・新しい順・ページング） ── */}
          <div data-drmemo-list style={{ overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
            {loadingList && memos.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>読み込み中…</div>}
            {!loadingList && memos.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>このカテゴリのメモはまだありません</div>}
            {memos.map((m) => (
              <div key={m.id} data-drmemo-item={m.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                {editingId === m.id ? (
                  <>
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          void saveEdit(m.id);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        data-drmemo-edit-category
                        value={m.category_id ?? DR_MEMO_UNCATEGORIZED}
                        onChange={(e) => void moveMemoTo(m.id, categoryIdOf(e.target.value))}
                        title="別のカテゴリへ移す"
                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      >
                        <option value={DR_MEMO_UNCATEGORIZED}>{DR_MEMO_UNCATEGORIZED_LABEL}</option>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button type="button" data-drmemo-edit-save onClick={() => void saveEdit(m.id)} disabled={!editText.trim()} style={smallBtn}>
                          保存
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} style={smallBtn}>
                          取消
                        </button>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* メモは利用者の入力（編集する文章）なので生のまま（R-45 の「編集」側） */}
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.raw_text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{jstDateTimeString(m.created_at)}</span>
                      {m.category_id && catOf(m.category_id) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: catOf(m.category_id)?.color || ACCENT }} />
                          {catOf(m.category_id)?.name}
                        </span>
                      )}
                      {m.context_ref && (
                        <span data-drmemo-item-context title={m.context_ref} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                          🔭 {m.context_ref}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          data-drmemo-edit
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.raw_text);
                            setConfirmMemoId(null);
                          }}
                          style={smallBtn}
                          title="編集・カテゴリ変更"
                        >
                          ✏
                        </button>
                        {confirmMemoId === m.id ? (
                          <>
                            <button type="button" data-drmemo-delete-confirm onClick={() => void deleteMemo(m.id)} style={dangerBtn}>
                              本当に削除
                            </button>
                            <button type="button" onClick={() => setConfirmMemoId(null)} style={smallBtn}>
                              取消
                            </button>
                          </>
                        ) : (
                          <button type="button" data-drmemo-delete onClick={() => setConfirmMemoId(m.id)} style={dangerBtn} title="削除">
                            🗑
                          </button>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {hasMore && (
              <button type="button" data-drmemo-more onClick={() => void loadMemos(choice, memos.length)} disabled={loadingList} style={{ ...smallBtn, alignSelf: 'center' }}>
                {loadingList ? '読み込み中…' : `もっと見る（次の${DR_MEMO_PAGE_SIZE}件）`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
