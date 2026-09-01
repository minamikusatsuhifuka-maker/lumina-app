'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
// 252: このファイルの既存コードは item を any で扱っているが、252で足した経路だけは
// 必要な形だけを持つ軽い型を通す（新しく any を増やさない）
type LibraryRow = {
  id: string;
  is_favorite?: number;
  custom_folder_ids?: number[];
  [key: string]: unknown;
};
import { useSearchParams, useRouter } from 'next/navigation';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { confirmBulkDelete } from '@/lib/bulk-delete-confirm';
// 252: マイフォルダ（🗂保存一覧と同じフォルダ一覧を共有）
import CustomFolderBar from '@/components/custom-folders/CustomFolderBar';
// 253: フォルダを開いたら両画面のアイテムをまとめて出す（共有したなら中身は全部見える）
import FolderCrossView from '@/components/custom-folders/FolderCrossView';
// 256: カードにカーソルを当てたときの本文プレビュー（library は本文が手元にあるので追加取得なし）
import { useHoverPreview } from '@/components/HoverPreview';
import { markdownToReadableText } from '@/lib/markdownToText';
import FolderPickerPopover from '@/components/custom-folders/FolderPickerPopover';
import FolderBadges from '@/components/custom-folders/FolderBadges';
import {
  useCustomFolders,
  type FolderFilter,
} from '@/components/custom-folders/useCustomFolders';
import { triggerDownload } from '@/lib/download';
import { KINDLE_LIBRARY_TYPES, MAX_KINDLE_SOURCES } from '@/lib/kindle-limits';
import { LibraryItemRow, type LibraryArtifactView } from '@/components/LibraryItemRow';
// 283: 同一リサーチの本文・要約を1枚のカードにまとめる判定（表示側のみ・DB無変更）
import { ARTIFACT_LABEL, groupLibraryItems, type LibraryCard } from '@/lib/library-groups';
// 282: 全画面リーダーは新設せず、AI参照素材/保存一覧と同じ共通部品を呼び出す（画面ごとに別実装を増やさない）
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { sanitizeLatex } from '@/lib/markdown-renderer';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';
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
  const router = useRouter();
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
  // 252: マイフォルダ（保存一覧と共有の 'stock' 体系）。絞り込みはタブ・検索とAND
  const customFolders = useCustomFolders('library', (msg) => alert(msg));
  const hoverPreview = useHoverPreview();
  const [activeCustomFolder, setActiveCustomFolder] = useState<FolderFilter>(null);
  const [folderPicker, setFolderPicker] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [mergeResult, setMergeResult] = useState('');
  const [merging, setMerging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 282: 全画面リーダーで表示中のアイテム（null=非表示）。本文は /api/library が content 込みで返すため追加取得なし
  const [readerItem, setReaderItem] = useState<any | null>(null);
  const [readerCopied, setReaderCopied] = useState(false);
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
    void customFolders.reload();
  };

  // ── 252: マイフォルダ（249と同じ操作感） ──
  // 分類を変えたまま閉じたときだけ、絞り込み中の表示を整えるためのフラグ
  const folderPickerDirty = useRef(false);

  /** ☆ボタン: 未登録ならお気に入りにしてから、いずれの場合も分類パネルを開く */
  const handleFavoriteClick = (item: LibraryRow, rect: DOMRect) => {
    if (!item.is_favorite) void toggleFavorite(item);
    setFolderPicker({ id: item.id, rect });
  };

  const closeFolderPicker = () => {
    folderPickerDirty.current = false;
    setFolderPicker(null);
  };

  /** 所属フォルダを選択内容に置き換える（チェックした時点で保存） */
  const handleAssignFolders = async (id: string, folderIds: number[]) => {
    const before = items.find((i) => i.id === id)?.custom_folder_ids ?? [];
    folderPickerDirty.current = true;
    setItems(prev => prev.map(i => (i.id === id ? { ...i, custom_folder_ids: folderIds } : i)));
    const ok = await customFolders.assignItem(id, folderIds);
    if (!ok) {
      setItems(prev => prev.map(i => (i.id === id ? { ...i, custom_folder_ids: before } : i)));
    }
  };

  /** パネルからのお気に入り解除。分類だけ残らないよう先に全解除する */
  const handleUnfavorite = async (item: LibraryRow) => {
    await customFolders.assignItem(item.id, []);
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, custom_folder_ids: [] } : i)));
    await toggleFavorite(item);
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

  // 250: 選択中を一括削除。件数を明示した確認を必ず経由し、Undoは持たない（不可逆）。
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const bulkDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    if (!confirmBulkDelete(ids.length, '資料')) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/library', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(`削除に失敗しました: ${data.error || '不明なエラー'}`); return; }
      const gone = new Set(ids);
      setItems(prev => prev.filter(i => !gone.has(i.id)));
      setSelectedIds(new Set());
      alert(`${data.deleted ?? ids.length}件を削除しました`);
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally { setBulkDeleting(false); }
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

  // 252: マイフォルダの絞り込み（全件が手元にあるのでクライアント側で足りる）。
  // タブ・検索・お気に入りとはANDで重なる。
  // 入ってきた配列の型をそのまま返す（このファイルの既存コードは item を any で扱うため、
  // ここで型を狭めると呼び出し側に波及する。any を増やさずに素通しできるようジェネリクスにする）
  const filterByCustomFolder = <T extends LibraryRow>(list: T[]): T[] => {
    if (activeCustomFolder === null) return list;
    if (activeCustomFolder === 'unfiled') {
      return list.filter((i) => i.is_favorite && (i.custom_folder_ids?.length ?? 0) === 0);
    }
    return list.filter((i) => (i.custom_folder_ids ?? []).includes(activeCustomFolder));
  };

  const tabFilteredItems = useMemo(() => {
    // searchScope='all' で検索クエリ有のときはタブ無視で全体検索
    if (search.trim() && searchScope === 'all') {
      return filterByCustomFolder(filterBySearch(items));
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
    return filterByCustomFolder(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, searchScope, activeTab, favFilterInTab, selectedSubCategory, showFailedOnly, activeCustomFolder]);

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
  // 283: 全行をカードにまとめる（判定は lib/library-groups.ts・決定的）。絞り込みは従来どおり行単位で行い、
  // 1件でも残った成果物があるカードを出す＝まとめたことで検索結果が欠落しない。
  // 検索中は「どの成果物がヒットしたか」を hit で渡す（カード内の他の成果物も薄く表示して残す）
  const allCards = useMemo(() => groupLibraryItems<any>(items), [items]);
  const cardOfItem = useMemo(() => {
    const m = new Map<string, LibraryCard<any>>();
    for (const c of allCards) for (const a of c.artifacts) m.set(String(a.item.id), c);
    return m;
  }, [allCards]);
  type VisibleCard = { card: LibraryCard<any>; matched: Set<string>; first: any };
  const visibleCards = useMemo<VisibleCard[]>(() => {
    const out: VisibleCard[] = [];
    const idx = new Map<string, VisibleCard>();
    for (const it of tabFilteredItems) {
      const card = cardOfItem.get(String(it.id));
      if (!card) continue;
      let v = idx.get(card.key);
      if (!v) {
        v = { card, matched: new Set<string>(), first: it };
        idx.set(card.key, v);
        out.push(v);
      }
      v.matched.add(String(it.id));
    }
    return out;
  }, [tabFilteredItems, cardOfItem]);

  const groupedByFolder = useMemo(() => {
    const folders = new Map<string, VisibleCard[]>();
    const noFolder: VisibleCard[] = [];
    for (const v of visibleCards) {
      // カードの置き場所は、絞り込みを通った最初の成果物の（旧）フォルダ名で決める
      const folderName = v.first.folder_name;
      if (folderName) {
        const arr = folders.get(folderName) || [];
        arr.push(v);
        folders.set(folderName, arr);
      } else {
        noFolder.push(v);
      }
    }
    // フォルダ名でソート
    const sortedFolders = Array.from(folders.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ja'));
    return { sortedFolders, noFolder };
  }, [visibleCards]);

  // 282: 全画面リーダーの j/k（前後の資料）は画面に出ている順（フォルダ節→未整理）で動く
  const readerOrder = useMemo(
    () =>
      [...groupedByFolder.sortedFolders.flatMap(([, arr]) => arr), ...groupedByFolder.noFolder].flatMap((v) =>
        v.card.artifacts.map((a) => a.item),
      ),
    [groupedByFolder],
  );
  const openReader = (item: any) => {
    hoverPreview.hide();
    setReaderCopied(false);
    setReaderItem(item);
  };
  const readerIdx = readerItem ? readerOrder.findIndex((i) => i.id === readerItem.id) : -1;

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

  // 230【A】: コンパクトカード＋1〜4列グリッドを全タブ・検索中・お気に入りにも適用
  // （219のDRタブ限定と「全体横断検索中は通常表示に戻す」安全弁は院長指示で撤去。
  //   全タブcompactになったため混在表示でも列が揃う）
  const isDrCompact = true;
  // 画面幅に応じて自動で1〜4列（院長指定のリテラル）
  const drGridClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  /* ── 各カードのレンダリング（283: 1枚＝同一リサーチの成果物1〜4件） ── */
  const renderItem = (v: VisibleCard) => {
    const { card, matched } = v;
    const item = card.primary;
    const searching = search.trim().length > 0;
    const artifacts: LibraryArtifactView[] | undefined =
      card.artifacts.length >= 2
        ? card.artifacts.map((a) => ({
            item: a.item,
            kind: a.kind,
            label: ARTIFACT_LABEL[a.kind],
            selected: selectedIds.has(a.item.id),
            expanded: expandedId === a.item.id,
            hit: searching ? matched.has(String(a.item.id)) : undefined,
          }))
        : undefined;
    return (
    <div
      key={card.key}
      style={isDrCompact ? { minWidth: 0, height: '100%' } : undefined}
      // 256: 本文は既に手元にある（/api/library が content 込みで返す）＝追加リクエストなし
      // 257: プレビューはこの要素の矩形に隣接して出る。E2Eが位置を座標で判定するための目印
      data-hover-card={item.id}
      {...hoverPreview.bind(() => markdownToReadableText(item.content))}
    >
      <LibraryItemRow
        item={item}
        artifacts={artifacts}
        linkKind={card.link}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        mergeMode={mergeMode}
        selected={selectedIds.has(item.id)}
        onSelectToggle={(id, checked) => { const next = new Set(selectedIds); if (checked) next.add(id); else next.delete(id); setSelectedIds(next); }}
        onFavoriteToggle={toggleFavorite}
        onFavoriteClick={handleFavoriteClick}
        folderBadges={
          (item.custom_folder_ids?.length ?? 0) > 0 ? (
            <FolderBadges folderIds={item.custom_folder_ids} folders={customFolders.folders} />
          ) : undefined
        }
        onDelete={deleteItem}
        onEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
        onExportTxt={downloadTxt}
        onExportMd={downloadMd}
        onExportPdf={async (it) => { const { exportToPdf } = await import('@/lib/exportPdf'); await exportToPdf(it.title?.slice(0, 40) || 'リサーチ保存', it.content || ''); }}
        onUseInWrite={(it) => { localStorage.setItem('lumina_research_context', it.content || ''); window.location.href = '/dashboard/write'; }}
        onStartTagEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
        onExpandToggle={(id) => {
          // 274と同じ: ホバープレビュー（256/273）が出ていたら閉じる（本文の上にふきだしを残さない）
          hoverPreview.hide();
          setExpandedId(expandedId === id ? null : id);
        }}
        isExpanded={expandedId === item.id}
        onMoveToFolder={openFolderModal}
        onTagClick={(t) => setSearch(t)}
        variant={isDrCompact ? 'compact' : 'default'}
        // 282: ⛶全画面（共通 FullscreenReader）とタイトルクリック展開（274と同じ挙動）を有効にする
        onFullscreen={openReader}
        clickToExpand
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
  };

  /* ── フォルダセクション描画 ── */
  const renderFolderSection = (folderName: string, folderItems: VisibleCard[]) => {
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
          isDrCompact ? (
            <div className={drGridClass} style={{ gap: 12, paddingLeft: 12 }}>
              {folderItems.map(renderItem)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 12 }}>
              {folderItems.map(renderItem)}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>📚 リサーチ保存</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* 261: 発信ハブへの導線（R-34・常時表示）。DR記事からnote/X/Kindle/戦略/画像へ展開する */}
        <a
          href="/dashboard/dr-hub"
          style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(224,104,75,0.1)', color: '#e0684b',
            border: '1px solid rgba(224,104,75,0.3)',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
          title="保存済みのDR記事から、note記事・X投稿・Kindle本・戦略・画像への展開をまとめて行えます"
        >
          🚀 発信ハブ
        </a>
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
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>保存した調査・分析・文章を管理。お気に入り・タグ・フォルダ分けに対応。</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>読み返す用の保管庫です。生成時にAIへ参照させたいものは <a href="/dashboard/context-library" style={{ color: 'var(--accent)', fontWeight: 600 }}>🧠 AI参照素材</a> へ</p>

      {/* 252: マイフォルダ（🗂保存一覧と同じフォルダ一覧を共有。自動カテゴリのタブとは別軸） */}
      <div style={{ marginBottom: 16 }}>
        <CustomFolderBar
          scope="library"
          folders={customFolders.folders}
          favoriteTotal={customFolders.favoriteTotal}
          unfiledFavoriteCount={customFolders.unfiledFavoriteCount}
          value={activeCustomFolder}
          onChange={setActiveCustomFolder}
          onCreate={customFolders.createFolder}
          onRename={customFolders.renameFolder}
          onDelete={customFolders.deleteFolder}
          onReorder={customFolders.reorderFolders}
          storageKey="lib_custom_folder_open"
        />
      </div>

      {/* 253: マイフォルダを開いている間は、両画面のアイテムをまとめた横断ビューに差し替える */}
      {typeof activeCustomFolder === 'number' ? (
        <FolderCrossView
          folderId={activeCustomFolder}
          folders={customFolders.folders}
          onFoldersChanged={() => {
            void customFolders.reload();
            void refetchItems();
          }}
          onCreateFolder={customFolders.createFolder}
          onExit={() => setActiveCustomFolder(null)}
          notify={(m) => alert(m)}
        />
      ) : (
      <>

      {/* 選択モードガイド */}
      {mergeMode && (
        <div style={{ padding: '10px 16px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          ✓ 資料をチェックすると、下のバーから「AIでまとめる（2件以上）」「Kindle本にする」「一括削除」が使えます
        </div>
      )}

      {/* 検索 + スコープ切替 + お気に入り絞り込み + 一括AI分類 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-library-search
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
          🔍 「{search}」の検索結果: {tabFilteredItems.length}件（カード {visibleCards.length}枚）
          {searchScope === 'all' ? '（全カテゴリ横断）' : `（${activeTab === 'all' ? '全件' : activeTab === 'favorite' ? 'お気に入り' : activeTab + ' タブ'}内）`}
        </div>
      )}

      {/* 統計 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          // 283: 「件」は成果物（本文・要約などの行）、「枚」はまとめた後のカード。両方見せて取り違えを防ぐ
          { label: '総アイテム（件＝成果物）', value: items.length, color: '#6c63ff' },
          { label: 'カード（枚）', value: allCards.length, color: '#8b5cf6' },
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
              {isDrCompact ? (
                <div className={drGridClass} style={{ gap: 12 }}>
                  {groupedByFolder.noFolder.map(renderItem)}
                </div>
              ) : (
                groupedByFolder.noFolder.map(renderItem)
              )}
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
      </>
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
          {/* 230【B-1】: 選択→Kindleウィザード①へhandoff（対象=DR/note記事のみ・読取後削除の冪等キー） */}
          <button
            onClick={() => {
              const selected = items.filter((i) => selectedIds.has(i.id));
              // 231: 対象typeと上限を共有定数へ（library画面のtypeハードコード解消）
              const eligible = selected.filter((i) => (KINDLE_LIBRARY_TYPES as readonly string[]).includes(i.type));
              const excluded = selected.length - eligible.length;
              if (eligible.length === 0) {
                alert('選択中にKindle素材にできる資料がありません（対象: ディープリサーチ・note記事）');
                return;
              }
              if (excluded > 0 && !confirm(`${excluded}件は対象外（ディープリサーチ・note記事以外）のため除外します。${eligible.length}件で続けますか？`)) return;
              let take = eligible;
              if (eligible.length > MAX_KINDLE_SOURCES) {
                if (!confirm(`Kindle素材は最大${MAX_KINDLE_SOURCES}件です。選択順の先頭${MAX_KINDLE_SOURCES}件（${eligible.length}件中）を渡します。続けますか？`)) return;
                take = eligible.slice(0, MAX_KINDLE_SOURCES);
              }
              try {
                sessionStorage.setItem('lumina_kindle_selected', JSON.stringify(take.map((i) => i.id)));
              } catch { /* プライベートモード等で失敗しても遷移は続行（ウィザードで選び直せる） */ }
              router.push('/dashboard/kindle-wizard');
            }}
            style={{ padding: '6px 16px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            📖 Kindle本にする
          </button>
          {/* 250: 一括削除。不可逆なので赤で区別し、他の操作より右（押し間違えない位置）に置く */}
          <button
            data-bulk-delete
            onClick={bulkDeleteSelected}
            disabled={bulkDeleting}
            style={{ padding: '6px 16px', borderRadius: 99, background: bulkDeleting ? 'rgba(255,255,255,0.2)' : '#dc2626', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', cursor: bulkDeleting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            {bulkDeleting ? '⏳ 削除中...' : `🗑 ${selectedIds.size}件を削除`}
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
              <button onClick={() => copyRichMarkdown(mergeResult).then(() => alert('コピーしました！'))}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
                📋 コピー
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 282: 全画面リーダー（リサーチ保存の本文を読み物表示）。AI参照素材/保存一覧と同じ共通部品。
          ヘッダーのアクションはカードと同じハンドラ（downloadMd）を共有し、一覧の状態を変える操作
          （お気に入り/削除）は誤操作防止のため入れない（191と同じ方針）。
          文字サイズ4段階（ルート zoom）は body 直下の portal にもそのまま効く */}
      <FullscreenReader
        open={readerItem !== null}
        title={readerItem?.title || '無題'}
        content={readerItem?.content ?? ''}
        onClose={() => setReaderItem(null)}
        onPrev={readerIdx > 0 ? () => openReader(readerOrder[readerIdx - 1]) : undefined}
        onNext={
          readerIdx >= 0 && readerIdx < readerOrder.length - 1
            ? () => openReader(readerOrder[readerIdx + 1])
            : undefined
        }
        actions={
          readerItem && (
            <>
              <button
                type="button"
                data-library-reader-copy
                onClick={async () => {
                  try {
                    // 他2画面のリーダーと同じく LaTeX 正規化を掛けてリッチコピー（貼り付け先は不定＝汎用ラッパー）
                    await copyRichMarkdown(sanitizeLatex(readerItem.content || ''));
                    setReaderCopied(true);
                    setTimeout(() => setReaderCopied(false), 2000);
                  } catch {}
                }}
                style={{
                  ...cardActionBtnStyle(),
                  ...(readerCopied
                    ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' }
                    : {}),
                }}
              >
                {readerCopied ? '✅ コピー済み' : '📋 コピー'}
              </button>
              <button
                type="button"
                data-library-reader-md
                onClick={() => downloadMd(readerItem)}
                style={cardActionBtnStyle()}
              >
                📥 MD
              </button>
            </>
          )
        }
      />

      {/* 256: 本文プレビューのポップアップ（1画面に1つだけ） */}
      {hoverPreview.layer}

      {/* 252: 分類パネル（☆ボタンから開く。createPortalでbody直下に出す＝R-19） */}
      {folderPicker &&
        (() => {
          const target = items.find((i) => i.id === folderPicker.id);
          if (!target) return null;
          return (
            <FolderPickerPopover
              anchorRect={folderPicker.rect}
              folders={customFolders.folders}
              selectedIds={target.custom_folder_ids ?? []}
              isFavorite={!!target.is_favorite}
              onChange={(ids) => void handleAssignFolders(target.id, ids)}
              onCreate={customFolders.createFolder}
              onUnfavorite={() => void handleUnfavorite(target)}
              onClose={closeFolderPicker}
            />
          );
        })()}
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
