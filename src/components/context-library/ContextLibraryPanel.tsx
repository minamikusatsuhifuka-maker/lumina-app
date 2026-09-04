'use client';

import { useEffect, useState, useMemo, useRef, type CSSProperties } from 'react';
import FeatureDefaultContextSelector, { FEATURE_OPTIONS } from '@/components/FeatureDefaultContextSelector';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { markdownToReadableText } from '@/lib/markdownToText';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { KEY_HINT, useShortcutHints } from '@/lib/shortcuts';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';
import { confirmBulkDelete } from '@/lib/bulk-delete-confirm';
// 256: カードにカーソルを当てたときの本文プレビュー
import { useHoverPreview } from '@/components/HoverPreview';
import { BundleSelectToggleButton, BundleSelectCheckbox } from '@/components/note-bundle/BundleSelectControls';
import { useNoteBundleSelection } from '@/components/note-bundle/useNoteBundleSelection';
// 249: マイフォルダ（院長が名前を付けるお気に入りの分類・自動カテゴリとは別軸）
import CustomFolderBar from '@/components/custom-folders/CustomFolderBar';
import FolderBadges from '@/components/custom-folders/FolderBadges';
import FolderPickerPopover from '@/components/custom-folders/FolderPickerPopover';
// 297: 🎯用途カテゴリ（マイフォルダとは別の枠・別テーブル・別色）
import PurposeCategoryBar from '@/components/purpose-categories/PurposeCategoryBar';
import PurposePickerPopover from '@/components/purpose-categories/PurposePickerPopover';
import PurposeBadges from '@/components/purpose-categories/PurposeBadges';
import { usePurposeCategories, type PurposeFilter } from '@/components/purpose-categories/usePurposeCategories';
// 295: 291・292・293 の部品と判断をそのまま使う（新規に作らない・R-91）
import LibraryCompareView from '@/components/library/LibraryCompareView';
import { CharCountBadge } from '@/components/LibraryItemRow';
import { ActiveConditionChips } from '@/components/ActiveConditionChips';
import {
  CL_LIST_COLUMN_CHOICE_DEFAULT,
  CL_LIST_COLUMN_KEY,
  CL_LIST_DENSITY_KEY,
  LIBRARY_COMPARE_MAX,
  LIST_COLUMN_CHOICES,
  LIST_DENSITIES,
  LIST_DENSITY_DEFAULT,
  LIST_DENSITY_LABEL,
  type LibraryCompareEntry,
  type ListColumnChoice,
  type ListDensity,
  libraryCompareState,
  listGridClass,
  loadListColumnChoice,
  loadListDensity,
  resolveListColumns,
  saveListColumnChoice,
  saveListDensity,
} from '@/lib/library-view';
import { useFinePointer } from '@/lib/pointer-device';
import {
  type ActiveCondition,
  CL_SEARCH_SCOPE_KEY,
  SEARCH_PLACEHOLDER,
  SEARCH_SCOPES,
  SEARCH_SCOPE_LABEL,
  type SearchScope,
  loadSearchScope,
  saveSearchScope,
  zeroResultMessage,
} from '@/lib/library-filters';
import { CONTEXT_ORIGIN_LABEL, contextOriginKind } from '@/lib/context-origin';
import {
  useCustomFolders,
  type FolderFilter,
} from '@/components/custom-folders/useCustomFolders';

// 175: 一覧APIは本文(context_text)を返さない。char_count のみ受け取り、
// 本文が必要な操作（全文表示・コピー・DL・編集・活用等）の時に ?id= で単体取得してマージする。
type ContextSave = {
  id: number;
  topic: string;
  context_text?: string;
  research_text?: string | null;
  tags: string[] | null;
  created_at: string;
  is_favorite?: boolean;
  category?: string;
  char_count?: number | string;
  // 249: 所属するマイフォルダのID（複数可・自動カテゴリの category とは別軸）
  custom_folder_ids?: number[];
  // 297: 所属用途カテゴリID（マイフォルダとは別体系）
  purpose_category_ids?: number[];
};

// 1ページの取得件数（165ギャラリーの「もっと見る」方式と同系統）
const PAGE_SIZE = 30;

interface AutoCategorizeResult {
  categories?: Array<{
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    item_ids?: number[];
  }>;
  summary?: string;
  updatedCount?: number;
  totalItems?: number;
}

const CATEGORY_PALETTE = [
  '#3b82f6',
  '#1D9E75',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#10b981',
];

function getCategoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category);
  return idx >= 0 ? CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] : '#6b7280';
}

function categoryCardStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(108,99,255,0.08)' : 'var(--bg-card)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: 0,
  };
}

// 生成元（どのメニューで作られたか）の判定は 295 で lib/context-origin.ts へ移した（判定は不変）。
// 比較パネルの列ヘッダーにも同じ判定を使う（§2-4）。

// 295 §2-4: 比較の列（LibraryCompareView の行型）。一覧は本文を持たないので比較を開くときに ensureFullText で埋める
type CompareRow = { id: string; title: string; content: string; char_count: number; created_at: string | null; tags: string[] | null };

export default function ContextLibraryPanel() {
  const [items, setItems] = useState<ContextSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // 192: タグは複数選択＋AND/OR（1件に複数タグが付くのはタグ側のみ。カテゴリは1件1つ＝単一選択のまま）
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'and' | 'or'>('or');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  // お気に入り絞り込み（コンテキストライブラリ内で完結＝テキスト分析とは別管理）
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // 274: 複数カードを同時に展開できるようにする（1枚開くと他が閉じる排他制御にしない）
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const openExpanded = (id: number) => setExpandedIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  // 下部アクション（文章作成へ〜要約・詳細）のアコーディオン開閉。カードごと・既定は閉（誤発火防止）。
  const [actionsOpen, setActionsOpen] = useState<Record<number, boolean>>({});
  // 197: 「⋯ その他」メニュー（全画面/テキスト/MD/Word/編集/削除を格納）を開いているカードのid
  const [moreMenuId, setMoreMenuId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // テキスト/MD ダウンロード中のID（本文取得中の同時押し防止。txt/MD共用）
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // カード編集（タイトル=topic + 本文=context_text。同時編集は1件のみ）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // 全画面リーダーで表示中のアイテム（null=非表示）
  const [readerItem, setReaderItem] = useState<ContextSave | null>(null);
  // 204 第1層: ツールチップ/placeholderへのキー併記（設定OFF・モバイルでは非表示）
  const showKbHints = useShortcutHints();
  // contextSaveId -> 登録済み機能キー配列 のマップ
  const [defaultMap, setDefaultMap] = useState<Record<number, string[]>>({});

  // 197: ⋯メニューの外側クリックで閉じる（fixedオーバーレイは .page-enter のtransform罠が
  // あるため使わず、documentリスナーで判定する）
  useEffect(() => {
    if (moreMenuId === null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('[data-ctx-more-menu]')) return;
      setMoreMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreMenuId]);

  // 197: ⋯メニュー内の項目ボタン共通スタイル
  const moreMenuItemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--text-secondary)',
  };
  // 要約・詳細ボタンの処理中／完了状態
  const [processingId, setProcessingId] = useState<{ id: number; mode: 'summary' | 'detail' } | null>(null);
  const [processedId, setProcessedId] = useState<{ id: number; mode: 'summary' | 'detail' } | null>(null);
  const [toast, setToast] = useState<string>('');
  // フィルタ条件での総件数（サーバ側COUNTから取得。「表示N / 全M件」と「もっと見る」の判定に使用）
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // フィルタ無しの全件数（カテゴリ概要「すべて」・空状態判定・自動カテゴライズ件数の母数）
  const [allTotal, setAllTotal] = useState(0);
  // 全件を母数にしたカテゴリ別件数・タグ一覧（サーバ集計。取得済みページだけを母数にしない）
  const [serverCategories, setServerCategories] = useState<{ category: string; count: number }[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  // 「もっと見る」読み込み中
  const [loadingMore, setLoadingMore] = useState(false);
  // 検索のデバウンス（入力のたびにサーバ検索しない）
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // カテゴリ概要（📁カテゴリ概要＋🤖AIが自動カテゴライズ。テキスト分析と同じ挙動）
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCategoryGrid, setShowCategoryGrid] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cl_category_open');
      if (saved !== null) setShowCategoryGrid(saved === '1');
    } catch {
      /* localStorage 不可環境では既定値（閉）のまま */
    }
  }, []);
  const toggleCategoryGrid = () => {
    setShowCategoryGrid((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cl_category_open', next ? '1' : '0');
      } catch {
        /* 保存失敗は無視（開閉自体は機能する） */
      }
      return next;
    });
  };
  // 256: 本文は ensureFullText（取得済みならそのまま返す）を通す＝ホバーのたびに叩かない
  const hoverPreview = useHoverPreview();

  // 250: 一括削除のための選択モード（📚リサーチ保存の「選択モード」と同じ流儀）。
  // note素材の選択モード（179/180・共有ストア）とは別物なので、同時には出さない。
  // 296: 選択は既定＝チェック常時表示（「☑ 選んで削除」のモード切替は撤去）。選択状態はこの state だけ＝保存しない（§2-3）。
  // 操作バー（削除・比較）は1件以上選んだときだけ出す。全選択は置かない（§2-4）
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── 295: 一覧の見え方（列数・密度）・検索範囲・選択して比較。判断は 291/292/293 の lib と同じ ──
  const [searchRange, setSearchRange] = useState<SearchScope>('all');
  const [listColChoice, setListColChoice] = useState<ListColumnChoice>(CL_LIST_COLUMN_CHOICE_DEFAULT);
  const [listDensity, setListDensity] = useState<ListDensity>(LIST_DENSITY_DEFAULT);
  const { fine: finePointer, mounted: pointerMounted } = useFinePointer();
  useEffect(() => {
    // 保存値は画面別キー（📚🗂と混ざらない）。ハイドレーション後に読む
    setSearchRange(loadSearchScope(CL_SEARCH_SCOPE_KEY));
    setListColChoice(loadListColumnChoice(CL_LIST_COLUMN_KEY, CL_LIST_COLUMN_CHOICE_DEFAULT));
    setListDensity(loadListDensity(CL_LIST_DENSITY_KEY));
  }, []);
  const applySearchRange = (s: SearchScope) => { setSearchRange(s); saveSearchScope(s, CL_SEARCH_SCOPE_KEY); };
  const applyListCols = (c: ListColumnChoice) => { setListColChoice(c); saveListColumnChoice(c, CL_LIST_COLUMN_KEY); };
  const applyListDensity = (d: ListDensity) => { setListDensity(d); saveListDensity(d, CL_LIST_DENSITY_KEY); };
  const resolvedListCols = resolveListColumns(pointerMounted ? finePointer : true, listColChoice);
  const compact = listDensity === 'compact';
  // 選択して比較（既存の「☑ 選んで削除」の選択状態を流用・新しい選択モードは作らない）
  const [compareEntries, setCompareEntries] = useState<LibraryCompareEntry<CompareRow>[] | null>(null);
  const [comparePreparing, setComparePreparing] = useState(false);
  const compareState = libraryCompareState(selectedIds.size);

  // 249: マイフォルダ（自動カテゴリとは別軸の手動分類）。絞り込みは activeCategory と AND
  const customFolders = useCustomFolders('context', (msg) => {
    setToast(`❌ ${msg}`);
    setTimeout(() => setToast(''), 3000);
  });
  const [activeCustomFolder, setActiveCustomFolder] = useState<FolderFilter>(null);
  // 分類パネルを開いている素材（☆ボタンの矩形に合わせてポップオーバーを出す）
  const [folderPicker, setFolderPicker] = useState<{ id: number; rect: DOMRect } | null>(null);
  // 297: 用途カテゴリ（3画面で共有の1体系）。絞り込みはサーバー側 pcat= で他条件と AND
  const purposes = usePurposeCategories('context', (msg) => { setToast(`❌ ${msg}`); setTimeout(() => setToast(''), 3000); });
  const [activePurpose, setActivePurpose] = useState<PurposeFilter>(null);
  const [purposePicker, setPurposePicker] = useState<{ id: number; rect: DOMRect } | null>(null);
  const purposePickerDirty = useRef(false);
  // 分類を変えたまま閉じたときだけ、絞り込み中の一覧を取り直すためのフラグ
  const folderPickerDirty = useRef(false);
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [categorizationResult, setCategorizationResult] =
    useState<AutoCategorizeResult | null>(null);
  // 179/180: note記事まとめの複数選択モード。選択状態は共有ストア（useNoteBundleSelection）に集約し、
  // 🗂テキスト分析の一覧ともタブ・ページをまたいで選択を共有する。バー＋モーダルは NoteBundleDock（ページ直下）。
  const { selectMode: bundleSelectMode, isSelected: isBundleSelected } = useNoteBundleSelection();

  // URLパラメータから batchId を取得
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const batch = params.get('batch');
      if (batch) {
        setTagFilters([`batch:${batch}`]);
        setBatchFilter(batch);
      }
    } catch {}
  }, []);

  // 検索入力を300msデバウンスしてサーバ検索へ
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // 一覧取得（175: サーバ側フィルタ＋offsetページング。append=true で「もっと見る」追記）
  const fetchPage = async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(offset));
      if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim());
      if (debouncedSearch.trim() && searchRange === 'title') p.set('qScope', 'title'); // 295: 内容（本文）を対象から外す
      // 192: タグ複数指定はカンマ結合でなく1タグ1パラメータで送る（タグ名にカンマが入っても壊れない）
      for (const t of tagFilters) p.append('filterTags', t);
      if (tagFilters.length > 0) p.set('tagMode', tagMode);
      if (favoriteOnly) p.set('favorite', '1');
      if (activeCategory !== null) p.set('category', activeCategory);
      // 249: マイフォルダでの絞り込み（id指定 / お気に入りの未分類）
      if (activeCustomFolder !== null) p.set('cfolder', String(activeCustomFolder));
      if (activePurpose !== null) p.set('pcat', String(activePurpose)); // 297: 用途カテゴリ
      const res = await fetch(`/api/context-saves?${p.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list: ContextSave[] = Array.isArray(data.items) ? data.items : [];
        setItems(prev => (append ? [...prev, ...list] : list));
        setTotalCount(Number(data.total_count) || 0);
        setAllTotal(Number(data.all_total) || 0);
        setServerCategories(Array.isArray(data.categories) ? data.categories : []);
        setAllTags(Array.isArray(data.all_tags) ? data.all_tags : []);
      }
    } catch {
      // 取得失敗時は現状維持（追記失敗しても既存表示は壊さない）
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  };

  // フィルタ変更時は先頭ページから取り直し（初回ロード含む）
  useEffect(() => {
    fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, searchRange, tagFilters, tagMode, favoriteOnly, activeCategory, activeCustomFolder, activePurpose]);

  // items 取得後、各カードに対する「デフォルト登録機能マップ」を取得（未取得のIDのみ追加取得）
  useEffect(() => {
    const missing = items.filter((it) => defaultMap[it.id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const map: Record<number, string[]> = {};
      await Promise.all(missing.map(async (it) => {
        try {
          const res = await fetch(`/api/feature-default-contexts/by-context-save?contextSaveId=${it.id}`);
          if (res.ok) {
            const data = await res.json();
            map[it.id] = data.featureKeys ?? [];
          }
        } catch {
          map[it.id] = [];
        }
      }));
      if (!cancelled) setDefaultMap(prev => ({ ...prev, ...map }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // カテゴリ一覧（全件を母数にしたサーバ集計から。'general' は名前付きカードに出さない）
  const uniqueCategories = useMemo(
    () => serverCategories.map((c) => c.category).filter((c) => c && c.trim() && c !== 'general'),
    [serverCategories],
  );

  // 192: タグ選択肢の並び順。自動生成タグ（batch:/group:）は現状ほぼ全てだが、
  // 意味の読める group: を先・機械的な batch: を後ろに回す（既定で隠すと選択肢が無くなるため隠さない）。
  const sortedAllTags = useMemo(() => {
    const rank = (t: string) => (t.startsWith('batch:') ? 2 : t.startsWith('group:') ? 1 : 0);
    return [...allTags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ja'));
  }, [allTags]);

  // 本文の遅延取得（一覧APIは本文を返さないため、必要時に ?id= で単体取得して items にマージ）
  const ensureFullText = async (item: ContextSave): Promise<string> => {
    if (typeof item.context_text === 'string') return item.context_text;
    const res = await fetch(`/api/context-saves?id=${item.id}`);
    if (!res.ok) throw new Error('本文の取得に失敗しました');
    const data = await res.json();
    const text: string = data.context_text ?? '';
    setItems(prev => prev.map(it => (
      it.id === item.id ? { ...it, context_text: text, research_text: data.research_text ?? null } : it
    )));
    return text;
  };

  // AIで保存済み全件を自動カテゴライズする（件数は全件母数）
  const handleAutoCategorize = async () => {
    if (allTotal === 0) {
      flashToast('❌ 保存済みの素材がありません');
      return;
    }
    const ok = window.confirm(
      `${allTotal}件の素材をAIが自動カテゴライズします。\n既存のカテゴリは上書きされます。よろしいですか？`,
    );
    if (!ok) return;

    setIsAutoCategorizing(true);
    setCategorizationResult(null);
    try {
      const res = await fetch('/api/context-library/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'categorize' }),
      });
      const data = (await res.json()) as AutoCategorizeResult & { error?: string };
      if (!res.ok) {
        flashToast(`❌ ${data.error ?? '自動カテゴライズに失敗しました'}`);
        return;
      }
      setCategorizationResult(data);
      flashToast(
        `✅ ${data.updatedCount ?? 0}件を${data.categories?.length ?? 0}カテゴリに分類しました`,
      );
      // 一覧をリロード（先頭ページから取り直し）
      fetchPage(0, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '通信エラー';
      flashToast(`❌ ${message}`);
    } finally {
      setIsAutoCategorizing(false);
    }
  };

  // 絞り込みはサーバ側で全件を母数に実施済み（items がそのまま表示対象）

  const handleCopy = async (item: ContextSave) => {
    try {
      const text = await ensureFullText(item);
      // コピー内容にも LaTeX 正規化を適用（テキスト分析側と挙動を揃える）
      await copyRichMarkdown(sanitizeLatex(text));
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  // 一時トースト表示の共通ヘルパー
  const flashToast = (msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // .txt ダウンロード（テキスト分析 handleDownloadTxt 流用。context_saves 対象）。
  // 216: カードの表示タイトル（topic）をそのまま使用（AI再生成しない）。
  // Markdown記号を除去した読みやすいプレーンテキストで書き出す。
  const handleDownloadTxt = async (item: ContextSave) => {
    if (downloadingId !== null) return; // 同時押し防止（MDと共用）
    setDownloadingId(item.id);
    try {
      const text = await ensureFullText(item);
      const title = item.topic || 'AI参照素材';
      const safeTitle = sanitizeFilename(title);
      const txtContent = `${title}\n\n${sanitizeLatex(text)}`;
      triggerDownload(
        `${safeTitle}_${yyyymmdd()}.txt`,
        markdownToReadableText(txtContent),
        'text/plain;charset=utf-8',
      );
      flashToast('✅ テキストファイルをダウンロードしました');
    } catch {
      flashToast('❌ ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  // .md ダウンロード（テキスト分析 handleDownloadMd 流用。context_saves 対象）。
  // 216: カードの表示タイトル（topic）をそのまま使用（AI再生成しない）。
  const handleDownloadMd = async (item: ContextSave) => {
    if (downloadingId !== null) return; // 同時押し防止（txtと共用）
    setDownloadingId(item.id);
    try {
      const text = await ensureFullText(item);
      const title = item.topic || 'AI参照素材';
      const safeTitle = sanitizeFilename(title);
      const mdContent = `# ${title}\n\n${sanitizeLatex(text)}`;
      triggerDownload(
        `${safeTitle}_${yyyymmdd()}.md`,
        mdContent,
        'text/markdown;charset=utf-8',
      );
      flashToast('✅ MDファイルをダウンロードしました');
    } catch {
      flashToast('❌ ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  // Word(.docx) ダウンロード（テキスト分析 handleDownloadDocx 流用。context_saves 対象）。
  // タイトル（216: 表示タイトル=topic使用）・sanitizeLatex・ファイル名規則は txt/MD と同一。
  // markdown→docx 変換は共通関数（markdownToDocx.ts）に集約し、docx はバンドルが
  // 大きいため dynamic import。
  const handleDownloadDocx = async (item: ContextSave) => {
    if (downloadingId !== null) return; // 同時押し防止（txt/MDと共用）
    setDownloadingId(item.id);
    try {
      const text = await ensureFullText(item);
      const title = item.topic || 'AI参照素材';
      const safeTitle = sanitizeFilename(title);
      const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
      await downloadMarkdownAsDocx({
        title,
        metaLines: [],
        markdown: sanitizeLatex(text),
        fileName: `${safeTitle}_${yyyymmdd()}.docx`,
      });
      flashToast('✅ Wordファイルをダウンロードしました');
    } catch {
      flashToast('❌ ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  /** 274: カード内の操作がクリック展開へ伝わらないようにする（領域限定と併せた二重の守り） */
  const stopCardClick = (e: React.MouseEvent) => e.stopPropagation();

  /**
   * 274: 本文の展開トグル。「▼全文表示」ボタンと、タイトル・メタ情報のクリックで**同じ状態**を切り替える。
   * 開くときだけ本文を単体取得する（一覧APIは本文を返さない）。
   * ホバープレビュー（256/273）が出ていたら閉じる——本文の上にふきだしが残らないようにする（§5）。
   */
  const toggleExpand = async (item: ContextSave) => {
    const willOpen = !expandedIds.has(item.id);
    hoverPreview.hide();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (willOpen) next.add(item.id); else next.delete(item.id);
      return next;
    });
    if (!willOpen) return;
    try { await ensureFullText(item); } catch { flashToast('❌ 本文の取得に失敗しました', 4000); }
  };

  // 「✏️ 編集」: 現在の topic/context_text を編集 state にコピーして編集モードへ（展開も保証）
  // 本文は一覧に載っていないため、先に単体取得してから編集フォームへ入れる。
  const startEdit = async (item: ContextSave) => {
    openExpanded(item.id);
    try {
      const text = await ensureFullText(item);
      setEditingId(item.id);
      setEditTitle(item.topic || '');
      setEditContent(text);
    } catch {
      flashToast('❌ 本文の取得に失敗しました', 4000);
    }
  };

  // 編集内容を保存（PATCH action=update。topic + context_text のみ更新）
  const saveEdit = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      flashToast('❌ タイトルと本文は空にできません');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/context-saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          topic: editTitle.trim(),
          contextText: editContent.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const newTopic = editTitle.trim();
      const newContent = editContent.trim();
      setItems(prev =>
        prev.map(it => (it.id === id ? { ...it, topic: newTopic, context_text: newContent, char_count: newContent.length } : it)),
      );
      setEditingId(null);
      flashToast('✅ 更新しました');
    } catch {
      // 失敗時は編集モードを維持（入力内容を失わない）
      flashToast('❌ 更新に失敗しました', 4000);
    } finally {
      setEditSaving(false);
    }
  };

  // お気に入りトグル（楽観更新 → 失敗時ロールバック）。コンテキストライブラリ専用。
  const handleToggleFavorite = async (item: ContextSave) => {
    const next = !item.is_favorite;
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, is_favorite: next } : it));
    try {
      const res = await fetch('/api/context-saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite', id: item.id }),
      });
      if (!res.ok) throw new Error();
      // お気に入り絞り込み中に解除した場合は一覧から除外（サーバ絞り込みと表示を一致させる）。
      // 249: マイフォルダで絞り込み中も同様（解除で分類が外れ、条件から外れるため）
      if (!next && (favoriteOnly || activeCustomFolder !== null)) {
        setItems(prev => prev.filter(it => it.id !== item.id));
        setTotalCount(t => (t === null ? null : Math.max(0, t - 1)));
      }
      void customFolders.reload();
    } catch {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, is_favorite: !next } : it));
      setToast('❌ お気に入りの更新に失敗しました');
      setTimeout(() => setToast(''), 3000);
    }
  };

  // ── 249: マイフォルダ（お気に入りの手動分類） ──

  /** ☆ボタン: 未登録ならお気に入りにしてから、いずれの場合も分類パネルを開く */
  const handleFavoriteButton = (item: ContextSave, rect: DOMRect) => {
    if (!item.is_favorite) void handleToggleFavorite(item);
    setFolderPicker({ id: item.id, rect });
  };

  const closeFolderPicker = () => {
    const changed = folderPickerDirty.current;
    folderPickerDirty.current = false;
    setFolderPicker(null);
    // フォルダで絞り込み中に分類を変えたら、条件から外れた素材を残さないよう取り直す
    if (changed && activeCustomFolder !== null) void fetchPage(0, false);
  };

  /** 所属フォルダを選択内容に置き換える（チェックした時点で保存） */
  const handleAssignFolders = async (id: number, folderIds: number[]) => {
    const before = items.find(it => it.id === id)?.custom_folder_ids ?? [];
    folderPickerDirty.current = true;
    setItems(prev => prev.map(it => (it.id === id ? { ...it, custom_folder_ids: folderIds } : it)));
    const ok = await customFolders.assignItem(id, folderIds);
    if (!ok) {
      setItems(prev => prev.map(it => (it.id === id ? { ...it, custom_folder_ids: before } : it)));
    }
  };

  // 297: 「🎯 用途」ボタン → 割り当てパネル。閉じたとき、用途で絞り込み中なら取り直す
  const handlePurposeButton = (item: ContextSave, rect: DOMRect) => setPurposePicker({ id: item.id, rect });
  const closePurposePicker = () => {
    const changed = purposePickerDirty.current;
    purposePickerDirty.current = false;
    setPurposePicker(null);
    if (changed && activePurpose !== null) void fetchPage(0, false);
  };
  const handleAssignPurposes = async (id: number, categoryIds: number[]) => {
    const before = items.find(it => it.id === id)?.purpose_category_ids ?? [];
    purposePickerDirty.current = true;
    setItems(prev => prev.map(it => (it.id === id ? { ...it, purpose_category_ids: categoryIds } : it)));
    const ok = await purposes.assignItem(id, categoryIds);
    // 保存に成功したら所属を再適用する。検索入力直後など、保存より前に投げた一覧取得の応答が保存の応答より先に届くと
    // 楽観更新が古い一覧で上書きされ、バッジが消えて「開き直すと未チェック」になる（診断で実測）。再適用で確定値に揃える
    setItems(prev => prev.map(it => (it.id === id ? { ...it, purpose_category_ids: ok ? categoryIds : before } : it)));
  };

  /** パネルからのお気に入り解除。分類だけ残らないよう先に全解除する */
  const handleUnfavorite = async (item: ContextSave) => {
    await customFolders.assignItem(item.id, []);
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, custom_folder_ids: [] } : it)));
    await handleToggleFavorite(item);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この素材を削除しますか？')) return;
    try {
      const res = await fetch(`/api/context-saves?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        // 一覧・総件数・カテゴリ集計をローカルでも同期（次回フェッチで正値に戻る）
        const target = items.find(it => it.id === id);
        setItems(prev => prev.filter(it => it.id !== id));
        setTotalCount(t => (t === null ? null : Math.max(0, t - 1)));
        setAllTotal(t => Math.max(0, t - 1));
        if (target) {
          const cat = target.category ?? 'general';
          setServerCategories(prev =>
            prev
              .map(c => (c.category === cat ? { ...c, count: Number(c.count) - 1 } : c))
              .filter(c => Number(c.count) > 0),
          );
        }
        // 249: マイフォルダの件数も取り直す（削除された素材は数えない）
        void customFolders.reload();
      }
    } catch {}
  };

  // 250: 選択中を一括削除。件数を明示した確認を必ず経由し、Undoは持たない（不可逆）。
  const bulkDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    if (!confirmBulkDelete(ids.length, 'AI参照素材')) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/context-saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { flashToast(`❌ ${data.error || '一括削除に失敗しました'}`, 4000); return; }
      setSelectedIds(new Set());
      flashToast(`✅ ${data.deleted ?? ids.length}件を削除しました`);
      // 件数・カテゴリ集計・フォルダ件数を正値に戻すため1ページ目から取り直す
      void fetchPage(0, false);
      void customFolders.reload();
    } catch {
      flashToast('❌ 一括削除に失敗しました', 4000);
    } finally {
      setBulkDeleting(false);
    }
  };

  // 295 §2-4: 選択した素材を横並びで比較。一覧APIは本文を返さないので選んだ順に ensureFullText で埋める（取得済みはそのまま）。
  // 列ヘッダーは生成元（一覧の「生成元」バッジと同じ判定＝lib/context-origin）。
  const handleCompareSelect = async () => {
    if (!compareState.enabled || comparePreparing) return;
    setComparePreparing(true);
    try {
      const ids = Array.from(selectedIds).slice(0, LIBRARY_COMPARE_MAX);
      const entries: LibraryCompareEntry<CompareRow>[] = [];
      for (const id of ids) {
        const it = items.find((x) => x.id === id);
        if (!it) continue; // 一覧から外れた id は落とす（空の列は出さない）
        let text: string;
        try {
          text = await ensureFullText(it);
        } catch {
          flashToast('❌ 本文の取得に失敗しました', 4000);
          return;
        }
        const kind = contextOriginKind(it.tags);
        entries.push({
          item: { id: String(it.id), title: it.topic, content: text, char_count: text.length, created_at: it.created_at ?? null, tags: it.tags ?? null },
          kind,
          label: `${CONTEXT_ORIGIN_LABEL[kind].icon} ${CONTEXT_ORIGIN_LABEL[kind].label}`,
        });
      }
      if (entries.length === 0) { flashToast('❌ 比較できる素材がありません', 4000); return; }
      hoverPreview.hide();
      setCompareEntries(entries);
    } finally {
      setComparePreparing(false);
    }
  };
  // 比較の列 → 一覧の素材（全画面・MDは一覧と同じハンドラへ。取得済み本文をそのまま持たせる）
  const compareItemOf = (row: CompareRow): ContextSave => {
    const it = items.find((x) => String(x.id) === row.id);
    return { ...(it ?? { id: Number(row.id), topic: row.title, tags: row.tags, created_at: row.created_at ?? '' }), context_text: row.content };
  };

  // 295 §2-6（293 §6）: 適用中の条件。タグは 192 のチップ（個別✕・AND/OR）がすぐ下に残るので、ここでは1つにまとめて「すべて外す」口だけ持つ
  const activeConditions: ActiveCondition[] = [];
  if (debouncedSearch.trim()) {
    activeConditions.push({ key: 'search', label: `検索: 「${debouncedSearch.trim()}」`, onRemove: () => setSearch('') });
  }
  if (searchRange === 'title') {
    activeConditions.push({ key: 'range', label: '検索範囲: トピック名のみ', onRemove: () => applySearchRange('all') });
  }
  if (tagFilters.length > 0) {
    activeConditions.push({
      key: 'tags',
      label: `🏷️ タグ: ${tagFilters.length}件（${tagFilters.length >= 2 ? (tagMode === 'and' ? 'すべて含む' : 'いずれか含む') : tagFilters[0]}）`,
      onRemove: () => { setTagFilters([]); setBatchFilter(null); },
    });
  }
  if (favoriteOnly) {
    activeConditions.push({ key: 'fav', label: '⭐ お気に入り', onRemove: () => setFavoriteOnly(false) });
  }
  if (activeCategory !== null) {
    activeConditions.push({ key: 'category', label: `カテゴリ: ${activeCategory}`, onRemove: () => setActiveCategory(null) });
  }
  if (activeCustomFolder !== null) {
    const f = activeCustomFolder === 'unfiled' ? null : customFolders.folders.find((x) => String(x.id) === String(activeCustomFolder));
    activeConditions.push({
      key: 'cfolder',
      label: `マイフォルダ: ${activeCustomFolder === 'unfiled' ? '未分類のお気に入り' : (f?.name ?? activeCustomFolder)}`,
      onRemove: () => setActiveCustomFolder(null),
    });
  }
  if (activePurpose !== null) {
    activeConditions.push({ key: 'purpose', label: `🎯 用途: ${purposes.categories.find((c) => c.id === activePurpose)?.name ?? activePurpose}`, onRemove: () => setActivePurpose(null) });
  }
  const clearAllConditions = () => {
    setActivePurpose(null);
    setSearch('');
    applySearchRange('all');
    setTagFilters([]);
    setBatchFilter(null);
    setFavoriteOnly(false);
    setActiveCategory(null);
    setActiveCustomFolder(null);
  };

  // 296 §2-4: toggleSelectAllVisible（表示中N件を全選択）は撤去（全選択を置かない）

  // 要約／詳細生成 → text_analysis_saves に保存
  const handleSummarize = async (item: ContextSave, mode: 'summary' | 'detail') => {
    if (processingId) return; // 多重押下防止
    setProcessingId({ id: item.id, mode });

    try {
      const text = await ensureFullText(item);
      // 1) AI生成
      const genRes = await fetch('/api/context-library/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          title: item.topic ?? '無題',
          content: text,
          tags: item.tags ?? [],
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error ?? `生成に失敗しました (HTTP ${genRes.status})`);
      }

      const genData = await genRes.json();
      const generated: string = genData.generated;

      // 2) 保存（text_analysis_saves）
      const label = mode === 'summary' ? '要約' : '詳細';
      const analysisLabel = mode === 'summary' ? '要約・概要' : '詳細解説';
      const folder = mode === 'summary' ? 'コンテキスト要約' : 'コンテキスト詳細';

      const saveRes = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${item.topic ?? '無題'} - ${label}`,
          content: generated,
          analysisType: mode,
          analysisLabel,
          folder,
          tags: ['コンテキスト由来', ...(item.tags ?? [])],
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.error ?? `保存に失敗しました (HTTP ${saveRes.status})`);
      }

      // 3) 完了表示
      setProcessedId({ id: item.id, mode });
      setToast(`✅ テキスト分析・カテゴライズに「${label}」として保存しました`);
      setTimeout(() => {
        setProcessedId(null);
        setToast('');
      }, 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast(`❌ ${message}`);
      setTimeout(() => setToast(''), 4000);
    } finally {
      setProcessingId(null);
    }
  };

  const goToTool = async (item: ContextSave, tool: 'write' | 'sns-post' | 'lp' | 'materials') => {
    // 本文は遅延取得。取得に失敗しても遷移先は ?contextId= から単体取得できるため遷移自体は続行。
    let text = '';
    try {
      text = await ensureFullText(item);
    } catch {}
    try {
      sessionStorage.setItem('lumina_context_text', text);
      sessionStorage.setItem('lumina_context_topic', item.topic);
    } catch {}
    const toolPath: Record<typeof tool, string> = {
      'write': '/dashboard/write',
      'sns-post': '/dashboard/sns-post',
      'lp': '/dashboard/lp-generator',
      'materials': '/dashboard/materials',
    };
    window.location.href = `${toolPath[tool]}?contextId=${item.id}`;
  };

  const fmtDate = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return s;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🧠 AI参照素材</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>文章作成・SNS投稿・LP作成のとき、AIに読み込ませて生成の下敷きにする素材集です。リサーチ結果を「🧠 AI参照用に最適化」→「💾 保存」で追加できます。</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          生成用の素材集です。読み返す用の保管は{' '}
          <a href="/dashboard/library" style={{ color: 'var(--accent)', fontWeight: 600 }}>📚 リサーチ保存</a> へ
        </p>
        {/* 188: note記事群生成の入口を見出し直下の目に入る位置へ（検索バー端では発見できなかった） */}
        <div style={{ marginTop: 12 }}>
          <BundleSelectToggleButton />
        </div>
      </div>

      {batchFilter && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,184,0.12))',
          border: '1px solid var(--border-accent)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap' as const,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            🏷️ バッチジョブ #{batchFilter} の結果のみ表示中
          </div>
          <button
            onClick={() => { setBatchFilter(null); setTagFilters([]); }}
            style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            ✕ フィルター解除
          </button>
        </div>
      )}

      <style>{`
        .cl-category-card:hover { border-color: var(--accent); }
        /* カテゴリ概要グリッド: 画面幅に応じて列数を自動調整（テキスト分析と同じ挙動） */
        .cl-category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        @media (max-width: 640px) {
          .cl-category-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* カテゴリ概要ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          📁 カテゴリ概要
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleAutoCategorize}
            disabled={isAutoCategorizing || items.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: isAutoCategorizing ? '#9ca3af' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: isAutoCategorizing || items.length === 0 ? 'not-allowed' : 'pointer',
              opacity: items.length === 0 ? 0.4 : 1,
            }}
            title="AIが全保存素材を分析して最適なカテゴリへ自動分類します"
          >
            {isAutoCategorizing ? '🤖 カテゴライズ中...' : '🤖 AIが自動カテゴライズ'}
          </button>
          <button
            type="button"
            onClick={toggleCategoryGrid}
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showCategoryGrid ? '▲ 折りたたむ' : '▼ 展開'}
          </button>
        </div>
      </div>

      {/* カテゴライズ結果バナー */}
      {categorizationResult && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(79,70,229,0.08)',
            border: '1px solid rgba(79,70,229,0.2)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5', marginBottom: 2 }}>
              ✅ {categorizationResult.updatedCount ?? 0}件を{' '}
              {categorizationResult.categories?.length ?? 0}カテゴリに自動分類しました
            </div>
            {categorizationResult.summary && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                {categorizationResult.summary}
              </p>
            )}
            {categorizationResult.categories && categorizationResult.categories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {categorizationResult.categories.map((cat) => (
                  <span
                    key={cat.name}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 9px',
                      borderRadius: 12,
                      fontSize: 11,
                      background: `${cat.color ?? '#4f46e5'}20`,
                      color: cat.color ?? '#4f46e5',
                      border: `1px solid ${cat.color ?? '#4f46e5'}40`,
                    }}
                  >
                    <span>{cat.icon ?? '📁'}</span>
                    <span>{cat.name}</span>
                    <span style={{ opacity: 0.8, fontSize: 10 }}>({cat.item_ids?.length ?? 0})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCategorizationResult(null)}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {showCategoryGrid && (
        <div className="cl-category-grid" style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            style={categoryCardStyle(activeCategory === null)}
          >
            <span style={{ fontSize: 15 }}>📂</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                flex: 1,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              すべて
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
              {allTotal}
            </span>
          </button>

          {uniqueCategories.map((category) => {
            // 件数は全件を母数にしたサーバ集計（取得済みページだけを数えない）
            const count = Number(serverCategories.find((c) => c.category === category)?.count ?? 0);
            const color = getCategoryColor(category, uniqueCategories);
            const active = activeCategory === category;
            return (
              <button
                type="button"
                key={category}
                onClick={() => setActiveCategory(category)}
                className="cl-category-card"
                style={{ ...categoryCardStyle(active), position: 'relative', overflow: 'hidden' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: color,
                  }}
                />
                <span style={{ fontSize: 15, paddingLeft: 6, flexShrink: 0 }}>📁</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    flex: 1,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {category}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 249: マイフォルダ（院長が名前を付けた分類。🤖自動カテゴリとは別軸で併存） */}
      <div style={{ marginBottom: 20 }}>
        <CustomFolderBar
          scope="context"
          folders={customFolders.folders}
          favoriteTotal={customFolders.favoriteTotal}
          unfiledFavoriteCount={customFolders.unfiledFavoriteCount}
          value={activeCustomFolder}
          onChange={setActiveCustomFolder}
          onCreate={customFolders.createFolder}
          onRename={customFolders.renameFolder}
          onDelete={customFolders.deleteFolder}
          onReorder={customFolders.reorderFolders}
          storageKey="cl_custom_folder_open"
        />
      </div>

      {/* 297: 🎯用途カテゴリ（マイフォルダ＝テーマ別とは別の枠・別色・別テーブル。3画面で共有） */}
      <div style={{ marginBottom: 20 }}>
        <PurposeCategoryBar
          scope="context"
          categories={purposes.categories}
          totalCount={allTotal}
          value={activePurpose}
          onChange={setActivePurpose}
          onCreate={purposes.createCategory}
          onRename={purposes.renameCategory}
          onDelete={purposes.deleteCategory}
          storageKey="cl_purpose_open"
        />
      </div>

      {/* 検索・フィルターバー */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap' as const,
        alignItems: 'center',
      }}>
        <input
          type="text"
          data-kb-search
          placeholder={`${SEARCH_PLACEHOLDER.cl[searchRange]}${showKbHints ? KEY_HINT.searchSuffix : ''}`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {/* 295 §2-6（293 §3-1）: 検索範囲（トピック名のみ＝内容を対象から外す）。既定は「すべて」・保持 */}
        <span data-cl-search-range style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }} title="検索範囲（トピック名のみ＝内容を見ない）">
          {SEARCH_SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              data-cl-search-range-choice={s}
              aria-pressed={searchRange === s}
              onClick={() => applySearchRange(s)}
              style={{
                padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                background: searchRange === s ? 'var(--accent)' : 'transparent',
                color: searchRange === s ? '#fff' : 'var(--text-secondary)',
                border: 'none',
              }}
            >
              {s === 'title' ? 'トピック名のみ' : SEARCH_SCOPE_LABEL[s]}
            </button>
          ))}
        </span>
        {allTags.length > 0 && (
          <select
            value=""
            onChange={e => {
              const t = e.target.value;
              if (t && !tagFilters.includes(t)) setTagFilters(prev => [...prev, t]);
            }}
            title="タグを選ぶと下に条件チップとして追加されます（複数選択可）"
            style={{
              padding: '8px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
              maxWidth: 240,
            }}
          >
            <option value="">🏷️ タグで絞り込み（複数可）...</option>
            {sortedAllTags
              .filter(t => !tagFilters.includes(t))
              .map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setFavoriteOnly(v => !v)}
          title="お気に入り登録した素材だけを表示"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${favoriteOnly ? '#f59e0b' : 'var(--border)'}`,
            background: favoriteOnly ? '#f59e0b' : 'transparent',
            color: favoriteOnly ? '#fff' : 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⭐ お気に入り
        </button>
        {/* 296 §3-2: 「☑ 選んで削除」のモード切替ボタンは撤去（チェックは常時表示。解除は操作バーの「✕ 選択を解除」） */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          表示{items.length} / 全{totalCount ?? items.length}件
        </span>
      </div>

      {/* ── 295 §2-1/§2-2: 一覧の見え方（列数・密度）。291/292 と同じ選択肢・同じ判断・同じ目印属性。タッチ端末は1列固定なので列数の選択は出さない ── */}
      <div data-library-view-bar style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const, fontSize: 11, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
        {(!pointerMounted || finePointer) && (
          <span data-library-cols-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="一覧の列数（自動＝画面幅で1〜4列）">
            <span style={{ marginRight: 2 }}>列</span>
            {LIST_COLUMN_CHOICES.map((c) => (
              <button
                key={String(c)}
                type="button"
                data-library-cols-choice={String(c)}
                aria-pressed={listColChoice === c}
                onClick={() => applyListCols(c)}
                style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: listColChoice === c ? 700 : 600, border: `1px solid ${listColChoice === c ? 'var(--accent)' : 'var(--border)'}`, background: listColChoice === c ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                {c === 'auto' ? '自動' : c}
              </button>
            ))}
          </span>
        )}
        <span data-library-density-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="表示密度（コンパクト＝バッジとタイトルのみ。操作は本文を開くか詳細に戻して行う）">
          <span style={{ marginRight: 2 }}>密度</span>
          {LIST_DENSITIES.map((d) => (
            <button
              key={d}
              type="button"
              data-library-density-choice={d}
              aria-pressed={listDensity === d}
              onClick={() => applyListDensity(d)}
              style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: listDensity === d ? 700 : 600, border: `1px solid ${listDensity === d ? 'var(--accent)' : 'var(--border)'}`, background: listDensity === d ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {LIST_DENSITY_LABEL[d]}
            </button>
          ))}
        </span>
      </div>

      {/* 250/296: 選択中の操作バー（📚リサーチ保存と同じく、1件以上選んだときだけ出す。note素材の選択モード中はチェック自体を出さない） */}
      {!bundleSelectMode && selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap' as const,
            padding: '10px 16px',
            marginBottom: 20,
            borderRadius: 10,
            border: '1px solid rgba(220,38,38,0.4)',
            background: 'rgba(220,38,38,0.08)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
            ☑ {selectedIds.size}件を選択中
          </span>
          {/* 296 §2-4: 「表示中N件を全選択」は撤去（全選択を置かない）。解除だけ残す */}
          <button
            type="button"
            data-ctx-select-clear
            onClick={() => setSelectedIds(new Set())}
            style={{ ...cardActionBtnStyle(), fontSize: 12, padding: '6px 12px' }}
          >
            ✕ 選択を解除
          </button>
          <button
            type="button"
            data-bulk-delete
            onClick={bulkDeleteSelected}
            disabled={bulkDeleting || selectedIds.size === 0}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              background: bulkDeleting || selectedIds.size === 0 ? 'var(--border)' : '#dc2626',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: bulkDeleting || selectedIds.size === 0 ? 'not-allowed' : 'pointer',
              marginLeft: 'auto',
            }}
          >
            {bulkDeleting ? '⏳ 削除中...' : `🗑 選択した${selectedIds.size}件を削除`}
          </button>
          {/* 295 §2-4: 同じ選択状態から横並び比較（2〜4件。5件目を選んでいる間は無効化して理由を出す・R-101） */}
          <button
            type="button"
            data-ctx-compare-open
            onClick={handleCompareSelect}
            disabled={!compareState.enabled || comparePreparing}
            title={compareState.reason ?? '選択した素材を横並びで比較します（列数・高さ・同期スクロール・各列から全画面）'}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              background: !compareState.enabled || comparePreparing ? 'var(--border)' : '#6c63ff',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: !compareState.enabled || comparePreparing ? 'not-allowed' : 'pointer',
            }}
          >
            {comparePreparing ? '⏳ 本文を取得中...' : compareState.label}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%' }}>
            削除すると元に戻せません。フォルダやカテゴリで絞り込んでから選ぶこともできます。比較は2〜{LIBRARY_COMPARE_MAX}件（列ヘッダーに生成元を表示）。
          </span>
        </div>
      )}

      {/* 192: 選択中タグのチップ＋AND/ORトグル。タグ2つ以上で AND（すべて含む）/ OR（いずれか含む）
          を切替できる。カテゴリ×タグ×検索(q)は常にANDで組み合わせ（サーバ側絞り込み・全件母数）。 */}
      {tagFilters.length > 0 && (
        <div
          style={{
            marginTop: -8,
            marginBottom: 20,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap' as const,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🏷️ タグ条件:</span>
          {tagFilters.map((t) => (
            <span
              key={t}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border-accent, var(--border))',
                background: 'var(--accent-soft, rgba(108,99,255,0.08))',
                color: 'var(--text-primary)',
                fontSize: 12,
                maxWidth: 320,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
              <button
                type="button"
                onClick={() => setTagFilters(prev => prev.filter(x => x !== t))}
                title="このタグ条件を外す"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {tagFilters.length >= 2 && (
            <span style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {(['and', 'or'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTagMode(m)}
                  title={m === 'and' ? '選んだタグをすべて含む素材だけ表示' : '選んだタグのいずれかを含む素材を表示'}
                  style={{
                    padding: '4px 12px',
                    border: 'none',
                    background: tagMode === m ? 'var(--accent, #6c63ff)' : 'transparent',
                    color: tagMode === m ? '#fff' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m === 'and' ? 'AND' : 'OR'}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTagFilters([])}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            クリア
          </button>
        </div>
      )}

      {/* ── 295 §2-6（293 §6）: 適用中の条件（検索・範囲・タグ・お気に入り・カテゴリ・マイフォルダ）。個別に外せる・すべて解除 ── */}
      <ActiveConditionChips conditions={activeConditions} onClearAll={clearAllConditions} />

      {/* 295 §2-4: 横並び比較パネル（291の共通部品。全画面は下の FullscreenReader を共用・MDは同じハンドラ） */}
      {compareEntries && (
        <LibraryCompareView
          entries={compareEntries}
          kindNote="各列の見出しに生成元（🔭 ディープリサーチ／📚 ディープリサーチ（バッチ））を表示しています。一覧の「生成元」バッジと同じ判定です。"
          onClose={() => setCompareEntries(null)}
          onFullscreen={(row) => setReaderItem(compareItemOf(row))}
          onExportMd={(row) => void handleDownloadMd(compareItemOf(row))}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
            {/* 295 §2-6（R-103）: 0件は「絞りすぎ」の案内＝適用中の条件の数を示し、上のチップで外す導線へ */}
            {allTotal === 0 ? 'まだ保存された素材はありません' : zeroResultMessage(activeConditions.length)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            ディープリサーチ実行後、「🧠 AI参照用に最適化」→「💾 保存」でこちらに追加されます。
          </div>
        </div>
      )}

      {/* 要約・詳細生成のトースト表示 */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2937',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 8,
          fontSize: 14,
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* 295 §2-1: 列数は lib/library-view の判断（Tailwind完全リテラル・タッチは1列）。gap は従来の14のまま */}
      <div
        className={listGridClass(resolvedListCols)}
        data-library-grid
        data-library-cols={String(resolvedListCols)}
        data-library-density={listDensity}
        style={{ gap: 14 }}
      >
        {items.map(item => {
          const expanded = expandedIds.has(item.id);
          const bundleChecked = isBundleSelected('context', item.id);
          return (
            <div
              key={item.id}
              // 295: E2E/計測用のカード目印（一覧の見え方・比較）
              data-ctx-card={item.id}
              // 187: 「→次へ」追従ボタンの位置計測用（NoteBundleDock が参照）
              data-bundle-key={`ctx-${item.id}`}
              // 257: プレビューはこの要素の矩形に隣接して出る（位置の基準）
              data-hover-card={item.id}
              {...hoverPreview.bind(async () =>
                markdownToReadableText(await ensureFullText(item)),
              )}
              style={{
                background: item.is_favorite
                  ? 'rgba(245,158,11,0.08)'
                  : 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
                border: bundleSelectMode && bundleChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                // お気に入りは金色の左ボーダーで一目で区別
                ...(item.is_favorite ? { borderLeft: '4px solid #f59e0b' } : {}),
                borderRadius: 14,
                padding: 18,
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 8, flexWrap: 'wrap' as const }}>
                {/* 179/180: 選択モード時のみチェックボックス表示（既存操作には触れない・共通部品） */}
                {bundleSelectMode && (
                  <BundleSelectCheckbox
                    source="context"
                    id={item.id}
                    topic={item.topic}
                    onLimit={(m) => flashToast(`❌ ${m}`)}
                  />
                )}
                {/* 250/296: 選択のチェックボックスは常時表示（note選択モード中は BundleSelectCheckbox と排他＝二重にならない）。
                    R-81: 展開領域の外側にあり、クリックは stopCardClick で上へ伝えない（チェックしても本文は開かない） */}
                {!bundleSelectMode && (
                  <input
                    type="checkbox"
                    data-ctx-delete-check={item.id}
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(item.id); else next.delete(item.id);
                      setSelectedIds(next);
                    }}
                    onClick={stopCardClick}
                    title="一括削除の対象にする"
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#dc2626', marginTop: 4 }}
                  />
                )}
                {/* 274: ここ（タイトル・生成元バッジ・日付/文字数/タグ・フォルダ）が本文の展開領域。
                    ボタン類は含めない＝押しても展開が走らない。展開後の本文も含めない（文字を選べる）。 */}
                <div
                  className="card-expand-zone"
                  data-ctx-expand-zone={item.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  title={expanded ? 'クリックで本文を閉じる' : 'クリックで本文を開く'}
                  onClick={() => toggleExpand(item)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault(); // Space での画面スクロールを止める
                    void toggleExpand(item);
                  }}
                  style={{ flex: 1, minWidth: 200 }}
                >
                  {/* 295 §2-2: 291/292 と同じ「1行目バッジ（生成元・日付・文字数の段階・タグ）→ 2行目タイトル」。
                      文字数は CharCountBadge（閾値は CHAR_COUNT_TIERS を📚🗂と共有・数値併記）。生成元の判定は lib/context-origin */}
                  <div data-ctx-badges style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {(() => {
                      const kind = contextOriginKind(item.tags);
                      const o = CONTEXT_ORIGIN_LABEL[kind];
                      return (
                        <span data-ctx-origin={kind} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 10px', borderRadius: 10 }}>
                          生成元: {o.icon} {o.label}
                        </span>
                      );
                    })()}
                    <span>📅 {fmtDate(item.created_at)}</span>
                    <CharCountBadge n={Number(item.char_count ?? item.context_text?.length ?? 0)} />
                    {item.tags && item.tags.length > 0 && (
                      <span>
                        {item.tags.map(t => (
                          <span key={t} style={{ background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 10, marginRight: 4, color: 'var(--text-secondary)' }}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div data-ctx-title style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.topic}
                  </div>
                  {/* 249: 所属マイフォルダ（複数可）。どのフォルダに入れたか一目で分かるように（295: コンパクトでは出さない） */}
                  {!compact && ((item.custom_folder_ids?.length ?? 0) > 0 || (item.purpose_category_ids?.length ?? 0) > 0) && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 6 }}>
                      <FolderBadges folderIds={item.custom_folder_ids} folders={customFolders.folders} />
                      {/* 297: 所属用途カテゴリ（🎯青緑。📂金色のマイフォルダと区別）。コンパクトでは出さない */}
                      <PurposeBadges categoryIds={item.purpose_category_ids} categories={purposes.categories} />
                    </div>
                  )}
                </div>
              </div>

              {/* 本文プレビューは非表示（A）。閲覧は「▼全文表示」/「⛶全画面」に集約。 */}

              {/* 登録済み機能のバッジ（295: コンパクトでは出さない＝バッジ行とタイトル行のみ） */}
              {!compact && (defaultMap[item.id]?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>📌 デフォルト登録中:</span>
                  {(defaultMap[item.id] ?? []).map(key => {
                    const f = FEATURE_OPTIONS.find(o => o.key === key);
                    if (!f) return null;
                    return (
                      <span key={key} style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>
                        {f.icon} {f.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* ── 共通操作バー（197: アクション列整理）──
                  常時表示は ▼全文表示 / 📋コピー / ☆お気に入り のみ。
                  使用頻度の低い ⛶全画面 / ⬇テキスト / 📥MD / 📄Word / ✏編集 / 🗑削除 は
                  「⋯ その他」メニューに格納（各操作のハンドラ・挙動は無変更）。
                  モバイル幅でも1行に収まる本数に抑える。 */}
              {/* 295 §2-2: コンパクトでは操作バーを出さない（292 と同じ判断。本文はカードのクリック展開（274）で開ける） */}
              {!compact && (
              <div
                // 274: 領域限定と併せた二重の守り。この中の操作が上へ伝わって展開が走らないようにする
                onClick={stopCardClick}
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}
              >
                <button
                  data-ctx-expand-button={item.id}
                  onClick={() => toggleExpand(item)}
                  style={cardActionBtnStyle()}
                >
                  {expanded ? '▲ 閉じる' : '▼ 全文表示'}
                </button>
                <button
                  onClick={() => handleCopy(item)}
                  style={{
                    ...cardActionBtnStyle(),
                    ...(copiedId === item.id
                      ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' }
                      : {}),
                  }}
                >
                  {copiedId === item.id ? '✅ コピー済み' : '📋 コピー'}
                </button>
                {/* 249: お気に入りと同時にフォルダ分類も決める。既にお気に入りなら
                    分類の変更・追加・解除をこのパネルから行う */}
                <button
                  data-favorite-button={item.id}
                  onClick={(e) => handleFavoriteButton(item, e.currentTarget.getBoundingClientRect())}
                  title={item.is_favorite ? 'フォルダ分類の変更・お気に入り解除' : 'お気に入りに登録してフォルダに分類する'}
                  style={
                    item.is_favorite
                      ? { ...cardActionBtnStyle(), background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', fontWeight: 700 }
                      : cardActionBtnStyle()
                  }
                >
                  {item.is_favorite ? '⭐ 分類' : '☆ お気に入り'}
                </button>
                {/* 297: 用途カテゴリの割り当て（お気に入りとは無関係・☆と同じ操作感） */}
                <button
                  type="button"
                  data-purpose-button={item.id}
                  onClick={(e) => handlePurposeButton(item, e.currentTarget.getBoundingClientRect())}
                  title="用途カテゴリを割り当て（note用・Kindle用など）"
                  style={{ ...cardActionBtnStyle(), color: '#115e59', border: '1px solid rgba(13,148,136,0.45)', background: 'rgba(13,148,136,0.08)' }}
                >
                  🎯 用途
                </button>
                <div data-ctx-more-menu style={{ position: 'relative', marginLeft: 'auto' }}>
                  <button
                    onClick={() => setMoreMenuId(moreMenuId === item.id ? null : item.id)}
                    title="その他の操作（全画面・テキスト・MD・Word・編集・削除）"
                    aria-label="その他の操作"
                    aria-haspopup="menu"
                    aria-expanded={moreMenuId === item.id}
                    // ラベルは「⋯」のみ（モバイル375px幅で操作バーが1行に収まる本数・幅に抑える）
                    style={{
                      ...cardActionBtnStyle(),
                      padding: '4px 12px',
                      fontWeight: 700,
                      ...(moreMenuId === item.id
                        ? { background: 'rgba(108,99,255,0.12)', borderColor: 'var(--accent)', color: 'var(--accent)' }
                        : {}),
                    }}
                  >
                    ⋯
                  </button>
                  {moreMenuId === item.id && (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 4px)',
                        zIndex: 30,
                        minWidth: 190,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        padding: 6,
                      }}
                    >
                      <button
                        role="menuitem"
                        onClick={async () => {
                          setMoreMenuId(null);
                          try {
                            const text = await ensureFullText(item);
                            setReaderItem({ ...item, context_text: text });
                          } catch {
                            flashToast('❌ 本文の取得に失敗しました', 4000);
                          }
                        }}
                        title={`全画面のリーダー表示で読む${showKbHints ? KEY_HINT.readerOpenSuffix : ''}`}
                        style={moreMenuItemStyle}
                      >
                        ⛶ 全画面
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { setMoreMenuId(null); handleDownloadTxt(item); }}
                        disabled={downloadingId === item.id}
                        style={{
                          ...moreMenuItemStyle,
                          ...(downloadingId === item.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                        }}
                      >
                        {downloadingId === item.id ? '⏳ 準備中...' : '⬇ テキスト'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { setMoreMenuId(null); handleDownloadMd(item); }}
                        disabled={downloadingId === item.id}
                        style={{
                          ...moreMenuItemStyle,
                          ...(downloadingId === item.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                        }}
                      >
                        {downloadingId === item.id ? '⏳ 準備中...' : '📥 MD'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { setMoreMenuId(null); handleDownloadDocx(item); }}
                        disabled={downloadingId === item.id}
                        style={{
                          ...moreMenuItemStyle,
                          ...(downloadingId === item.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                        }}
                      >
                        {downloadingId === item.id ? '⏳ 準備中...' : '📄 Word'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMoreMenuId(null);
                          if (editingId === item.id) setEditingId(null);
                          else startEdit(item);
                        }}
                        style={{
                          ...moreMenuItemStyle,
                          ...(editingId === item.id ? { color: 'var(--accent)' } : {}),
                        }}
                      >
                        {editingId === item.id ? '✏️ 編集中' : '✏️ 編集'}
                      </button>
                      {/* 削除は誤操作防止のため最下部・赤表示（確認ダイアログは handleDelete 内で維持） */}
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      <button
                        role="menuitem"
                        onClick={() => { setMoreMenuId(null); handleDelete(item.id); }}
                        style={{ ...moreMenuItemStyle, color: '#ef4444' }}
                      >
                        🗑 削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 全文表示（カード内インライン展開）。編集モード時は topic/本文の編集フォーム。 */}
              {expanded && (
                <div
                  data-ctx-expanded-body={item.id}
                  // 274: 展開後の本文はクリックしても閉じない（コピーのためのドラッグ選択を妨げない）
                  onClick={stopCardClick}
                  style={{
                    marginTop: 12,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  {editingId === item.id ? (
                    <div>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="タイトル"
                        style={{
                          width: '100%',
                          fontSize: 16,
                          fontWeight: 700,
                          padding: 8,
                          marginBottom: 8,
                          boxSizing: 'border-box',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                        }}
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="本文（Markdown）"
                        style={{
                          width: '100%',
                          minHeight: 300,
                          fontSize: 14,
                          lineHeight: 1.6,
                          padding: 10,
                          boxSizing: 'border-box',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={editSaving}
                          style={{
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: 'none',
                            background: editSaving ? '#9ca3af' : 'var(--accent)',
                            color: '#fff',
                            cursor: editSaving ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {editSaving ? '⏳ 保存中...' : '💾 保存'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={editSaving}
                          style={{
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 500,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            cursor: editSaving ? 'not-allowed' : 'pointer',
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : item.context_text === undefined ? (
                    // 単体取得中（一覧APIは本文を返さないため展開時にフェッチ）
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                      ⏳ 本文を読み込み中...
                    </div>
                  ) : (
                    // 本文(AI生成Markdown)は共通レンダラで見出し・太字・箇条書きを描画（生記号を出さない）
                    <div
                      className="markdown-body"
                      style={{
                        maxHeight: 600,
                        overflowY: 'auto',
                        color: 'var(--text-primary)',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        lineHeight: 1.75,
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(item.context_text) }}
                    />
                  )}
                </div>
              )}

              {/* ── コンテキスト固有のアクション（活用する・📌デフォルト設定）。テキスト分析には無い別枠。
                  295 §2-2: 操作要素なのでコンパクトでは出さない（機能・遷移は無変更。詳細に戻せば従来どおり） ── */}
              {!compact && (
              <div
                onClick={stopCardClick}
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center', marginTop: 8 }}
              >
                {/* 活用する：下部アクションのアコーディオン開閉（既定閉・誤発火防止） */}
                <button
                  onClick={() => setActionsOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  title="文章作成・SNS投稿・LP作成・資料作成・要約・詳細を表示"
                  aria-expanded={!!actionsOpen[item.id]}
                  style={{
                    ...cardActionBtnStyle(),
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--border-accent)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                  }}
                >
                  {actionsOpen[item.id] ? '▲ 活用する' : '▼ 活用する'}
                </button>
                <FeatureDefaultContextSelector
                  contextSaveId={item.id}
                  initialRegistered={defaultMap[item.id] ?? []}
                  onChange={(keys) => setDefaultMap(prev => ({ ...prev, [item.id]: keys }))}
                />
              </div>
              )}

              {/* ── 下部アクション（アコーディオン格納・既定折りたたみ）──
                  「活用する」展開時のみ表示。各ボタンの機能・遷移・生成は無変更。 */}
              {!compact && actionsOpen[item.id] && (
                <div
                  onClick={stopCardClick}
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap' as const,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed var(--border)',
                  }}
                >
                  <button
                    onClick={() => goToTool(item, 'write')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✍️ 文章作成へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'sns-post')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📱 SNS投稿へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'lp')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📄 LP作成へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'materials')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📊 資料作成へ
                  </button>
                  {/* 要約・詳細生成ボタン（AI生成 → text_analysis_saves へ保存） */}
                  <button
                    onClick={() => handleSummarize(item, 'summary')}
                    disabled={processingId !== null}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #a78bfa',
                      background: processingId?.id === item.id && processingId.mode === 'summary'
                        ? '#6b7280'
                        : (processedId?.id === item.id && processedId.mode === 'summary' ? '#10b981' : '#8b5cf6'),
                      color: '#fff',
                      cursor: processingId ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {processingId?.id === item.id && processingId.mode === 'summary'
                      ? '⏳ 生成中...'
                      : processedId?.id === item.id && processedId.mode === 'summary'
                      ? '✅ 保存済'
                      : '📝 要約'}
                  </button>
                  <button
                    onClick={() => handleSummarize(item, 'detail')}
                    disabled={processingId !== null}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #60a5fa',
                      background: processingId?.id === item.id && processingId.mode === 'detail'
                        ? '#6b7280'
                        : (processedId?.id === item.id && processedId.mode === 'detail' ? '#10b981' : '#3b82f6'),
                      color: '#fff',
                      cursor: processingId ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {processingId?.id === item.id && processingId.mode === 'detail'
                      ? '⏳ 生成中...'
                      : processedId?.id === item.id && processedId.mode === 'detail'
                      ? '✅ 保存済'
                      : '📖 詳細'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* もっと見る（165ギャラリーと同方式のoffsetページング。全件に到達できる） */}
      {!loading && totalCount !== null && items.length < totalCount && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            type="button"
            onClick={() => fetchPage(items.length, true)}
            disabled={loadingMore}
            style={{
              padding: '10px 28px',
              borderRadius: 10,
              border: '1px solid var(--border-accent)',
              background: 'var(--accent-soft)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loadingMore ? 'not-allowed' : 'pointer',
              opacity: loadingMore ? 0.6 : 1,
            }}
          >
            {loadingMore ? '⏳ 読み込み中...' : `▼ もっと見る（${items.length} / ${totalCount}）`}
          </button>
        </div>
      )}

      {/* 選択中バー＋生成モーダルは NoteBundleDock（各ページ直下に1回マウント）に集約（180） */}

      {/* 全画面リーダー（コンテキスト本文を読み物表示）。
          191: カードと同じアクション（同じハンドラを共有・二重実装しない）をヘッダーに追従表示。
          お気に入り/編集/削除のような一覧の状態を変える操作は誤操作防止のため入れない。
          204: j/k で表示中の一覧の次/前の資料へ移動（ensureFullText＝本文は遅延取得を共有） */}
      <FullscreenReader
        open={readerItem !== null}
        title={readerItem?.topic ?? '無題'}
        content={readerItem?.context_text ?? ''}
        onClose={() => setReaderItem(null)}
        onPrev={(() => {
          if (!readerItem) return undefined;
          const idx = items.findIndex((it) => it.id === readerItem.id);
          if (idx <= 0) return undefined;
          return () => {
            const target = items[idx - 1];
            void ensureFullText(target)
              .then((text) => setReaderItem({ ...target, context_text: text }))
              .catch(() => flashToast('❌ 本文の取得に失敗しました', 4000));
          };
        })()}
        onNext={(() => {
          if (!readerItem) return undefined;
          const idx = items.findIndex((it) => it.id === readerItem.id);
          if (idx < 0 || idx >= items.length - 1) return undefined;
          return () => {
            const target = items[idx + 1];
            void ensureFullText(target)
              .then((text) => setReaderItem({ ...target, context_text: text }))
              .catch(() => flashToast('❌ 本文の取得に失敗しました', 4000));
          };
        })()}
        actions={
          readerItem && (
            <>
              <button
                type="button"
                onClick={() => handleCopy(readerItem)}
                style={{
                  ...cardActionBtnStyle(),
                  ...(copiedId === readerItem.id
                    ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' }
                    : {}),
                }}
              >
                {copiedId === readerItem.id ? '✅ コピー済み' : '📋 コピー'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTxt(readerItem)}
                disabled={downloadingId === readerItem.id}
                style={{
                  ...cardActionBtnStyle(),
                  ...(downloadingId === readerItem.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                }}
              >
                {downloadingId === readerItem.id ? '⏳ 準備中...' : '⬇ テキスト'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadMd(readerItem)}
                disabled={downloadingId === readerItem.id}
                style={{
                  ...cardActionBtnStyle(),
                  ...(downloadingId === readerItem.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                }}
              >
                {downloadingId === readerItem.id ? '⏳ 準備中...' : '📥 MD'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadDocx(readerItem)}
                disabled={downloadingId === readerItem.id}
                style={{
                  ...cardActionBtnStyle(),
                  ...(downloadingId === readerItem.id ? { cursor: 'not-allowed', opacity: 0.6 } : {}),
                }}
              >
                {downloadingId === readerItem.id ? '⏳ 準備中...' : '📄 Word'}
              </button>
            </>
          )
        }
      />

      {/* 256: 本文プレビューのポップアップ（1画面に1つだけ） */}
      {hoverPreview.layer}

      {/* 249: 分類パネル（☆ボタンから開く。createPortalでbody直下に出す＝R-19） */}
      {folderPicker &&
        (() => {
          const target = items.find(it => it.id === folderPicker.id);
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

      {/* 297: 用途の割り当てパネル（🎯ボタンから開く） */}
      {purposePicker &&
        (() => {
          const target = items.find(it => it.id === purposePicker.id);
          if (!target) return null;
          return (
            <PurposePickerPopover
              anchorRect={purposePicker.rect}
              categories={purposes.categories}
              selectedIds={target.purpose_category_ids ?? []}
              onChange={(ids) => void handleAssignPurposes(target.id, ids)}
              onCreate={purposes.createCategory}
              onClose={closePurposePicker}
            />
          );
        })()}
    </div>
  );
}
