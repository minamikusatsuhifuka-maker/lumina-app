'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 306: 📌 ホーム編集 — サイドバーの「ホーム」の並び・所属・区切り見出しを広い画面で編集する専用ページ
//
// - 左列＝ホーム（編集対象）、右列＝すべてのメニュー（6グループ・定義順・303 の normalizeNavQuery で検索）
// - ドラッグ＆ドロップは既存の @dnd-kit/core（サイドバー旧 EditableHome・AIメモと同じ方式・R-91・新依存なし）。
//   **ボタン（↑ ↓ ✕ ＋）でも全操作が完結**する（iOS のドラッグに依存しない・R-64）
// - 変更はその場で保存（localStorage sidebar_home_items・区切り込みの新形式は後方互換／墓標 sidebar_home_removed）。
//   保存したら HOME_LAYOUT_EVENT を投げ、左のサイドバー本体が即時に追従する＝確認画面を兼ねる
// - 元に戻す（直前1操作・メモリのみ）／既定に戻す（確認1回・R-56）／書き出し・読み込み（JSON・不正なら何も変えない）
// - 改名・アイコンは🎛メニュー名設定のまま（同じ情報を2箇所で編集しない・§3-3）
// - 行全体に title を置かない（R-110）。区切り名は12文字（R-57）・省略記号で幅固定（R-109）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ui/Toast';
import { navCategoryLabelOf, navIconOf, navLabelOf } from '@/lib/nav-labels';
import {
  DEFAULT_HOME_HREFS,
  HOME_DIVIDER_LABEL_MAX,
  HOME_LAYOUT_EVENT,
  HOME_REMOVED_STORAGE_KEY,
  HOME_STORAGE_KEY,
  ITEM_BY_HREF,
  exportHomeLayout,
  homeHrefsOf,
  importHomeLayout,
  navCategories,
  normalizeDividerLabel,
  parseHrefList,
  resolveHomeLayout,
  serializeHomeLayout,
  type HomeEntry,
  type NavItem,
} from '@/lib/nav-items';
import { formatAddedTitle, isNewMenu, matchesNavItem, NAV_NEW_LABEL } from '@/lib/nav-search';
import { jstDateString } from '@/lib/jst';

const ACCENT = '#6c63ff';
const btn: CSSProperties = { padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' };
const iconBtn: CSSProperties = { ...btn, padding: '3px 7px', fontSize: 11 };

type Snapshot = { entries: HomeEntry[]; removed: string[] };

function entryKey(e: HomeEntry): string {
  return e.kind === 'item' ? `item:${e.href}` : `div:${e.id}`;
}

/** 左列の1行（ドラッグ元＋ドロップ先） */
function HomeRow({
  entry,
  index,
  total,
  label,
  icon,
  isNew,
  addedTitle,
  onMove,
  onRemove,
  onRename,
}: {
  entry: HomeEntry;
  index: number;
  total: number;
  label: string;
  icon: string;
  isNew: boolean;
  addedTitle: string;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onRename: (index: number, label: string) => void;
}) {
  const key = entryKey(entry);
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: `home:${key}` });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `row:${index}` });
  const setRef = (el: HTMLElement | null) => {
    dragRef(el);
    dropRef(el);
  };
  const isDivider = entry.kind === 'divider';
  return (
    <div
      ref={setRef}
      data-home-row={entry.kind === 'item' ? entry.href : undefined}
      data-home-divider-row={isDivider ? (entry as { id: string }).id : undefined}
      data-home-index={index}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: isDivider ? '6px 10px' : '7px 10px',
        borderRadius: 8,
        border: isOver ? `1px dashed ${ACCENT}` : '1px solid transparent',
        borderTop: isOver ? `2px solid ${ACCENT}` : undefined,
        background: isDivider ? 'var(--bg-primary)' : 'transparent',
        opacity: isDragging ? 0.4 : 1,
        minWidth: 0,
      }}
    >
      <span {...attributes} {...listeners} data-home-handle style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', color: 'var(--text-muted)' }} aria-label="ドラッグして並び替え">
        ⠿
      </span>
      {isDivider ? (
        <>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>区切り</span>
          <input
            data-home-divider-input={(entry as { id: string }).id}
            value={(entry as { label: string }).label}
            maxLength={HOME_DIVIDER_LABEL_MAX}
            placeholder="見出しの名前（12文字まで）"
            aria-label="区切りの名前"
            onChange={(e) => onRename(index, e.target.value)}
            style={{ flex: 1, minWidth: 80, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
        </>
      ) : (
        <>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{label}</span>
          {isNew && (
            <span data-nav-new={(entry as { href: string }).href} title={addedTitle} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'rgba(180,83,9,0.14)', color: '#B45309', flexShrink: 0 }}>
              {NAV_NEW_LABEL}
            </span>
          )}
        </>
      )}
      <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
        <button type="button" data-home-up={index} onClick={() => onMove(index, index - 1)} disabled={index === 0} title="上へ" style={{ ...iconBtn, opacity: index === 0 ? 0.35 : 1 }}>↑</button>
        <button type="button" data-home-down={index} onClick={() => onMove(index, index + 1)} disabled={index >= total - 1} title="下へ" style={{ ...iconBtn, opacity: index >= total - 1 ? 0.35 : 1 }}>↓</button>
        <button type="button" data-home-remove={index} onClick={() => onRemove(index)} title={isDivider ? '区切りを削除（配下の項目は残ります）' : 'ホームから外す（外した項目は自動で戻りません）'} style={{ ...iconBtn, color: '#B91C1C' }}>✕</button>
      </span>
    </div>
  );
}

/** 右列の1行（未追加はドラッグ元・追加済みは押すと左列へスクロール） */
function AllRow({
  item,
  label,
  icon,
  inHome,
  removed,
  isNew,
  onAdd,
  onLocate,
}: {
  item: NavItem;
  label: string;
  icon: string;
  inHome: boolean;
  removed: boolean;
  isNew: boolean;
  onAdd: (href: string) => void;
  onLocate: (href: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `all:${item.href}`, disabled: inHome });
  return (
    <div
      ref={setNodeRef}
      data-all-row={item.href}
      data-all-in-home={inHome ? '1' : '0'}
      data-all-removed={removed ? '1' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, opacity: inHome ? 0.5 : isDragging ? 0.4 : 1, minWidth: 0 }}
    >
      {inHome ? (
        <span style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)' }}>·</span>
      ) : (
        <span {...attributes} {...listeners} data-all-handle={item.href} style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', color: 'var(--text-muted)' }} aria-label="ドラッグしてホームへ追加">
          ⠿
        </span>
      )}
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{label}</span>
      {isNew && <span title={formatAddedTitle(item.addedAt)} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'rgba(180,83,9,0.14)', color: '#B45309', flexShrink: 0 }}>{NAV_NEW_LABEL}</span>}
      {removed && !inHome && <span data-all-removed-mark style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', flexShrink: 0 }}>外した</span>}
      {inHome ? (
        <button type="button" data-all-locate={item.href} onClick={() => onLocate(item.href)} title="ホームの該当行へ移動" style={iconBtn}>追加済み ↖</button>
      ) : (
        <button type="button" data-all-add={item.href} onClick={() => onAdd(item.href)} title="ホームの末尾に追加" style={{ ...iconBtn, borderColor: ACCENT, color: ACCENT }}>＋</button>
      )}
    </div>
  );
}

export default function HomeMenuSettingsPage() {
  const { navLabels } = useTheme();
  const { showToast } = useToast();
  const labelOf = (i: NavItem) => navLabelOf(navLabels, i.href, i.label);
  const iconOf = (i: NavItem) => navIconOf(navLabels, i.href, i.icon);
  const [entries, setEntries] = useState<HomeEntry[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<Snapshot | null>(null);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [todayYmd, setTodayYmd] = useState('');
  const [narrow, setNarrow] = useState(false);
  const entriesRef = useRef(entries);
  const removedRef = useRef(removed);
  useEffect(() => {
    entriesRef.current = entries;
    removedRef.current = removed;
  });

  useEffect(() => {
    try {
      setEntries(resolveHomeLayout(localStorage.getItem(HOME_STORAGE_KEY), localStorage.getItem(HOME_REMOVED_STORAGE_KEY)));
      setRemoved(parseHrefList(localStorage.getItem(HOME_REMOVED_STORAGE_KEY)) ?? []);
    } catch {}
    setTodayYmd(jstDateString());
    setMounted(true);
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // 保存はその場で。直前の状態を履歴（1段）に置き、サイドバーへイベントで知らせる
  const commit = useCallback((next: HomeEntry[], nextRemoved: string[]) => {
    setHistory({ entries: entriesRef.current, removed: removedRef.current });
    setEntries(next);
    setRemoved(nextRemoved);
    try {
      localStorage.setItem(HOME_STORAGE_KEY, serializeHomeLayout(next));
      localStorage.setItem(HOME_REMOVED_STORAGE_KEY, JSON.stringify(nextRemoved));
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT));
    } catch {
      showToast('保存できませんでした（このブラウザの保存領域が使えません）', 'error');
    }
  }, [showToast]);

  const homeHrefs = homeHrefsOf(entries);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return;
    const next = [...entries];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    commit(next, removed);
  };
  const removeAt = (index: number) => {
    const e = entries[index];
    if (!e) return;
    const next = entries.filter((_, i) => i !== index);
    const nextRemoved = e.kind === 'item' && DEFAULT_HOME_HREFS.includes(e.href) && !removed.includes(e.href) ? [...removed, e.href] : removed;
    commit(next, nextRemoved);
  };
  const insertItem = (href: string, at: number) => {
    if (homeHrefs.includes(href) || !ITEM_BY_HREF.has(href)) return;
    const next = [...entries];
    next.splice(Math.max(0, Math.min(at, next.length)), 0, { kind: 'item', href });
    commit(next, removed.filter((h) => h !== href));
  };
  const addToEnd = (href: string) => insertItem(href, entries.length);
  const renameDivider = (index: number, label: string) => {
    const e = entries[index];
    if (!e || e.kind !== 'divider') return;
    const next = [...entries];
    next[index] = { ...e, label: normalizeDividerLabel(label) };
    commit(next, removed);
  };
  const addDivider = () => {
    const id = `div-${Date.now().toString(36)}`;
    commit([...entries, { kind: 'divider', id, label: '' }], removed);
  };
  const undo = () => {
    if (!history) return;
    const h = history;
    setHistory(null);
    setEntries(h.entries);
    setRemoved(h.removed);
    try {
      localStorage.setItem(HOME_STORAGE_KEY, serializeHomeLayout(h.entries));
      localStorage.setItem(HOME_REMOVED_STORAGE_KEY, JSON.stringify(h.removed));
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT));
    } catch {}
  };
  const resetToDefault = () => {
    // R-56: 確認は1回。区切りも墓標も消えることを明記
    const ok = window.confirm(
      `ホームを既定の並び（${DEFAULT_HOME_HREFS.length}項目・定義順）に戻します。\n\n` +
        `追加したメニューと区切り見出しはホームから消えます（メニューそのものは消えません）。\n` +
        `「外した」記録（墓標）も消え、既定の項目はすべて表示されます。\n` +
        `よろしいですか？`,
    );
    if (!ok) return;
    commit(DEFAULT_HOME_HREFS.map((href) => ({ kind: 'item', href })), []);
  };
  const exportToClipboard = async () => {
    const text = exportHomeLayout(entries, removed);
    try {
      await navigator.clipboard.writeText(text);
      showToast('ホームの並びをクリップボードへ書き出しました', 'success');
    } catch {
      setImportText(text);
      setImportOpen(true);
      showToast('クリップボードに書けなかったので、下の欄に出しました（コピーしてください）', 'warning');
    }
  };
  const applyImport = () => {
    const r = importHomeLayout(importText);
    if (!r.ok) {
      setImportError(r.reason);
      return;
    }
    setImportError(null);
    commit(r.entries, r.removed);
    setImportOpen(false);
    setImportText('');
    showToast(`読み込みました（${homeHrefsOf(r.entries).length}項目${r.dropped > 0 ? `・${r.dropped}件はこのアプリに無い経路のため省きました` : ''}）`, r.dropped > 0 ? 'warning' : 'success');
  };
  const locate = (href: string) => {
    const el = document.querySelector<HTMLElement>(`[data-home-row="${CSS.escape(href)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (el) {
      el.style.outline = `2px solid ${ACCENT}`;
      window.setTimeout(() => { el.style.outline = ''; }, 1200);
    }
  };

  // DnD（@dnd-kit/core）: home:<key> → row:<index>／end へ並べ替え、all:<href> → row/end へ追加
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const { setNodeRef: endRef, isOver: endOver } = useDroppable({ id: 'end' });
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const targetIndex = over === 'end' ? entries.length : over.startsWith('row:') ? Number(over.slice(4)) : -1;
    if (targetIndex < 0) return;
    if (active.startsWith('home:')) {
      const key = active.slice(5);
      const from = entries.findIndex((x) => entryKey(x) === key);
      if (from < 0) return;
      let to = targetIndex;
      if (to > from) to -= 1;
      move(from, to);
    } else if (active.startsWith('all:')) {
      insertItem(active.slice(4), targetIndex);
    }
  };
  const activeLabel = useMemo(() => {
    if (!activeId) return '';
    if (activeId.startsWith('all:')) {
      const it = ITEM_BY_HREF.get(activeId.slice(4));
      return it ? `${iconOf(it)} ${labelOf(it)}` : '';
    }
    const key = activeId.slice(5);
    const en = entries.find((x) => entryKey(x) === key);
    if (!en) return '';
    if (en.kind === 'divider') return `— ${en.label || '（区切り）'}`;
    const it = ITEM_BY_HREF.get(en.href);
    return it ? `${iconOf(it)} ${labelOf(it)}` : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, entries, navLabels]);

  const q = query.trim();
  const groups = navCategories
    .map((cat) => ({ category: cat.category, items: cat.items.filter((it) => matchesNavItem(it, labelOf(it), q)) }))
    .filter((g) => g.items.length > 0);

  if (!mounted) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>読み込み中...</div>;

  return (
    <div data-home-editor style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>📌 ホーム編集</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
        サイドバーの「ホーム」に出すメニューと並びを編集します。右の一覧から左へドラッグ（または ＋）で追加、左の中でドラッグ（または ↑↓）で並べ替え、✕ で外します。
        変更はすぐに保存され、左のサイドバーにそのまま反映されます。名前とアイコンの変更は{' '}
        <Link href="/dashboard/display-settings" data-home-to-labels style={{ color: ACCENT }}>🎛 表示設定</Link>
        {' '}で行います。
      </p>

      <div data-home-toolbar style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" data-home-undo onClick={undo} disabled={!history} title="直前の1操作を元に戻す" style={{ ...btn, opacity: history ? 1 : 0.5 }}>↶ 元に戻す</button>
        <button type="button" data-home-add-divider onClick={addDivider} title="区切り見出しを末尾に追加" style={btn}>＋ 区切りを追加</button>
        <button type="button" data-home-export onClick={() => void exportToClipboard()} title="並び（区切り込み）をJSONでクリップボードへ" style={btn}>📤 書き出し</button>
        <button type="button" data-home-import-toggle onClick={() => { setImportOpen((v) => !v); setImportError(null); }} title="書き出したJSONを貼り付けて置き換える" style={btn}>📥 読み込み</button>
        <span style={{ flex: 1 }} />
        <button type="button" data-home-reset onClick={resetToDefault} title="既定の並びに戻す（確認あり）" style={{ ...btn, color: '#B91C1C' }}>↩ 既定に戻す</button>
      </div>
      {importOpen && (
        <div data-home-import style={{ marginBottom: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-secondary)' }}>
          <textarea
            data-home-import-text
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
            placeholder='書き出したJSON（{"version":1,"items":[...],"removed":[...]}）を貼り付け'
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <button type="button" data-home-import-apply onClick={applyImport} disabled={!importText.trim()} style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff', opacity: importText.trim() ? 1 : 0.5 }}>置き換える</button>
            <button type="button" onClick={() => { setImportOpen(false); setImportError(null); }} style={btn}>やめる</button>
            {importError && <span data-home-import-error style={{ fontSize: 12, color: '#B91C1C' }}>⚠️ {importError}（何も変えていません）</span>}
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div data-home-columns={narrow ? 'stack' : 'side'} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          {/* 左: ホーム */}
          <section data-home-list style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, minWidth: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
              🏠 ホーム <span data-home-count={homeHrefs.length} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>({homeHrefs.length}項目)</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {entries.map((e, i) => {
                const item = e.kind === 'item' ? ITEM_BY_HREF.get(e.href) : undefined;
                return (
                  <HomeRow
                    key={entryKey(e)}
                    entry={e}
                    index={i}
                    total={entries.length}
                    label={item ? labelOf(item) : ''}
                    icon={item ? iconOf(item) : ''}
                    isNew={!!item && !!todayYmd && isNewMenu(item.addedAt, todayYmd)}
                    addedTitle={item ? formatAddedTitle(item.addedAt) : ''}
                    onMove={move}
                    onRemove={removeAt}
                    onRename={renameDivider}
                  />
                );
              })}
              <div ref={endRef} data-home-end style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', border: `1px dashed ${endOver ? ACCENT : 'var(--border)'}`, borderRadius: 8, background: endOver ? `${ACCENT}12` : 'transparent' }}>
                ここにドロップで末尾に追加
              </div>
            </div>
          </section>

          {/* 右: すべてのメニュー */}
          <details data-home-all open={!narrow} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, minWidth: 0 }}>
            <summary style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>📚 すべてのメニュー</summary>
            <input
              data-home-search
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); setQuery(''); } }}
              placeholder="🔍 メニューを検索（表示名・元の名前）"
              aria-label="メニューを検索"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', marginBottom: 8 }}
            />
            {groups.length === 0 && <div data-home-all-empty style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>該当なし</div>}
            {groups.map((g) => (
              <div key={g.category} data-home-all-group={g.category} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '4px 8px', textTransform: 'uppercase' as const }}>{navCategoryLabelOf(navLabels, g.category)}</div>
                {g.items.map((it) => (
                  <AllRow
                    key={it.href}
                    item={it}
                    label={labelOf(it)}
                    icon={iconOf(it)}
                    inHome={homeHrefs.includes(it.href)}
                    removed={removed.includes(it.href)}
                    isNew={!!todayYmd && isNewMenu(it.addedAt, todayYmd)}
                    onAdd={addToEnd}
                    onLocate={locate}
                  />
                ))}
              </div>
            ))}
          </details>
        </div>
        <DragOverlay>
          {activeId ? (
            <div style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--bg-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 13, color: 'var(--text-primary)' }}>{activeLabel}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
