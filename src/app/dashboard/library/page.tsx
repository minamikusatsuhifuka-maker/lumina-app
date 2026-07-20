'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import { LibraryItemRow } from '@/components/LibraryItemRow';
// LibraryPreviewPanel は廃止（カード内インライン展開に統一）

/* ── タブ定義（サイドメニュー対応） ── */
const TABS = [
  { key: 'all',       label: 'すべて' },
  { key: 'favorite',  label: '★お気に入り' },
  { key: 'スタッフ育成資料', label: '📚 スタッフ育成資料' },
  { key: 'Intelligence Hub', label: '🧠 Intelligence Hub' },
  { key: 'Web情報収集', label: '🌐 Web情報収集' },
  { key: 'note検索',   label: '📓 note検索' },
  { key: 'ディープリサーチ', label: '🔭 ディープリサーチ' },
  { key: '文献検索',   label: '🔬 文献検索' },
  { key: '定期アラート', label: '🔔 定期アラート' },
  { key: 'AI分析エンジン', label: '🧩 AI分析エンジン' },
  { key: '経営インテリジェンス', label: '💼 経営インテリジェンス' },
  { key: '業界レポート', label: '📊 業界レポート' },
  { key: 'AIペルソナ', label: '🤖 AIペルソナ' },
  { key: 'ブレスト',   label: '💡 ブレスト' },
  { key: '文章作成',   label: '✍️ 文章作成' },
  { key: '議事録整理', label: '📝 議事録整理' },
  { key: 'Gensparkへ出力', label: '🎯 Gensparkへ出力' },
] as const;

type TabKey = typeof TABS[number]['key'];

/* group_name の旧表記を新タブに対応付ける */
const GROUP_ALIASES: Record<string, string> = {
  'WEB調査': 'Web情報収集',
  'Web調査': 'Web情報収集',
  'アラート': '定期アラート',
  '分析': 'AI分析エンジン',
  '経営': '経営インテリジェンス',
  '経営戦略': '経営インテリジェンス',
};
function normalizeGroup(g: string): string {
  return GROUP_ALIASES[g] || g;
}

// metadata は TEXT 格納 or オブジェクトのどちらでも対応
function parseMetadata(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

function LibraryPageInner() {
  const searchParams = useSearchParams();
  // URLクエリ ?tab=... を初期タブとして反映（TABS の key と完全一致が条件）
  const initialTab = useMemo<TabKey>(() => {
    const q = searchParams.get('tab');
    if (q && (TABS as readonly { key: string }[]).some(t => t.key === q)) {
      return q as TabKey;
    }
    return 'all';
  }, [searchParams]);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');
  const [bulkCategorizing, setBulkCategorizing] = useState(false);
  const [categorizeElapsed, setCategorizeElapsed] = useState(0);
  // サブカテゴリ絞り込み（タブ内の二段目フィルタ）
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  // 分類失敗のみ表示（タブ内の二段目フィルタ、サブカテゴリと排他）
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  // 未分類リトライ
  const [retrying, setRetrying] = useState(false);
  const [retryElapsed, setRetryElapsed] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeResult, setMergeResult] = useState('');
  const [merging, setMerging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [favFilterInTab, setFavFilterInTab] = useState(false);
  // フォルダ
  const [folderModal, setFolderModal] = useState<{ item: any } | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); });
  }, []);

  // サイドバーから ?tab=... 付きで再訪したときにも追従させる
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  /* ── アクション ── */
  const generateMergeReport = async () => {
    const selected = items.filter((item: any) => selectedIds.has(item.id));
    if (selected.length < 2) { alert('2件以上選択してください'); return; }
    setMerging(true);
    setMergeResult('');
    try {
      const payload = selected.map(i => ({ title: i.title || '無題', content: (i.content || '').slice(0, 1000) }));
      const res = await fetch('/api/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`統合レポート生成エラー: ${data.error || '不明なエラー'}`);
        return;
      }
      if (!data.result) {
        alert('統合レポートが空でした。もう一度お試しください。');
        return;
      }
      setMergeResult(data.result);
      setShowMergeModal(true);
    } catch (e: any) {
      alert(`通信エラー: ${e.message}`);
    } finally { setMerging(false); }
  };

  const handleSaveMergeReport = async () => {
    if (!mergeResult) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `統合レポート ${new Date().toLocaleDateString('ja-JP')}`, content: mergeResult, type: 'merge', tags: '統合レポート', group_name: '統合レポート' }),
      });
      if (res.ok) { const newItem = await res.json(); setItems(prev => [newItem, ...prev]); alert('リサーチ保存に追加しました！'); }
    } finally { setIsSaving(false); }
  };

  const toggleFavorite = async (item: any) => {
    const newVal = item.is_favorite ? 0 : 1;
    await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, is_favorite: newVal }) });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorite: newVal } : i));
  };

  const saveEdit = async (id: string) => {
    await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tags: editTags, group_name: editGroup }) });
    setItems(prev => prev.map(i => i.id === id ? { ...i, tags: editTags, group_name: editGroup } : i));
    setEditingId(null);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch('/api/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const downloadTxt = (item: any) => {
    const text = `${item.title}\n${'='.repeat(40)}\n作成日: ${new Date(item.created_at).toLocaleDateString('ja-JP')}\nタグ: ${item.tags || 'なし'}\n\n${item.content || ''}`;
    triggerDownload(`${item.title.slice(0, 30)}.txt`, text, 'text/plain');
  };
  const downloadMd = (item: any) => {
    const text = `# ${item.title}\n\n> 作成日: ${new Date(item.created_at).toLocaleDateString('ja-JP')}\n\n${item.content || ''}`;
    triggerDownload(`${item.title.slice(0, 30)}.md`, text, 'text/plain');
  };

  /* ── フォルダ操作 ── */
  const openFolderModal = (item: any) => {
    setFolderInput(item.folder_name || '');
    setFolderModal({ item });
  };

  const saveFolderName = async () => {
    if (!folderModal) return;
    const { item } = folderModal;
    const name = folderInput.trim() || null;
    await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, folder_name: name }) });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, folder_name: name } : i));
    setFolderModal(null);
  };

  // 現在のタブ（メインカテゴリ）を一括 AI 分類
  const handleBulkCategorize = async () => {
    // 'all' / 'favorite' 以外のタブが対象
    if (activeTab === 'all' || activeTab === 'favorite') return;
    const targetItems = items.filter(
      (i) => normalizeGroup(i.group_name || '') === activeTab,
    );
    if (targetItems.length === 0) {
      alert('このカテゴリに対象アイテムがありません');
      return;
    }
    if (
      !confirm(
        `${targetItems.length}件をAIで分類します。1〜3分かかる可能性があります。\n（サブカテゴリ + タグが metadata に追加されます）\n実行しますか？`,
      )
    ) {
      return;
    }
    setBulkCategorizing(true);
    setCategorizeElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(
      () => setCategorizeElapsed(Math.floor((Date.now() - t0) / 1000)),
      1000,
    );
    try {
      const res = await fetch('/api/library/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'bulk',
          itemIds: targetItems.map((i) => i.id),
          category: activeTab,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j.error || text;
        } catch {}
        throw new Error(`分類失敗 (${res.status}): ${msg.slice(0, 200)}`);
      }
      const data = await res.json();
      const okCount = data.updated?.length || 0;
      const ngCount = data.failed?.length || 0;

      // 最新化（失敗してもアプリは継続）
      const refetchOk = await refetchItems();
      if (refetchOk) {
        alert(`✅ 完了：成功 ${okCount}件 / 失敗 ${ngCount}件`);
      } else {
        alert(
          `分類完了：成功 ${okCount}件 / 失敗 ${ngCount}件\n最新状態を見るためにページを再読込してください。`,
        );
      }
    } catch (err: any) {
      alert(`❌ ${err?.message || err}`);
    } finally {
      clearInterval(timer);
      setBulkCategorizing(false);
    }
  };

  // サブカテゴリが付いていない未分類アイテムだけを再分類
  const handleRetryUncategorized = async () => {
    if (uncategorizedItems.length === 0) return;
    if (
      !confirm(
        `サブカテゴリが付いていない${uncategorizedItems.length}件を再分類します。実行しますか？`,
      )
    ) {
      return;
    }
    setRetrying(true);
    setRetryElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(
      () => setRetryElapsed(Math.floor((Date.now() - t0) / 1000)),
      1000,
    );
    try {
      const res = await fetch('/api/library/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'bulk',
          itemIds: uncategorizedItems.map((i) => i.id),
          category: activeTab,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j.error || text;
        } catch {}
        throw new Error(`再分類失敗 (${res.status}): ${msg.slice(0, 200)}`);
      }
      const data = await res.json();
      const okCount = data.updated?.length || 0;
      const ngCount = data.failed?.length || 0;

      const refetchOk = await refetchItems();
      if (refetchOk) {
        alert(`✅ 再分類完了：成功 ${okCount}件 / 失敗 ${ngCount}件`);
      } else {
        alert(
          `再分類完了：成功 ${okCount}件 / 失敗 ${ngCount}件\n最新状態を見るためにページを再読込してください。`,
        );
      }
    } catch (err: any) {
      alert(`❌ ${err?.message || err}`);
    } finally {
      clearInterval(timer);
      setRetrying(false);
    }
  };

  const toggleFolder = (key: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /* ── フィルタリング ── */
  // 検索フィルタ（タイトル + 本文 + タグ、大文字小文字区別なし）
  const filterBySearch = (list: any[]): any[] => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.content || '').toLowerCase().includes(q) ||
      (i.tags || '').toLowerCase().includes(q)
    );
  };

  const tabFilteredItems = useMemo(() => {
    // searchScope='all' で検索クエリ有のときはタブ無視で全体検索
    if (search.trim() && searchScope === 'all') {
      return filterBySearch(items);
    }
    // それ以外は従来通り（タブ → 検索 → お気に入り絞り込み → サブカテゴリ絞り込み）
    let list = items;
    if (activeTab === 'favorite') {
      list = list.filter(i => i.is_favorite);
    } else if (activeTab !== 'all') {
      list = list.filter(i => normalizeGroup(i.group_name || '') === activeTab);
    }
    list = filterBySearch(list);
    if (favFilterInTab && activeTab !== 'favorite') {
      list = list.filter(i => i.is_favorite);
    }
    if (selectedSubCategory) {
      list = list.filter(i => parseMetadata(i.metadata)?.subCategory === selectedSubCategory);
    }
    if (showFailedOnly) {
      list = list.filter(i => {
        const m = parseMetadata(i.metadata);
        return !!m?.classifyError && !m?.subCategory;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, searchScope, activeTab, favFilterInTab, selectedSubCategory, showFailedOnly]);

  // タブ内で利用可能なサブカテゴリ一覧（all/favorite では空）
  const availableSubCategories = useMemo<string[]>(() => {
    if (activeTab === 'all' || activeTab === 'favorite') return [];
    const targetItems = items.filter(
      (i) => normalizeGroup(i.group_name || '') === activeTab,
    );
    const subs = targetItems
      .map((i) => parseMetadata(i.metadata)?.subCategory)
      .filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s: string) => s.trim());
    return Array.from(new Set(subs)).sort((a, b) => a.localeCompare(b, 'ja'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeTab]);

  // 未分類アイテム（subCategory なし）
  const uncategorizedItems = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'favorite') return [];
    return items.filter(
      (i) =>
        normalizeGroup(i.group_name || '') === activeTab &&
        !parseMetadata(i.metadata)?.subCategory,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeTab]);

  // 現在のタブ内で「分類失敗」が記録されているアイテム数
  const failedCount = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'favorite') return 0;
    return items.filter((i) => {
      if (normalizeGroup(i.group_name || '') !== activeTab) return false;
      const m = parseMetadata(i.metadata);
      return !!m?.classifyError && !m?.subCategory;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeTab]);

  // タブ切替時にサブカテゴリ絞り込み・失敗フィルタをリセット
  useEffect(() => {
    setSelectedSubCategory(null);
    setShowFailedOnly(false);
  }, [activeTab]);

  // サブカテゴリ選択時は失敗フィルタを解除（排他制御）
  useEffect(() => {
    if (selectedSubCategory) setShowFailedOnly(false);
  }, [selectedSubCategory]);

  // /api/library を再取得（失敗時 false を返す）
  const refetchItems = async (): Promise<boolean> => {
    try {
      const r = await fetch('/api/library');
      if (!r.ok) {
        console.warn('[library] refetch failed:', r.status);
        return false;
      }
      const d = await r.json();
      if (Array.isArray(d)) setItems(d);
      return true;
    } catch (e) {
      console.warn('[library] refetch例外:', e);
      return false;
    }
  };

  /* フォルダ別グルーピング */
  const groupedByFolder = useMemo(() => {
    const folders = new Map<string, any[]>();
    const noFolder: any[] = [];
    for (const item of tabFilteredItems) {
      if (item.folder_name) {
        const arr = folders.get(item.folder_name) || [];
        arr.push(item);
        folders.set(item.folder_name, arr);
      } else {
        noFolder.push(item);
      }
    }
    // フォルダ名でソート
    const sortedFolders = Array.from(folders.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ja'));
    return { sortedFolders, noFolder };
  }, [tabFilteredItems]);

  /* 既存フォルダ名一覧（モーダルのサジェスト用） */
  const existingFolders = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.folder_name) set.add(i.folder_name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [items]);

  const tabCount = (key: TabKey) => {
    if (key === 'all') return items.length;
    if (key === 'favorite') return items.filter(i => i.is_favorite).length;
    return items.filter(i => normalizeGroup(i.group_name || '') === key).length;
  };

  /* ── 各アイテムのレンダリング ── */
  const renderItem = (item: any) => (
    <div key={item.id}>
      <LibraryItemRow
        item={item}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        mergeMode={mergeMode}
        selected={selectedIds.has(item.id)}
        onSelectToggle={(id, checked) => { const next = new Set(selectedIds); if (checked) next.add(id); else next.delete(id); setSelectedIds(next); }}
        onFavoriteToggle={toggleFavorite}
        onDelete={deleteItem}
        onEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
        onExportTxt={downloadTxt}
        onExportMd={downloadMd}
        onExportPdf={async (it) => { const { exportToPdf } = await import('@/lib/exportPdf'); await exportToPdf(it.title?.slice(0, 40) || 'リサーチ保存', it.content || ''); }}
        onUseInWrite={(it) => { localStorage.setItem('lumina_research_context', it.content || ''); window.location.href = '/dashboard/write'; }}
        onStartTagEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
        onExpandToggle={(id) => setExpandedId(expandedId === id ? null : id)}
        isExpanded={expandedId === item.id}
        onMoveToFolder={openFolderModal}
        onTagClick={(t) => setSearch(t)}
      />

      {editingId === item.id && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: -1, borderRadius: '0 0 10px 10px', border: '1px solid var(--border)', borderTopColor: 'transparent' }}>
          <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="タグ（カンマ区切り）"
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
          <input value={editGroup} onChange={e => setEditGroup(e.target.value)} placeholder="グループ名"
            style={{ flex: 1, minWidth: 140, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
          <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>保存</button>
          <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      )}
    </div>
  );

  /* ── フォルダセクション描画 ── */
  const renderFolderSection = (folderName: string, folderItems: any[]) => {
    const isCollapsed = collapsedFolders.has(folderName);
    return (
      <div key={folderName} style={{ marginBottom: 12 }}>
        <button
          onClick={() => toggleFolder(folderName)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 10px', borderRadius: 8, border: 'none',
            background: 'rgba(108,99,255,0.04)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            marginBottom: isCollapsed ? 0 : 6, textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
          <span>📁 {folderName}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({folderItems.length})</span>
        </button>
        {!isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 12 }}>
            {folderItems.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>📚 リサーチ保存</h1>
        <button
          onClick={() => { setMergeMode(!mergeMode); setSelectedIds(new Set()); setMergeResult(''); }}
          style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: mergeMode ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
            color: mergeMode ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${mergeMode ? 'transparent' : 'var(--border)'}`,
            fontSize: 13, fontWeight: 600,
          }}
        >
          {mergeMode ? '✕ 選択モード終了' : '✓ 選択モード'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>保存した調査・分析・文章を管理。お気に入り・タグ・フォルダ分けに対応。</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>読み返す用の保管庫です。生成時にAIへ参照させたいものは <a href="/dashboard/context-library" style={{ color: 'var(--accent)', fontWeight: 600 }}>🧠 AI参照素材</a> へ</p>

      {/* 選択モードガイド */}
      {mergeMode && (
        <div style={{ padding: '10px 16px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          ✓ 統合したい資料をチェックしてください（2件以上）
        </div>
      )}

      {/* 検索 + スコープ切替 + お気に入り絞り込み + 一括AI分類 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 タイトル・本文・タグを検索..."
          style={{ flex: 1, minWidth: 200, maxWidth: 480, padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />

        {/* 検索スコープ切替（カテゴリ内 / 全体） */}
        <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setSearchScope('current')}
            style={{
              padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: searchScope === 'current' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: searchScope === 'current' ? '#fff' : 'var(--text-muted)',
              border: 'none',
            }}
            title="現在のカテゴリ内のみ検索"
          >
            📂 カテゴリ内
          </button>
          <button
            type="button"
            onClick={() => setSearchScope('all')}
            style={{
              padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: searchScope === 'all' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: searchScope === 'all' ? '#fff' : 'var(--text-muted)',
              border: 'none',
            }}
            title="全カテゴリを横断検索"
          >
            🌐 全体
          </button>
        </div>

        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
            title="検索をクリア"
          >
            ✕ クリア
          </button>
        )}

        {activeTab !== 'favorite' && (
          <button onClick={() => setFavFilterInTab(!favFilterInTab)}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${favFilterInTab ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`, background: favFilterInTab ? 'rgba(245,166,35,0.1)' : 'var(--bg-secondary)', color: favFilterInTab ? '#f5a623' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ★ お気に入りのみ
          </button>
        )}

        {/* このカテゴリを一括AI分類（all/favorite 以外で表示） */}
        {activeTab !== 'all' && activeTab !== 'favorite' && (
          <button
            type="button"
            onClick={handleBulkCategorize}
            disabled={bulkCategorizing || retrying}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12,
              background: bulkCategorizing
                ? 'var(--bg-secondary)'
                : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: bulkCategorizing ? 'var(--text-muted)' : '#fff',
              cursor: bulkCategorizing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="このカテゴリのアイテムにサブカテゴリ・タグをAIで付与"
          >
            {bulkCategorizing
              ? `⟳ 分類中... ${categorizeElapsed}秒`
              : `♻️ ${activeTab}を一括AI分類`}
          </button>
        )}

        {/* 未分類だけを再分類（all/favorite 以外で未分類がある場合のみ） */}
        {activeTab !== 'all' && activeTab !== 'favorite' && uncategorizedItems.length > 0 && (
          <button
            type="button"
            onClick={handleRetryUncategorized}
            disabled={retrying || bulkCategorizing}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12,
              background: retrying
                ? 'var(--bg-secondary)'
                : 'linear-gradient(135deg, #f59e0b, #f97316)',
              color: retrying ? 'var(--text-muted)' : '#fff',
              cursor: retrying ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
            title={`サブカテゴリが付いていない${uncategorizedItems.length}件を再分類`}
          >
            {retrying
              ? `⟳ 再分類中... ${retryElapsed}秒`
              : `🔄 未分類${uncategorizedItems.length}件を再分類`}
          </button>
        )}
      </div>

      {/* 検索結果件数 */}
      {search.trim() && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          🔍 「{search}」の検索結果: {tabFilteredItems.length}件
          {searchScope === 'all' ? '（全カテゴリ横断）' : `（${activeTab === 'all' ? '全件' : activeTab === 'favorite' ? 'お気に入り' : activeTab + ' タブ'}内）`}
        </div>
      )}

      {/* 統計 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: '総アイテム', value: items.length, color: '#6c63ff' },
          { label: 'お気に入り', value: items.filter(i => i.is_favorite).length, color: '#f5a623' },
          { label: 'フォルダ数', value: existingFolders.length, color: '#00d4b8' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', border: `1px solid ${s.color}20`, borderRadius: 10, padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── タブバー（2行折り返し表示） ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(tab => {
          const count = tabCount(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setFavFilterInTab(false); }}
              style={{
                flexShrink: 0, padding: '6px 12px', fontSize: 12,
                borderRadius: 6,
                background: activeTab === tab.key ? 'var(--accent-soft)' : 'transparent',
                border: `1px solid ${activeTab === tab.key ? 'var(--accent)' : 'transparent'}`,
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {count > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── サブカテゴリ絞り込みチップ（タブ内2段目フィルタ） ── */}
      {activeTab !== 'all' && activeTab !== 'favorite' && (availableSubCategories.length > 0 || failedCount > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setSelectedSubCategory(null); setShowFailedOnly(false); }}
            style={{
              padding: '4px 12px',
              borderRadius: 12,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              background: !selectedSubCategory && !showFailedOnly ? '#8b5cf6' : 'var(--bg-secondary)',
              color: !selectedSubCategory && !showFailedOnly ? '#fff' : 'var(--text-muted)',
            }}
          >
            すべて
          </button>
          {availableSubCategories.map((sub) => {
            const active = selectedSubCategory === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setSelectedSubCategory(active ? null : sub)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 12,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? '#8b5cf6' : 'var(--bg-secondary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                🏷 {sub}
              </button>
            );
          })}
          {/* 失敗フィルタチップ（失敗が1件以上ある時のみ） */}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowFailedOnly((prev) => !prev);
                setSelectedSubCategory(null);
              }}
              style={{
                padding: '4px 12px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                background: showFailedOnly ? '#ef4444' : 'rgba(239,68,68,0.08)',
                color: showFailedOnly ? '#fff' : '#dc2626',
                border: showFailedOnly ? 'none' : '1px solid rgba(239,68,68,0.3)',
              }}
              title="サブカテゴリ分類に失敗したアイテムだけを表示"
            >
              🚫 分類失敗 {failedCount}
            </button>
          )}
        </div>
      )}

      {/* ── 失敗フィルタON時の説明バナー ── */}
      {showFailedOnly && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            fontSize: 12,
            color: '#b91c1c',
            lineHeight: 1.6,
          }}
        >
          🚫 サブカテゴリの自動分類に失敗したアイテムを表示中（{tabFilteredItems.length}件）
          <br />
          バッジにマウスホバーすると詳細エラーが見えます。「🔄 未分類N件を再分類」で再試行できます。
        </div>
      )}

      {/* ── アイテムリスト（フォルダグルーピング） ── */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>読み込み中...</div>
      ) : tabFilteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div style={{ fontSize: 16 }}>アイテムがありません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>各ページの「保存」ボタンで追加できます</div>
        </div>
      ) : (
        <div>
          {/* フォルダ付きアイテム */}
          {groupedByFolder.sortedFolders.map(([name, folderItems]) => renderFolderSection(name, folderItems))}
          {/* フォルダなしアイテム */}
          {groupedByFolder.noFolder.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groupedByFolder.sortedFolders.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 10px', fontWeight: 600 }}>未整理</div>
              )}
              {groupedByFolder.noFolder.map(renderItem)}
            </div>
          )}
        </div>
      )}

      {/* ── フォルダ移動モーダル ── */}
      {folderModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setFolderModal(null)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📁 フォルダに移動</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              {folderModal.item.title?.slice(0, 40)}
            </p>
            <input
              value={folderInput}
              onChange={e => setFolderInput(e.target.value)}
              placeholder="フォルダ名を入力..."
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
              onKeyDown={e => { if (e.key === 'Enter') saveFolderName(); }}
            />
            {/* 既存フォルダのサジェスト */}
            {existingFolders.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {existingFolders.map(f => (
                  <button key={f} onClick={() => setFolderInput(f)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: folderInput === f ? 'rgba(108,99,255,0.1)' : 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                    📁 {f}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveFolderName}
                style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {folderInput.trim() ? '移動する' : 'フォルダから外す'}
              </button>
              <button onClick={() => setFolderModal(null)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 選択モード フローティングツールバー ── */}
      {mergeMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', padding: '12px 24px', borderRadius: 99,
          boxShadow: '0 8px 32px rgba(108,99,255,0.4)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size}件選択中</span>
          <button onClick={generateMergeReport} disabled={merging || selectedIds.size < 2}
            style={{ padding: '6px 16px', borderRadius: 99, background: '#fff', color: '#6c63ff', border: 'none', cursor: merging || selectedIds.size < 2 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: merging || selectedIds.size < 2 ? 0.6 : 1 }}>
            {merging ? '分析中...' : '🔗 AIでまとめる'}
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setMergeMode(false); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── 統合レポートモーダル ── */}
      {showMergeModal && mergeResult && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowMergeModal(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, width: '90vw', maxWidth: 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            {/* ヘッダー */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>🔗 AI統合サマリー</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{selectedIds.size}件を分析</span>
              </div>
              <button onClick={() => setShowMergeModal(false)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {/* コンテンツ */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {mergeResult}
            </div>
            {/* フッター */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={handleSaveMergeReport} disabled={isSaving}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: isSaving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
                {isSaving ? '保存中...' : '📚 リサーチ保存に追加'}
              </button>
              <button onClick={() => copyToClipboard(mergeResult).then(() => alert('コピーしました！'))}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
                📋 コピー
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 40 }}>読み込み中...</div>}>
      <LibraryPageInner />
    </Suspense>
  );
}
