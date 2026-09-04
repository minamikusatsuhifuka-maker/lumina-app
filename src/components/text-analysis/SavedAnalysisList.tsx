'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { MAX_KINDLE_SOURCES, makeAnalysisSourceKey } from '@/lib/kindle-limits';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { confirmBulkDelete } from '@/lib/bulk-delete-confirm';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { markdownToReadableText } from '@/lib/markdownToText';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';
// 292: 291（📚リサーチ保存）で整えた部品をそのまま持ち込む。判断（列数・密度・文字数の段階・比較件数）は
// lib/library-view.ts を共有し、テキスト分析用の別の閾値・別の判定は作らない（§2-3）。
// 283/286 の成果物グルーピングは持ち込まない（§2-5）＝比較の単位は保存された1件そのもの。
import LibraryCompareView from '@/components/library/LibraryCompareView';
import { CharCountBadge } from '@/components/LibraryItemRow';
import {
  LIBRARY_COMPARE_MAX,
  LIST_COLUMN_CHOICES,
  LIST_DENSITIES,
  LIST_DENSITY_DEFAULT,
  LIST_DENSITY_LABEL,
  TA_LIST_COLUMN_CHOICE_DEFAULT,
  TA_LIST_COLUMN_KEY,
  TA_LIST_DENSITY_KEY,
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
// 293: 検索範囲・種別フィルタ・適用中の条件（判断は lib/library-filters.ts・📚と共有。絞り込み自体はサーバー側）
import {
  type ActiveCondition,
  SEARCH_PLACEHOLDER,
  SEARCH_SCOPES,
  SEARCH_SCOPE_LABEL,
  type SearchScope,
  TA_SEARCH_SCOPE_KEY,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
  loadSearchScope,
  saveSearchScope,
  zeroResultMessage,
} from '@/lib/library-filters';
import { ActiveConditionChips } from '@/components/ActiveConditionChips';
import { BundleSelectToggleButton, BundleSelectCheckbox } from '@/components/note-bundle/BundleSelectControls';
import { useNoteBundleSelection } from '@/components/note-bundle/useNoteBundleSelection';
import JSZip from 'jszip';
import {
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';
import { CATEGORY_KEYWORDS, stripSpaces } from '@/lib/category-keywords';
import { KEY_HINT, useShortcutHints } from '@/lib/shortcuts';
import { CATEGORY_GROUPS, OTHER_CATEGORY } from '@/lib/category-vocabulary';
// 249: マイフォルダ（院長が名前を付けるお気に入りの分類・自動カテゴリとは別軸）
import CustomFolderBar from '@/components/custom-folders/CustomFolderBar';
// 253: フォルダを開いたら両画面のアイテムをまとめて出す（共有したなら中身は全部見える）
import FolderCrossView from '@/components/custom-folders/FolderCrossView';
// 256: カードにカーソルを当てたときの本文プレビュー（markdownToReadableText は上で import 済み）
import { useHoverPreview } from '@/components/HoverPreview';
import FolderBadges from '@/components/custom-folders/FolderBadges';
import FolderPickerPopover from '@/components/custom-folders/FolderPickerPopover';
// 297: 🎯用途カテゴリ（マイフォルダとは別の枠・別テーブル・別色）
import PurposeCategoryBar from '@/components/purpose-categories/PurposeCategoryBar';
import PurposePickerPopover from '@/components/purpose-categories/PurposePickerPopover';
import PurposeBadges from '@/components/purpose-categories/PurposeBadges';
import PurposeBulkPanel from '@/components/purpose-categories/PurposeBulkPanel';
import { type PurposeBulkMode, purposeBulkState } from '@/lib/purpose-categories-shared';
import { usePurposeCategories, type PurposeFilter } from '@/components/purpose-categories/usePurposeCategories';
import {
  useCustomFolders,
  type FolderFilter,
} from '@/components/custom-folders/useCustomFolders';

// 展開ビューの本文表示枠の高さ切替（S/M/L/全）。
// 値は生成結果カード(TextAnalysisPanel の ResultPanel)の HEIGHT_PRESETS と統一。
type SavedHeightMode = 'S' | 'M' | 'L' | 'full';
const SAVED_HEIGHT_VALUES: Record<SavedHeightMode, number> = {
  S: 350,
  M: 550,
  L: 800,
  full: 0, // 0 = 高さ制限なし（全文表示）
};
const SAVED_HEIGHT_KEY = 'ta_saved_height';

export interface AnalysisRecord {
  id: number;
  user_id: string;
  file_name: string | null;
  auto_title: string | null;
  analysis_type: string;
  analysis_label: string;
  content: string;
  tags: string[] | null;
  folder: string | null;
  favorite: boolean;
  locked: boolean;
  char_count: number;
  created_at: string;
  updated_at: string;
  // 生成AIモデル（保存時に記録されていれば。旧データは undefined）
  model?: AIModel;
  // 元の入力テキストの有無・文字数（一覧APIが返す。input_text本体は展開時に単体取得）
  has_input?: boolean;
  input_char_count?: number;
  // 249: 所属するマイフォルダのID（複数可・自動カテゴリの folder とは別軸）
  custom_folder_ids?: number[];
  // 297: 所属用途カテゴリID（マイフォルダとは別体系）
  purpose_category_ids?: number[];
}

// 203: 任意ワード抽出のガード定数
const KW_HITS_WARN_THRESHOLD = 100; // プレビュー件数がこれを超えたら「ワードが一般的すぎる」警告
const KW_RECENT_STORAGE_KEY = 'ta_kw_recent_words'; // よく使うワード（localStorage・最大8件）
const KW_RECENT_MAX = 8;

// 201: キーワード抽出のヒット1件（/api/category-keyword-scan の応答と同形）
interface KeywordHit {
  table: 'ta' | 'ctx';
  id: number;
  title: string;
  current: string; // 現在のカテゴリ（未分類は ''）
  category: string; // 判定された新カテゴリ
  keywords: string[]; // ヒットしたキーワード（誤検出の判断材料）
}

const FOLDER_PALETTE = [
  '#3b82f6',
  '#1D9E75',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#10b981',
];

function getFolderColor(folder: string, allFolders: string[]): string {
  const idx = allFolders.indexOf(folder);
  return idx >= 0
    ? FOLDER_PALETTE[idx % FOLDER_PALETTE.length]
    : '#6b7280';
}

interface Props {
  onSelectForCross?: (
    articles: { id: number; title: string; content: string; category?: string }[],
  ) => void;
  highlightId?: number | null;
  onHighlightClear?: () => void;
  // 194: 一覧は本コンポーネントが自律フェッチする（親の初回フェッチは廃止）。
  // 全件数の変化を親へ通知（タブの件数バッジ用）
  onAllTotalChange?: (n: number) => void;
  // 親からの再読込トリガ（保存直後など。値が変わるたびに1ページ目から取り直す）
  reloadKey?: number;
}

// 194: 1ページの取得件数（175 context_saves 側の「もっと見る」方式と同値）
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

export default function SavedAnalysisList({
  onSelectForCross,
  highlightId,
  onHighlightClear,
  onAllTotalChange,
  reloadKey,
}: Props) {
  const { showToast } = useToast();
  // 204 第1層: ツールチップ/placeholderへのキー併記（設定OFF・モバイルでは非表示）
  const showKbHints = useShortcutHints();
  // 179/180: note記事まとめの横断選択（🧠AI参照素材側と共有ストア）。選択モード中は
  // カードのチェックボックスをnote素材選択用に切り替える（一括操作用との二重表示を避ける）。
  const { selectMode: bundleSelectMode, isSelected: isBundleSelected } = useNoteBundleSelection();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  // 249: マイフォルダ（自動カテゴリとは別軸の手動分類）。絞り込みは activeFolder と AND
  const customFolders = useCustomFolders('text_analysis', (msg) => showToast(msg, 'error'));
  // 256: 本文はキャッシュ付きの fetchContent を通す＝ホバーのたびにAPIを叩かない
  const hoverPreview = useHoverPreview();
  const [activeCustomFolder, setActiveCustomFolder] = useState<FolderFilter>(null);
  // 分類パネルを開いている記事（☆ボタンの矩形に合わせてポップオーバーを出す）
  const [folderPicker, setFolderPicker] = useState<{ id: number; rect: DOMRect } | null>(null);
  // 297: 用途カテゴリ（3画面で共有の1体系）。絞り込みはサーバー側 pcat= で他条件と AND
  const purposes = usePurposeCategories('text_analysis', (msg) => showToast(msg, 'error'));
  const [activePurpose, setActivePurpose] = useState<PurposeFilter>(null);
  const [purposePicker, setPurposePicker] = useState<{ id: number; rect: DOMRect } | null>(null);
  // 298: 選択した記事にまとめて付け外し
  const [purposeBulk, setPurposeBulk] = useState<{ rect: DOMRect } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // カテゴリ概覧の開閉（デフォルト閉。開閉状態は localStorage で記憶）
  const [showCategoryGrid, setShowCategoryGrid] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ta_category_open');
      if (saved !== null) setShowCategoryGrid(saved === '1');
      // saved が null（初回）なら false=折りたたみのまま
    } catch {
      /* localStorage 不可環境では既定値（閉）のまま */
    }
  }, []);
  const toggleCategoryGrid = () => {
    setShowCategoryGrid((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ta_category_open', next ? '1' : '0');
      } catch {
        /* 保存失敗は無視（開閉自体は機能する） */
      }
      return next;
    });
  };
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // 展開ビュー本文枠の高さ（保存一覧全体で共通・localStorage記憶）。デフォルトはMで流用元と統一
  const [heightMode, setHeightMode] = useState<SavedHeightMode>('M');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_HEIGHT_KEY) as SavedHeightMode | null;
      if (saved && saved in SAVED_HEIGHT_VALUES) setHeightMode(saved);
    } catch {
      /* skip */
    }
  }, []);
  const changeHeight = (m: SavedHeightMode) => {
    setHeightMode(m);
    try {
      localStorage.setItem(SAVED_HEIGHT_KEY, m);
    } catch {
      /* skip */
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  // 293 §3-1: 検索範囲（すべて＝タイトル・ファイル名・本文／タイトルのみ）。既定は従来どおり「すべて」・保持
  const [searchRange, setSearchRange] = useState<SearchScope>('all');
  useEffect(() => {
    setSearchRange(loadSearchScope(TA_SEARCH_SCOPE_KEY));
  }, []);
  const applySearchRange = (s: SearchScope) => {
    setSearchRange(s);
    saveSearchScope(s, TA_SEARCH_SCOPE_KEY);
  };
  // 293 §4-2: 種別（analysis_type）で絞る。null=すべて。件数はサーバー集計（全件母数・folders と同じ考え方）
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [serverTypes, setServerTypes] = useState<{ analysis_type: string; label: string; count: number }[]>([]);
  // 「入力付き」仮想フィルタ（実フォルダは作らない＝auto-categorize対策）
  const [inputOnly, setInputOnly] = useState(false);
  // 「お気に入り」絞り込み（inputOnly と AND）
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // 全画面リーダーで表示中のタイトル・本文（null=非表示。194: 本文は開く時にサーバ取得）
  // 191: アクションボタン（コピー/DL系）に元レコードが要るため record も保持する
  const [readerRecord, setReaderRecord] = useState<{ record: AnalysisRecord; title: string; content: string } | null>(null);
  // 展開時に単体取得した元入力のキャッシュ（再展開では再取得しない）
  const [loadedInputTexts, setLoadedInputTexts] = useState<Record<number, string>>({});
  const [inputTextLoading, setInputTextLoading] = useState<Record<number, boolean>>({});
  // 「📥 元の入力テキスト」の折りたたみ状態（デフォルト閉）とコピー中ID
  const [inputTextOpen, setInputTextOpen] = useState<Record<number, boolean>>({});
  const [copyingInputId, setCopyingInputId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // 保存済み分析の編集（タイトル+本文。同時編集は1件のみ）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // MDダウンロード中のID（本文取得中の同時押し防止）
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // 選択項目の一括MDダウンロード（ZIP）中フラグ（二度押し防止）
  const [bulkDownloading, setBulkDownloading] = useState(false);

  // ── 292 §2-3: 一覧の列数・密度（291と同じ判断・保存先キーだけ別）。既定は 1列／詳細＝従来どおり ──
  const [listColChoice, setListColChoice] = useState<ListColumnChoice>(TA_LIST_COLUMN_CHOICE_DEFAULT);
  const [listDensity, setListDensity] = useState<ListDensity>(LIST_DENSITY_DEFAULT);
  // 258: 端末判定は lib/pointer-device.ts に一本化（タッチ端末は1列固定・列数の選択を出さない）
  const { fine: finePointer, mounted: pointerMounted } = useFinePointer();
  useEffect(() => {
    // localStorage はクライアントでしか読めないので、描画後に反映する（SSRと差分を作らない）
    setListColChoice(loadListColumnChoice(TA_LIST_COLUMN_KEY, TA_LIST_COLUMN_CHOICE_DEFAULT));
    setListDensity(loadListDensity(TA_LIST_DENSITY_KEY));
  }, []);
  const applyListCols = (c: ListColumnChoice) => {
    setListColChoice(c);
    saveListColumnChoice(c, TA_LIST_COLUMN_KEY);
  };
  const applyListDensity = (d: ListDensity) => {
    setListDensity(d);
    saveListDensity(d, TA_LIST_DENSITY_KEY);
  };
  const resolvedListCols = resolveListColumns(pointerMounted ? finePointer : true, listColChoice);
  const listGridAttrs = { 'data-library-grid': '', 'data-library-cols': String(resolvedListCols), 'data-library-density': listDensity } as const;

  // ── 292 §2: 選択して比較。列＝保存された1件（グルーピング無し）。本文は ?ids= で一括取得してから開く ──
  type CompareRow = { id: string; title: string; content: string; char_count: number; created_at: string | null };
  const [compareEntries, setCompareEntries] = useState<LibraryCompareEntry<CompareRow>[] | null>(null);
  const [comparePreparing, setComparePreparing] = useState(false);
  const compareState = libraryCompareState(selectedIds.size);
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [categorizationResult, setCategorizationResult] =
    useState<AutoCategorizeResult | null>(null);

  // ── 194: 一覧の自律フェッチ（175方式: 本文非返却・サーバ側フィルタ・offsetページング） ──
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // totalCount=フィルタ条件での総件数 / allTotal=全件母数 / serverFolders=全件のカテゴリ集計
  const [totalCount, setTotalCount] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [serverFolders, setServerFolders] = useState<{ folder: string; count: number }[]>([]);
  // 検索はデバウンス（1文字ごとに全件クエリを投げない）
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchPage = async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setListLoading(true);
    try {
      const p = new URLSearchParams();
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(offset));
      if (debouncedSearch) p.set('q', debouncedSearch);
      if (debouncedSearch && searchRange === 'title') p.set('qScope', 'title'); // 293: 本文を対象から外す
      if (typeFilter) p.set('analysisType', typeFilter); // 293: 種別
      if (activeFolder !== null) p.set('folder', activeFolder);
      if (favoriteOnly) p.set('favorite', '1');
      if (inputOnly) p.set('hasInput', '1');
      // 249: マイフォルダでの絞り込み（id指定 / お気に入りの未分類）
      if (activeCustomFolder !== null) p.set('cfolder', String(activeCustomFolder));
      if (activePurpose !== null) p.set('pcat', String(activePurpose)); // 297: 用途カテゴリ
      const res = await fetch(`/api/text-analysis/saves?${p.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '一覧の取得に失敗しました');
      // 一覧APIは本文を返さない。AnalysisRecord.content は空で埋め、本文は fetchContent で遅延取得
      const items: AnalysisRecord[] = (Array.isArray(data.items) ? data.items : []).map(
        (it: AnalysisRecord) => ({ ...it, content: '' }),
      );
      setRecords((prev) => (append ? [...prev, ...items] : items));
      setTotalCount(Number(data.total_count) || 0);
      const at = Number(data.all_total) || 0;
      setAllTotal(at);
      onAllTotalChange?.(at);
      setServerFolders(Array.isArray(data.folders) ? data.folders : []);
      setServerTypes(Array.isArray(data.types) ? data.types : []);
    } catch {
      if (!append) {
        setRecords([]);
        setTotalCount(0);
      }
      showToast('一覧の取得に失敗しました', 'error');
    } finally {
      setListLoading(false);
      setLoadingMore(false);
    }
  };

  // フィルタ変更・親からの再読込トリガで1ページ目から取り直す。
  // 253: マイフォルダを開いている間は横断ビューが自分で取得するので、こちらは走らせない
  useEffect(() => {
    if (typeof activeCustomFolder === 'number') return;
    fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, searchRange, typeFilter, activeFolder, favoriteOnly, inputOnly, activeCustomFolder, activePurpose, reloadKey]);

  // ── 194: 本文（content）の遅延取得＋キャッシュ（fetchInputText と同型）。
  // 失敗時は null を返しキャッシュしない（再試行可能。✏編集の空content上書きガードにも使う） ──
  const [loadedContents, setLoadedContents] = useState<Record<number, string>>({});
  const [contentLoading, setContentLoading] = useState<Record<number, boolean>>({});
  const fetchContent = async (id: number): Promise<string | null> => {
    if (loadedContents[id] !== undefined) return loadedContents[id];
    setContentLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (typeof data?.content !== 'string') return null;
      setLoadedContents((prev) => ({ ...prev, [id]: data.content }));
      return data.content;
    } catch {
      return null;
    } finally {
      setContentLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 複数IDをメタ＋本文込みで1リクエスト一括取得（ZIP・横断分析handoff用。?ids=）。
  // 絞り込み変更後などロード済み一覧に無い選択IDでも取りこぼさないよう、返却行だけで完結させる
  interface BulkItem {
    id: number;
    auto_title: string | null;
    file_name: string | null;
    analysis_type: string;
    analysis_label: string;
    folder: string | null;
    content: string;
  }
  const fetchItemsByIds = async (ids: number[]): Promise<BulkItem[] | null> => {
    try {
      const res = await fetch(`/api/text-analysis/saves?ids=${ids.join(',')}`);
      if (!res.ok) return null;
      const data = await res.json();
      const items: BulkItem[] = Array.isArray(data?.items) ? data.items : [];
      // 本文キャッシュにも反映（以後の単体操作で再取得しない）
      const patch: Record<number, string> = {};
      for (const it of items) patch[it.id] = typeof it.content === 'string' ? it.content : '';
      setLoadedContents((prev) => ({ ...prev, ...patch }));
      return items;
    } catch {
      return null;
    }
  };

  // AIで保存済み全件を自動カテゴライズする
  const handleAutoCategorize = async () => {
    if (allTotal === 0) {
      showToast('保存済みテキストがありません', 'error');
      return;
    }
    const ok = window.confirm(
      `${allTotal}件のテキストをAIが自動カテゴライズします。\n既存のカテゴリは上書きされます。よろしいですか？`,
    );
    if (!ok) return;

    setIsAutoCategorizing(true);
    setCategorizationResult(null);
    try {
      const res = await fetch('/api/text-analysis/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'categorize' }),
      });
      const data = (await res.json()) as AutoCategorizeResult & { error?: string };
      if (!res.ok) {
        showToast(data.error ?? '自動カテゴライズに失敗しました', 'error');
        return;
      }
      setCategorizationResult(data);
      showToast(
        `${data.updatedCount ?? 0}件を${data.categories?.length ?? 0}カテゴリに分類しました`,
        'success',
      );
      // 保存一覧をリロード（v2: 1ページ目から取り直し。カテゴリ集計も同時に更新される）
      await fetchPage(0, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '通信エラー';
      showToast(message, 'error');
    } finally {
      setIsAutoCategorizing(false);
    }
  };

  // 201: 新カテゴリ抽出（キーワード方式・AI不使用）。
  // ILIKEで全件（text_analysis_saves＋context_saves）を即時検索してプレビュー表示し、
  // 院長が確認（個別除外可）してから適用する人間承認型（169・184と同じ作法）。
  // 旧AI方式（20件ずつ段階実行・進捗バー・中止）は廃止＝一瞬で終わるため不要。
  const [kwScan, setKwScan] = useState<{
    loading: boolean;
    applying: boolean;
    hits: KeywordHit[];
    excluded: Set<string>; // `${table}:${id}` のうち院長がチェックを外したもの
    counts: Record<string, number>;
    message: string | null;
  } | null>(null);
  const [kwIncludeBody, setKwIncludeBody] = useState(false);

  const handleKeywordPreview = async () => {
    if (kwScan?.loading || kwScan?.applying) return;
    setKwScan({
      loading: true,
      applying: false,
      hits: [],
      excluded: new Set(),
      counts: {},
      message: null,
    });
    try {
      const res = await fetch('/api/category-keyword-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', includeBody: kwIncludeBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKwScan(null);
        showToast(data.error ?? 'キーワード抽出に失敗しました', 'error');
        return;
      }
      const hits: KeywordHit[] = Array.isArray(data.hits) ? data.hits : [];
      setKwScan({
        loading: false,
        applying: false,
        hits,
        excluded: new Set(),
        counts: data.counts ?? {},
        message:
          hits.length === 0
            ? '該当する保存はありませんでした（この時点では何も変更していません）'
            : null,
      });
    } catch (err) {
      setKwScan(null);
      showToast(err instanceof Error ? err.message : '通信エラー', 'error');
    }
  };

  const handleKeywordApply = async () => {
    if (!kwScan || kwScan.applying) return;
    const targets = kwScan.hits.filter((h) => !kwScan.excluded.has(`${h.table}:${h.id}`));
    if (targets.length === 0) {
      showToast('適用対象がありません（すべて除外されています）', 'error');
      return;
    }
    setKwScan((s) => (s ? { ...s, applying: true } : s));
    try {
      const res = await fetch('/api/category-keyword-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'apply',
          items: targets.map((t) => ({ table: t.table, id: t.id, category: t.category })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKwScan((s) => (s ? { ...s, applying: false } : s));
        showToast(data.error ?? '適用に失敗しました', 'error');
        return;
      }
      setKwScan({
        loading: false,
        applying: false,
        hits: [],
        excluded: new Set(),
        counts: {},
        message: `✅ ${Number(data.updated) || 0}件のカテゴリを更新しました（旧カテゴリは退避済み・戻せます）`,
      });
      await fetchPage(0, false);
    } catch (err) {
      setKwScan((s) => (s ? { ...s, applying: false } : s));
      showToast(err instanceof Error ? err.message : '通信エラー', 'error');
    }
  };

  // 203: 任意ワード抽出（辞書と同じ判定規則＝英数字は単語境界・スペース除去照合。
  // プレビュー→個別除外→適用のフロー・旧値退避は201のものをそのまま流用）。
  // 複数ワードはスペース・カンマ・読点区切りのOR検索
  const [kwWords, setKwWords] = useState('');
  const [kwTargetCategory, setKwTargetCategory] = useState('');
  const [kwRecent, setKwRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KW_RECENT_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setKwRecent(arr.filter((w) => typeof w === 'string'));
      }
    } catch {
      // 破損時は無視（よく使うワードは補助機能）
    }
  }, []);

  const handleWordPreview = async () => {
    if (kwScan?.loading || kwScan?.applying) return;
    const words = [
      ...new Set(kwWords.split(/[,、\s　]+/).map((w) => w.trim()).filter(Boolean)),
    ].slice(0, 8);
    if (words.length === 0) {
      showToast('検索ワードを入力してください', 'error');
      return;
    }
    // ガード①: 1文字は拒否（誤検出が多すぎる）
    if (words.some((w) => stripSpaces(w).length < 2)) {
      showToast('1文字のワードは誤検出が多すぎるため検索できません（2文字以上にしてください）', 'error');
      return;
    }
    if (!kwTargetCategory) {
      showToast('反映先カテゴリを選択してください', 'error');
      return;
    }
    // ガード②: 2文字は警告して続行可能
    const shortWords = words.filter((w) => stripSpaces(w).length === 2);
    if (shortWords.length > 0) {
      const ok = window.confirm(
        `「${shortWords.join('」「')}」は2文字のため誤検出が増える可能性があります。\nプレビューで内容を確認してから適用してください。続行しますか？`,
      );
      if (!ok) return;
    }
    setKwScan({
      loading: true,
      applying: false,
      hits: [],
      excluded: new Set(),
      counts: {},
      message: null,
    });
    try {
      const res = await fetch('/api/category-keyword-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preview',
          includeBody: kwIncludeBody,
          words,
          category: kwTargetCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKwScan(null);
        showToast(data.error ?? 'ワード抽出に失敗しました', 'error');
        return;
      }
      const hits: KeywordHit[] = Array.isArray(data.hits) ? data.hits : [];
      // ④よく使うワード: 検索成功時にlocalStorageへ保存（先頭追加・重複除去・最大8件）
      setKwRecent((prev) => {
        const next = [...new Set([...words, ...prev])].slice(0, KW_RECENT_MAX);
        try {
          localStorage.setItem(KW_RECENT_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // 保存失敗は無視（補助機能）
        }
        return next;
      });
      setKwScan({
        loading: false,
        applying: false,
        hits,
        excluded: new Set(),
        counts: data.counts ?? {},
        message:
          hits.length === 0
            ? '該当する保存はありませんでした（この時点では何も変更していません）'
            : null,
      });
    } catch (err) {
      setKwScan(null);
      showToast(err instanceof Error ? err.message : '通信エラー', 'error');
    }
  };

  const handleCopy = async (record: AnalysisRecord) => {
    // 194: 本文は遅延取得（一覧APIは本文を返さない）
    const text = await fetchContent(record.id);
    if (text === null) {
      showToast('本文の取得に失敗しました', 'error');
      return;
    }
    // コピー内容にも LaTeX 正規化を適用（$\rightarrow$ 等を残さない）
    const success = await copyRichMarkdown(text);
    if (success) {
      setCopiedId(record.id);
      showToast('コピーしました', 'success');
      setTimeout(() => setCopiedId((curr) => (curr === record.id ? null : curr)), 2000);
    } else {
      showToast('コピーできませんでした。手動で選択してコピーしてください。', 'error');
    }
  };

  // 個別レコードを .md ファイルとしてダウンロード（216: 一覧カードの表示タイトルを
  // そのまま使用。AI再生成はしない＝表示と同じファイル名になる。モデル表記付き）
  const handleDownloadMd = async (record: AnalysisRecord) => {
    if (downloadingId !== null) return; // 同時押し防止
    setDownloadingId(record.id);
    try {
      // 194: 本文は遅延取得（一覧APIは本文を返さない）
      const content = await fetchContent(record.id);
      if (content === null) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      const label =
        record.analysis_label || record.analysis_type || '分析結果';
      const title = record.auto_title || record.file_name || label;
      const safeTitle = sanitizeFilename(title);
      // モデル情報があれば生成AI行を追加（旧データは undefined → 出力なし）
      const modelLine = record.model
        ? `> 生成AI: ${getModelIcon(record.model)} ${getModelLabel(record.model)}\n\n---\n\n`
        : '';
      const mdContent = `# ${title}\n\n${modelLine}${sanitizeLatex(content)}`;

      triggerDownload(`${safeTitle}_${yyyymmdd()}.md`, mdContent, 'text/markdown;charset=utf-8');
      showToast('MDファイルをダウンロードしました', 'success');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // 個別レコードを .txt ファイルとしてダウンロード。
  // 「タイトル + [生成AI: ...] 行 + 本文」、拡張子 .txt、text/plain、ファイル名 タイトル_日付.txt。
  // 216: タイトルは一覧カードの表示タイトルをそのまま使用（AI再生成しない）。
  // MD と同じく downloadingId で同時押しを抑止する。
  const handleDownloadTxt = async (record: AnalysisRecord) => {
    if (downloadingId !== null) return; // 同時押し防止（MDと共用）
    setDownloadingId(record.id);
    try {
      // 194: 本文は遅延取得（一覧APIは本文を返さない）
      const content = await fetchContent(record.id);
      if (content === null) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      const label =
        record.analysis_label || record.analysis_type || '分析結果';
      const title = record.auto_title || record.file_name || label;
      const safeTitle = sanitizeFilename(title);
      // モデル情報があれば生成AI行を追加（txt は角括弧表記。旧データは undefined → 出力なし）
      const modelLine = record.model
        ? `[生成AI: ${getModelIcon(record.model)} ${getModelLabel(record.model)}]\n\n---\n\n`
        : '';
      // 書き出し本文にも LaTeX 正規化を適用（$\rightarrow$ 等を残さない）
      const txtContent = `${title}\n\n${modelLine}${sanitizeLatex(content)}`;

      // .txt は Markdown 記号を除去した読みやすいプレーンテキストへ変換して書き出す
      triggerDownload(
        `${safeTitle}_${yyyymmdd()}.txt`,
        markdownToReadableText(txtContent),
        'text/plain;charset=utf-8',
      );
      showToast('テキストファイルをダウンロードしました', 'success');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // 個別レコードを Word(.docx) としてダウンロード。
  // タイトル（216: 表示タイトル使用）・sanitizeLatex・ファイル名規則は txt/MD と同一。
  // markdown→docx 変換は共通関数（markdownToDocx.ts）に集約し、docx はバンドルが
  // 大きいため dynamic import。
  const handleDownloadDocx = async (record: AnalysisRecord) => {
    if (downloadingId !== null) return; // 同時押し防止（txt/MDと共用）
    setDownloadingId(record.id);
    try {
      // 194: 本文は遅延取得（一覧APIは本文を返さない）
      const content = await fetchContent(record.id);
      if (content === null) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      const label =
        record.analysis_label || record.analysis_type || '分析結果';
      const title = record.auto_title || record.file_name || label;
      const safeTitle = sanitizeFilename(title);
      // モデル情報があればメタ行に追加（旧データは undefined → 出力なし）
      const metaLines = record.model
        ? [`生成AI: ${getModelIcon(record.model)} ${getModelLabel(record.model)}`]
        : [];
      const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
      await downloadMarkdownAsDocx({
        title,
        metaLines,
        markdown: sanitizeLatex(content),
        fileName: `${safeTitle}_${yyyymmdd()}.docx`,
      });
      showToast('Wordファイルをダウンロードしました', 'success');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // 選択中の各レコードを個別の .md にして JSZip で1つのZIPにまとめてダウンロード。
  // MD整形は単体DL（handleDownloadMd）と同じ「# タイトル + 生成AI行 + 本文」を流用。
  // 件数が多いと重いため、ファイル名は AIタイトル生成は行わず既存の auto_title/file_name を使う。
  // 194: 本文(content)は一覧APIが返さないため、?ids= で選択分を一括取得してから固める。
  const handleBulkDownload = async () => {
    if (bulkDownloading || selectedIds.size === 0) return;
    setBulkDownloading(true);
    try {
      const ids = Array.from(selectedIds);
      const items = await fetchItemsByIds(ids);
      if (items === null) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let added = 0;

      for (const it of items) {
        const label = it.analysis_label || it.analysis_type || '分析結果';
        const title = it.auto_title || it.file_name || label;
        const md = `# ${title}\n\n${sanitizeLatex(it.content ?? '')}`;

        // ファイル名（サニタイズ + 同名タイトルの重複は連番で回避）
        const base = sanitizeFilename(title) || `analysis_${it.id}`;
        let name = `${base}.md`;
        let i = 2;
        while (usedNames.has(name)) {
          name = `${base}_${i}.md`;
          i++;
        }
        usedNames.add(name);

        zip.file(name, md);
        added++;
      }

      if (added === 0) {
        showToast('ダウンロード対象が見つかりませんでした', 'error');
        return;
      }

      // triggerDownload(v25) は文字列専用でBlob非対応のため、ZIPはここで直接DLする
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `text-analysis_${yyyymmdd()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast(`${added}件をZIPでダウンロードしました`, 'success');
    } catch (e) {
      console.error('[bulk-download]', e);
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    const newName = editingValue.trim();
    if (!newName || newName === oldName) {
      setEditingCategory(null);
      return;
    }
    setIsRenaming(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_folder', oldName, newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error ?? '変更できませんでした');
        return;
      }
      setRecords((prev) =>
        prev.map((r) => (r.folder === oldName ? { ...r, folder: newName } : r)),
      );
      // カテゴリ集計もローカル更新（同名フォルダが既にある場合は件数を合算）
      setServerFolders((prev) => {
        const merged = new Map<string, number>();
        prev.forEach((f) => {
          const name = f.folder === oldName ? newName : f.folder;
          merged.set(name, (merged.get(name) ?? 0) + f.count);
        });
        return Array.from(merged.entries()).map(([folder, count]) => ({ folder, count }));
      });
      if (activeFolder === oldName) setActiveFolder(newName);
      showToast(`カテゴリ名を「${newName}」に変更しました`, 'success');
    } catch {
      showToast('変更に失敗しました', 'error');
    } finally {
      setIsRenaming(false);
      setEditingCategory(null);
    }
  };

  // 元の入力テキストを単体取得してキャッシュし、本文を返す（取得済みならそれを返す）
  const fetchInputText = async (id: number): Promise<string> => {
    if (loadedInputTexts[id] !== undefined) return loadedInputTexts[id];
    setInputTextLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}&withInput=1`);
      const data = await res.json();
      const text = typeof data?.input_text === 'string' ? data.input_text : '';
      setLoadedInputTexts((prev) => ({ ...prev, [id]: text }));
      return text;
    } catch {
      setLoadedInputTexts((prev) => ({ ...prev, [id]: '' }));
      return '';
    } finally {
      setInputTextLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 「📥 元の入力テキスト」の折りたたみトグル（開く時に未取得なら遅延取得）
  const toggleInputText = (id: number) => {
    setInputTextOpen((prev) => {
      const opening = !prev[id];
      if (opening && loadedInputTexts[id] === undefined) {
        void fetchInputText(id);
      }
      return { ...prev, [id]: opening };
    });
  };

  // 元の入力テキストをコピー（未取得なら取得してからコピー。copyToClipboard共通util）
  const copyInputText = async (id: number) => {
    if (copyingInputId === id) return; // 二度押し防止
    setCopyingInputId(id);
    try {
      const text = await fetchInputText(id);
      if (!text) {
        showToast('入力テキストがありません', 'error');
        return;
      }
      const ok = await copyToClipboard(text);
      showToast(
        ok ? '✅ 入力テキストをコピーしました' : '❌ コピーに失敗しました',
        ok ? 'success' : 'error',
      );
    } finally {
      setCopyingInputId(null);
    }
  };

  // カード本体の全文表示トグル（194: 開く時に本文が未取得なら遅延取得。入力テキストと同方式）
  const handleToggleExpand = (record: AnalysisRecord) => {
    const opening = expandedId !== record.id;
    if (opening && loadedContents[record.id] === undefined) {
      void fetchContent(record.id);
    }
    setExpandedId(opening ? record.id : null);
  };

  // 194: カテゴリ一覧は全件母数のサーバ集計（ロード済みページからの算出をやめる）
  const uniqueFolders = useMemo(() => serverFolders.map((f) => f.folder), [serverFolders]);

  // ⛶全画面リーダー（194: 本文を取得してから開く）
  const openReader = async (record: AnalysisRecord) => {
    const text = await fetchContent(record.id);
    if (text === null) {
      showToast('本文の取得に失敗しました', 'error');
      return;
    }
    setReaderRecord({
      record,
      title: record.auto_title || record.file_name || '無題',
      content: text,
    });
  };

  // 231: 📖Kindleウィザードへhandoff（230 B-1のテキスト分析版。ana-N名前空間で渡す・読取後削除の冪等キー）
  const router = useRouter();
  const handleKindleSelect = () => {
    if (selectedIds.size === 0) return;
    let ids = Array.from(selectedIds);
    if (ids.length > MAX_KINDLE_SOURCES) {
      if (!confirm(`Kindle素材は最大${MAX_KINDLE_SOURCES}件です。選択順の先頭${MAX_KINDLE_SOURCES}件（${ids.length}件中）を渡します。続けますか？`)) return;
      ids = ids.slice(0, MAX_KINDLE_SOURCES);
    }
    try {
      sessionStorage.setItem('lumina_kindle_selected', JSON.stringify(ids.map((id) => makeAnalysisSourceKey(id))));
    } catch {
      /* プライベートモード等で失敗しても遷移は続行（ウィザードで選び直せる） */
    }
    router.push('/dashboard/kindle-wizard');
  };

  // 🔀横断分析へ（194: 選択分の本文を一括取得してから渡す。saved経由/タブ内の両経路とも本ハンドラ）
  const [crossPreparing, setCrossPreparing] = useState(false);
  const handleCrossSelect = async () => {
    if (!onSelectForCross || crossPreparing || selectedIds.size === 0) return;
    setCrossPreparing(true);
    try {
      const items = await fetchItemsByIds(Array.from(selectedIds));
      if (items === null || items.length === 0) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      onSelectForCross(
        items.map((it) => ({
          id: it.id,
          title: it.auto_title ?? it.file_name ?? '無題',
          content: it.content,
          category: it.folder ?? undefined,
        })),
      );
    } finally {
      setCrossPreparing(false);
    }
  };

  // 292 §2: 選択した保存を横並びで比較。横断分析（handleCrossSelect）と同じく ?ids= で本文を一括取得
  //（一覧APIは本文を返さない）。列ヘッダーには分析タイプ（analysis_label）を出す（§2-5）。
  const handleCompareSelect = async () => {
    if (!compareState.enabled || comparePreparing) return;
    setComparePreparing(true);
    try {
      const ids = Array.from(selectedIds);
      const items = await fetchItemsByIds(ids);
      if (items === null || items.length === 0) {
        showToast('本文の取得に失敗しました', 'error');
        return;
      }
      const byId = new Map(items.map((it) => [it.id, it] as const));
      const entries: LibraryCompareEntry<CompareRow>[] = [];
      for (const id of ids) {
        const it = byId.get(id);
        if (!it) continue; // 取得できなかった行は落とす（件数差で分かる。空の列は出さない）
        const rec = records.find((r) => r.id === id);
        const content = typeof it.content === 'string' ? it.content : '';
        entries.push({
          item: {
            id: String(it.id),
            title: it.auto_title || it.file_name || '無題',
            content,
            char_count: content.length,
            created_at: rec?.created_at ?? null,
          },
          kind: it.analysis_type,
          label: it.analysis_label || it.analysis_type || '分析結果',
        });
        if (entries.length >= LIBRARY_COMPARE_MAX) break;
      }
      hoverPreview.hide();
      setCompareEntries(entries);
    } finally {
      setComparePreparing(false);
    }
  };
  // 比較の列 → 一覧の record（絞り込みで一覧から外れていても、取得済みの本文で全画面・DLできるよう最小形を組む）
  const compareRecordOf = (item: CompareRow): AnalysisRecord => {
    const rec = records.find((r) => String(r.id) === item.id);
    if (rec) return rec;
    return {
      id: Number(item.id), user_id: '', file_name: null, auto_title: item.title, analysis_type: '', analysis_label: '',
      content: item.content, tags: null, folder: null, favorite: false, locked: false, char_count: item.char_count,
      created_at: item.created_at ?? '', updated_at: '',
    };
  };

  // 194: 絞り込み（検索/カテゴリ/入力付き/お気に入り）はサーバ側で適用済み＝ロード済みをそのまま表示
  const visibleRecords = records;

  // 293 §5: 未分類（folder 空）の件数＝全件−分類済みの合計（サーバ集計から決定的に導く・追加クエリなし）
  const uncategorizedCount = Math.max(0, allTotal - serverFolders.reduce((a, f) => a + f.count, 0));

  // 293 §6: 適用中の条件（何が効いているかを見せ、個別に外せる）。順番は画面の並び（決定的）
  const activeConditions: ActiveCondition[] = [];
  if (debouncedSearch) {
    activeConditions.push({ key: 'search', label: `検索: 「${debouncedSearch}」`, onRemove: () => setSearchTerm('') });
  }
  if (searchRange === 'title') {
    activeConditions.push({ key: 'range', label: '検索範囲: タイトルのみ', onRemove: () => applySearchRange('all') });
  }
  if (activeFolder !== null) {
    activeConditions.push({ key: 'category', label: `カテゴリ: ${activeFolder || UNCATEGORIZED_LABEL}`, onRemove: () => setActiveFolder(null) });
  }
  if (typeFilter) {
    const t = serverTypes.find((x) => x.analysis_type === typeFilter);
    activeConditions.push({ key: 'type', label: `種別: ${t?.label || typeFilter}`, onRemove: () => setTypeFilter(null) });
  }
  if (inputOnly) {
    activeConditions.push({ key: 'input', label: '📥 入力付き', onRemove: () => setInputOnly(false) });
  }
  if (favoriteOnly) {
    activeConditions.push({ key: 'fav', label: '⭐ お気に入り', onRemove: () => setFavoriteOnly(false) });
  }
  if (activeCustomFolder === 'unfiled') {
    activeConditions.push({ key: 'cfolder', label: 'マイフォルダ: 未分類のお気に入り', onRemove: () => setActiveCustomFolder(null) });
  }
  if (activePurpose !== null) {
    activeConditions.push({ key: 'purpose', label: `🎯 用途: ${purposes.categories.find((c) => c.id === activePurpose)?.name ?? activePurpose}`, onRemove: () => setActivePurpose(null) });
  }
  const clearAllConditions = () => {
    setActivePurpose(null);
    setSearchTerm('');
    applySearchRange('all');
    setActiveFolder(null);
    setTypeFilter(null);
    setInputOnly(false);
    setFavoriteOnly(false);
    if (activeCustomFolder === 'unfiled') setActiveCustomFolder(null);
  };

  // 表示中レコードから分析タイプ別の件数とラベルを動的に抽出
  const typeStats = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of visibleRecords) {
      const type = r.analysis_type;
      const existing = map.get(type);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(type, {
          label: r.analysis_label || type,
          count: 1,
        });
      }
    }
    return Array.from(map.entries()).map(([type, info]) => ({ type, ...info }));
  }, [visibleRecords]);

  const handleSelectByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return;
    const allSelected = targetIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      targetIds.forEach((id) => next.delete(id));
    } else {
      targetIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const isAllSelectedByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return false;
    return targetIds.every((id) => selectedIds.has(id));
  };

  // 296 §2-4: handleSelectAllVisible（表示中を全選択）は撤去（全選択を置かない）

  const handleBulkMove = async (folder: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_folder', ids, folder }),
      });
      if (!res.ok) throw new Error('一括移動に失敗しました');
      setSelectedIds(new Set());
      showToast(
        `${ids.length}件を「${folder || '未分類'}」に移動しました`,
        'success',
      );
      // カテゴリ集計・絞り込み表示と整合させるため1ページ目から取り直す
      void fetchPage(0, false);
    } catch {
      showToast('一括移動に失敗しました', 'error');
    }
  };

  // 250: 選択中を一括削除。件数を明示した確認を必ず経由し、Undoは持たない（不可逆）。
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    if (!confirmBulkDelete(ids.length, '保存テキスト')) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '削除に失敗しました');
      setSelectedIds(new Set());
      showToast(`${data.deleted ?? ids.length}件を削除しました`, 'success');
      // 件数・カテゴリ集計・フォルダ件数を正値に戻すため1ページ目から取り直す
      void fetchPage(0, false);
      void customFolders.reload();
    } catch {
      showToast('一括削除に失敗しました', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleToggleFavorite = async (id: number) => {
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite', id }),
      });
      if (!res.ok) throw new Error();
      // お気に入り絞り込み中の解除は一覧から外す（サーバ絞り込みと整合）。
      // 249: マイフォルダで絞り込み中も同様（解除で分類が外れ、条件から外れるため）
      if (favoriteOnly || activeCustomFolder !== null) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotalCount((n) => Math.max(0, n - 1));
      } else {
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)),
        );
      }
      void customFolders.reload();
    } catch {
      showToast('更新に失敗しました', 'error');
    }
  };

  // ── 249: マイフォルダ（お気に入りの手動分類） ──
  // 分類を変えたまま閉じたときだけ、絞り込み中の一覧を取り直すためのフラグ
  const folderPickerDirtyRef = useRef(false);

  /** ☆ボタン: 未登録ならお気に入りにしてから、いずれの場合も分類パネルを開く */
  const handleFavoriteButton = (record: AnalysisRecord, rect: DOMRect) => {
    if (!record.favorite) void handleToggleFavorite(record.id);
    setFolderPicker({ id: record.id, rect });
  };

  const closeFolderPicker = () => {
    const changed = folderPickerDirtyRef.current;
    folderPickerDirtyRef.current = false;
    setFolderPicker(null);
    // フォルダで絞り込み中に分類を変えたら、条件から外れた記事を残さないよう取り直す
    if (changed && activeCustomFolder !== null) void fetchPage(0, false);
  };

  /** 所属フォルダを選択内容に置き換える（チェックした時点で保存） */
  const handleAssignFolders = async (id: number, folderIds: number[]) => {
    const before = records.find((r) => r.id === id)?.custom_folder_ids ?? [];
    folderPickerDirtyRef.current = true;
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, custom_folder_ids: folderIds } : r)),
    );
    const ok = await customFolders.assignItem(id, folderIds);
    if (!ok) {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, custom_folder_ids: before } : r)),
      );
    }
  };

  // 297: 「🎯 用途」ボタン → 割り当てパネル。閉じたとき、用途で絞り込み中なら取り直す（条件から外れた記事を残さない）
  const purposePickerDirtyRef = useRef(false);
  const handlePurposeButton = (record: AnalysisRecord, rect: DOMRect) => setPurposePicker({ id: record.id, rect });
  const closePurposePicker = () => {
    const changed = purposePickerDirtyRef.current;
    purposePickerDirtyRef.current = false;
    setPurposePicker(null);
    if (changed && activePurpose !== null) void fetchPage(0, false);
  };
  const handleAssignPurposes = async (id: number, categoryIds: number[]) => {
    const before = records.find((r) => r.id === id)?.purpose_category_ids ?? [];
    purposePickerDirtyRef.current = true;
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, purpose_category_ids: categoryIds } : r)));
    const ok = await purposes.assignItem(id, categoryIds);
    // 保存に成功したら所属を再適用する（保存より前に投げた一覧取得の応答が後から届いて楽観更新を上書きする競合への対処）
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, purpose_category_ids: ok ? categoryIds : before } : r)));
  };

  /** 298: 一括付け外し。成功した記事（changed＋unchanged）にだけ確定値を反映する（失敗分は触らない・R-39） */
  const handleBulkPurposes = async (mode: PurposeBulkMode, categoryIds: number[]) => {
    const ids = Array.from(selectedIds);
    const out = await purposes.bulkAssign(ids, categoryIds, mode);
    if (!out) return null;
    const okKeys = new Set([...out.changedKeys, ...out.unchangedKeys]);
    setRecords((prev) => prev.map((r) => {
      if (!okKeys.has(String(r.id))) return r;
      const cur = new Set(r.purpose_category_ids ?? []);
      for (const cid of categoryIds) { if (mode === 'add') cur.add(cid); else cur.delete(cid); }
      return { ...r, purpose_category_ids: Array.from(cur) };
    }));
    // 用途で絞り込み中に外したら、条件から外れた記事を残さないよう取り直す
    if (mode === 'remove' && activePurpose !== null && categoryIds.includes(activePurpose)) void fetchPage(0, false);
    return out;
  };

  /** パネルからのお気に入り解除。分類だけ残らないよう先に全解除する */
  const handleUnfavorite = async (id: number) => {
    await customFolders.assignItem(id, []);
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, custom_folder_ids: [] } : r)));
    await handleToggleFavorite(id);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この保存を削除しますか？')) return;
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      const deleted = records.find((r) => r.id === id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotalCount((n) => Math.max(0, n - 1));
      setAllTotal((n) => {
        const v = Math.max(0, n - 1);
        onAllTotalChange?.(v);
        return v;
      });
      if (deleted?.folder) {
        setServerFolders((prev) =>
          prev
            .map((f) => (f.folder === deleted.folder ? { ...f, count: f.count - 1 } : f))
            .filter((f) => f.count > 0),
        );
      }
      // 249: マイフォルダの件数も取り直す（削除された記事は数えない）
      void customFolders.reload();
      showToast('削除しました', 'success');
    } catch {
      showToast('削除に失敗しました', 'error');
    }
  };

  // 「✏️ 編集」押下 → 本文をサーバ取得してから編集モードへ（194: 取得失敗時は開かない＝
  // 未ロードのまま保存して空contentでUPDATEする経路を作らない）
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);
  const startEdit = async (record: AnalysisRecord) => {
    if (editLoadingId !== null) return;
    setEditLoadingId(record.id);
    try {
      const text = await fetchContent(record.id);
      if (text === null) {
        showToast('本文の取得に失敗しました（編集を開始できません）', 'error');
        return;
      }
      setExpandedId(record.id); // 編集UIは展開ビュー内に出るので展開も保証
      setEditingId(record.id);
      setEditTitle(record.auto_title || record.file_name || '');
      setEditContent(text);
    } finally {
      setEditLoadingId(null);
    }
  };

  // 編集内容を保存（PATCH action=update。タイトル+本文のみ、input_text は不変）
  const saveEdit = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      showToast('タイトルと本文は空にできません', 'error');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          title: editTitle.trim(),
          content: editContent.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      // ローカル state を楽観的更新（タイトル両カラム・文字数。本文はキャッシュ側を更新）
      const newTitle = editTitle.trim();
      const newContent = editContent.trim();
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                auto_title: newTitle,
                file_name: newTitle,
                char_count: newContent.length,
              }
            : r,
        ),
      );
      setLoadedContents((prev) => ({ ...prev, [id]: newContent }));
      setEditingId(null);
      showToast('✅ 更新しました', 'success');
    } catch {
      // 失敗時は編集モードを維持（入力内容を失わない）
      showToast('❌ 更新に失敗しました', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    // /dashboard/saved は 🗂テキスト分析 と 🧠AI参照素材 の両パネルを display:none で
    // 同時にマウントするため、パネルを一意に指せる目印を置く（E2Eの基点にもなる）
    <div data-saved-panel="text-analysis" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .category-card:hover .category-edit-btn { opacity: 1 !important; }
        /* カテゴリ概覧グリッド: 画面幅に応じて列数を自動調整（PCは多列、コンパクト1行表示） */
        .category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        /* スマホ(≤640px)は確実に2列 */
        @media (max-width: 640px) {
          .category-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      {/* 188: note記事群生成の入口を一覧最上部の目に入る位置へ（🧠側と見た目を統一） */}
      <div>
        <BundleSelectToggleButton />
      </div>
      {/* 214案③: note選択モード中はチェックがnote専用カートに切り替わる（180）＝
          横断分析用の選択が封鎖されることを明示（表示のみ・ロジック無変更） */}
      {bundleSelectMode && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'rgba(236,72,153,0.08)',
            border: '1px solid rgba(236,72,153,0.3)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          📝 note素材の選択モード中です。横断分析の選択は「✕ 選択をやめる」後に行ってください
          （選択済みの資料は「次へ」のモーダルからも横断分析へ送れます）
        </div>
      )}
      {/* カテゴリ概覧ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: -8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          📂 カテゴリ概覧
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* AI自動カテゴライズ */}
          <button
            type="button"
            onClick={handleAutoCategorize}
            disabled={isAutoCategorizing || allTotal === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: isAutoCategorizing
                ? '#9ca3af'
                : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor:
                isAutoCategorizing || allTotal === 0
                  ? 'not-allowed'
                  : 'pointer',
              opacity: allTotal === 0 ? 0.4 : 1,
            }}
            title="AIが全保存テキストを分析して最適なカテゴリへ自動分類します"
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

      {/* 201: 新カテゴリ抽出（キーワード方式・AI不使用・無料）。
          全件（テキスト分析＋AI参照素材）をILIKEで即時検索 → プレビュー（件数＋タイトル＋現カテゴリ）
          → 院長が個別除外して適用（人間承認型）。適用時は旧カテゴリを *_before_201 に退避。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={handleKeywordPreview}
          disabled={kwScan?.loading === true || kwScan?.applying === true}
          title={`全保存（テキスト分析＋AI参照素材）から「${Object.keys(CATEGORY_KEYWORDS).join('」「')}」のキーワードに一致するものを検索してプレビューします（AI不使用・無料・この時点では何も変更しません）`}
          style={{
            padding: '6px 12px',
            background: kwScan?.loading ? '#9ca3af' : 'var(--bg-card)',
            color: kwScan?.loading ? '#fff' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: kwScan?.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {kwScan?.loading ? '🔎 検索中...' : '🔎 キーワードで抽出（ニナファーム/ミトコンドリア）'}
        </button>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
          title="OFF=タイトルのみ検索（誤検出が少ない・既定）。ON=本文にしか出てこないケースも拾えます"
        >
          <input
            type="checkbox"
            checked={kwIncludeBody}
            onChange={(e) => setKwIncludeBody(e.target.checked)}
            style={{ accentColor: '#4f46e5' }}
          />
          本文も検索する
        </label>
        {!kwScan?.loading && kwScan?.message && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{kwScan.message}</span>
        )}
      </div>

      {/* 203: 任意ワード抽出（検索ワード＋反映先カテゴリ26種＋同じ本文トグルを共用）。
          辞書ボタン（201/202・Tier A/B共起判定つき）とは併存＝こちらは汎用の単層検索 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={kwWords}
          onChange={(e) => setKwWords(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleWordPreview();
          }}
          placeholder="検索ワード（複数はスペース/カンマ区切り・OR）"
          style={{
            flex: '1 1 220px',
            minWidth: 180,
            maxWidth: 340,
            padding: '6px 10px',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <select
          value={kwTargetCategory}
          onChange={(e) => setKwTargetCategory(e.target.value)}
          style={{
            padding: '6px 8px',
            background: 'var(--bg-card)',
            color: kwTargetCategory ? 'var(--text-primary)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            maxWidth: 200,
          }}
        >
          <option value="">反映先カテゴリを選択...</option>
          {CATEGORY_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER_CATEGORY}>{OTHER_CATEGORY}</option>
        </select>
        <button
          type="button"
          onClick={handleWordPreview}
          disabled={kwScan?.loading === true || kwScan?.applying === true}
          title="入力したワードで全保存（テキスト分析＋AI参照素材）を検索してプレビューします（AI不使用・無料・この時点では何も変更しません）"
          style={{
            padding: '6px 12px',
            background: kwScan?.loading ? '#9ca3af' : 'var(--bg-card)',
            color: kwScan?.loading ? '#fff' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: kwScan?.loading ? 'not-allowed' : 'pointer',
          }}
        >
          🔎 このワードで抽出
        </button>
        {kwRecent.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>最近:</span>
            {kwRecent.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setKwWords(w)}
                title="クリックで入力欄にセット"
                style={{
                  padding: '2px 8px',
                  background: 'rgba(79,70,229,0.08)',
                  color: '#4f46e5',
                  border: '1px solid rgba(79,70,229,0.2)',
                  borderRadius: 10,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {w}
              </button>
            ))}
          </span>
        )}
      </div>

      {/* 201: プレビューパネル（件数＋タイトル一覧＋現カテゴリ→新カテゴリ・個別除外つき） */}
      {kwScan && !kwScan.loading && kwScan.hits.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(79,70,229,0.06)',
            border: '1px solid rgba(79,70,229,0.25)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5' }}>
              🔎 キーワード抽出プレビュー（まだ何も変更していません）
            </span>
            {Object.entries(kwScan.counts).map(([cat, n]) => (
              <span
                key={cat}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(79,70,229,0.12)',
                  color: '#4f46e5',
                  fontWeight: 600,
                }}
              >
                {cat}: {n}件
              </span>
            ))}
          </div>
          {/* 203ガード③: 件数過多警告（ワードが一般的すぎる可能性） */}
          {kwScan.hits.length > KW_HITS_WARN_THRESHOLD && (
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 8,
                fontSize: 12,
                color: '#b45309',
              }}
            >
              ⚠️ ヒットが{KW_HITS_WARN_THRESHOLD}件を超えています（{kwScan.hits.length}件）。
              ワードが一般的すぎる可能性があります。タイトルをよく確認し、必要なら除外するか、
              より固有性の高いワードで検索し直してください。
            </div>
          )}
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {kwScan.hits.map((h) => {
              const key = `${h.table}:${h.id}`;
              const checked = !kwScan.excluded.has(key);
              return (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 12,
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: checked ? 'transparent' : 'rgba(107,114,128,0.08)',
                    opacity: checked ? 1 : 0.55,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setKwScan((s) => {
                        if (!s) return s;
                        const excluded = new Set(s.excluded);
                        if (excluded.has(key)) excluded.delete(key);
                        else excluded.add(key);
                        return { ...s, excluded };
                      });
                    }}
                    style={{ marginTop: 2, accentColor: '#4f46e5' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {h.table === 'ta' ? '📝' : '🧠'} {h.title}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      {h.current || '未分類'} → <strong style={{ color: '#4f46e5' }}>{h.category}</strong>
                      ・一致: {h.keywords.join(', ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleKeywordApply}
              disabled={kwScan.applying}
              style={{
                padding: '6px 14px',
                background: kwScan.applying ? '#9ca3af' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: kwScan.applying ? 'not-allowed' : 'pointer',
              }}
            >
              {kwScan.applying
                ? '適用中...'
                : `✅ 適用（${kwScan.hits.filter((h) => !kwScan.excluded.has(`${h.table}:${h.id}`)).length}件）`}
            </button>
            <button
              type="button"
              onClick={() => setKwScan(null)}
              disabled={kwScan.applying}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                cursor: kwScan.applying ? 'not-allowed' : 'pointer',
              }}
            >
              キャンセル
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              チェックを外した項目は適用されません。適用後も旧カテゴリは退避され、元に戻せます。
            </span>
          </div>
        </div>
      )}

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
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#4f46e5',
                marginBottom: 2,
              }}
            >
              ✅ {categorizationResult.updatedCount ?? 0}件を{' '}
              {categorizationResult.categories?.length ?? 0}カテゴリに自動分類しました
            </div>
            {categorizationResult.summary && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {categorizationResult.summary}
              </p>
            )}
            {categorizationResult.categories &&
              categorizationResult.categories.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 8,
                  }}
                >
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
                      <span style={{ opacity: 0.8, fontSize: 10 }}>
                        ({cat.item_ids?.length ?? 0})
                      </span>
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
        <div className="category-grid">
          {/* すべて */}
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            style={categoryCardStyle(activeFolder === null)}
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
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              {allTotal}
            </span>
          </button>

          {/* 293 §5: 未分類（folder が空）を必ず選べるようにする。件数は全件−分類済みの合計（決定的） */}
          <button
            type="button"
            data-ta-category-choice={UNCATEGORIZED}
            data-ta-category-count={uncategorizedCount}
            onClick={() => setActiveFolder('')}
            style={{ ...categoryCardStyle(activeFolder === ''), borderStyle: 'dashed' }}
          >
            <span style={{ fontSize: 15 }}>📭</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {UNCATEGORIZED_LABEL}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>{uncategorizedCount}</span>
          </button>

          {serverFolders.map(({ folder, count }) => {
            const color = getFolderColor(folder, uniqueFolders);
            const active = activeFolder === folder;
            const isEditing = editingCategory === folder;
            const canRename = folder !== '横断まとめ';
            return (
              <div
                key={folder}
                onClick={() => {
                  if (!isEditing) setActiveFolder(folder);
                }}
                className="category-card"
                data-ta-category-choice={folder}
                data-ta-category-count={count}
                style={{
                  ...categoryCardStyle(active),
                  position: 'relative',
                  overflow: 'hidden',
                }}
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
                {isEditing ? (
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(folder);
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      onBlur={() => handleRenameCategory(folder)}
                      disabled={isRenaming}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${color}`,
                        borderRadius: 4,
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <>
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
                      {folder}
                    </span>
                    {canRename && (
                      <button
                        type="button"
                        className="category-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(folder);
                          setEditingValue(folder);
                        }}
                        title="カテゴリ名を変更"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          fontSize: 11,
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.15s',
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        ✏️
                      </button>
                    )}
                  </>
                )}
                <span
                  style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 249: マイフォルダ（院長が名前を付けた分類。🤖自動カテゴリとは別軸で併存） */}
      <CustomFolderBar
        scope="text_analysis"
        folders={customFolders.folders}
        favoriteTotal={customFolders.favoriteTotal}
        unfiledFavoriteCount={customFolders.unfiledFavoriteCount}
        value={activeCustomFolder}
        onChange={setActiveCustomFolder}
        onCreate={customFolders.createFolder}
        onRename={customFolders.renameFolder}
        onDelete={customFolders.deleteFolder}
        onReorder={customFolders.reorderFolders}
        storageKey="ta_custom_folder_open"
      />

      {/* 297: 🎯用途カテゴリ（マイフォルダ＝テーマ別とは別の枠・別色・別テーブル。3画面で共有） */}
      <PurposeCategoryBar
        scope="text_analysis"
        categories={purposes.categories}
        totalCount={allTotal}
        value={activePurpose}
        onChange={setActivePurpose}
        onCreate={purposes.createCategory}
        onRename={purposes.renameCategory}
        onDelete={purposes.deleteCategory}
        storageKey="ta_purpose_open"
      />

      {/* 253: マイフォルダを開いている間は、両画面のアイテムをまとめた横断ビューに差し替える。
          （252では自画面のぶんしか出ず、バッジの件数と表示件数が食い違っていた） */}
      {typeof activeCustomFolder === 'number' ? (
        <FolderCrossView
          folderId={activeCustomFolder}
          folders={customFolders.folders}
          onFoldersChanged={() => {
            void customFolders.reload();
            onAllTotalChange?.(allTotal);
          }}
          onCreateFolder={customFolders.createFolder}
          onExit={() => setActiveCustomFolder(null)}
          notify={(m) => showToast(m, 'error')}
        />
      ) : (
      <>

      {/* 検索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          data-kb-search
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`${SEARCH_PLACEHOLDER.ta[searchRange]}${showKbHints ? KEY_HINT.searchSuffix : ''}`}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
        />
        {/* 293 §3-1: 検索範囲（タイトルのみ＝本文を対象から外す）。既定は「すべて」・保持 */}
        <span data-ta-search-range style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }} title="検索範囲（タイトルのみ＝本文を見ない）">
          {SEARCH_SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              data-ta-search-range-choice={s}
              aria-pressed={searchRange === s}
              onClick={() => applySearchRange(s)}
              style={{
                padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                background: searchRange === s ? 'var(--accent)' : 'transparent',
                color: searchRange === s ? '#fff' : 'var(--text-secondary)',
                border: 'none',
              }}
            >
              {SEARCH_SCOPE_LABEL[s]}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setInputOnly((v) => !v)}
          title="元の入力テキストが保存されている分析だけを表示"
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: 8,
            cursor: 'pointer',
            border: `1px solid ${inputOnly ? 'var(--accent)' : 'var(--border)'}`,
            background: inputOnly ? 'var(--accent)' : 'transparent',
            color: inputOnly ? '#fff' : 'var(--text-secondary)',
          }}
        >
          📥 入力付き
        </button>
        <button
          type="button"
          onClick={() => setFavoriteOnly((v) => !v)}
          title="お気に入り登録した分析だけを表示"
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: 8,
            cursor: 'pointer',
            border: `1px solid ${favoriteOnly ? '#f59e0b' : 'var(--border)'}`,
            background: favoriteOnly ? '#f59e0b' : 'transparent',
            color: favoriteOnly ? '#fff' : 'var(--text-secondary)',
          }}
        >
          ⭐ お気に入り
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          表示{records.length} / 該当{totalCount}件（全{allTotal}件）
        </span>
      </div>

      {/* ── 292 §2-3: 一覧の見え方（列数・密度）。291と同じ選択肢・同じ判断。タッチ端末は1列固定なので列数の選択は出さない ── */}
      <div data-library-view-bar style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
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
        <span data-library-density-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="表示密度（コンパクト＝バッジとタイトルのみ）">
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

      {/* ── 293 §4-2/§4-3: 種別フィルタ（analysis_type・件数はサーバー集計＝全件母数） ── */}
      {serverTypes.length > 0 && (
        <div data-ta-type-filter style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>種別（件）:</span>
          <button
            type="button"
            data-ta-type-choice="all"
            aria-pressed={typeFilter === null}
            onClick={() => setTypeFilter(null)}
            style={{ padding: '4px 12px', borderRadius: 12, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: typeFilter === null ? '#6c63ff' : 'var(--bg-card)', color: typeFilter === null ? '#fff' : 'var(--text-secondary)' }}
          >
            すべて ({allTotal})
          </button>
          {serverTypes.map((t) => {
            const active = typeFilter === t.analysis_type;
            return (
              <button
                key={t.analysis_type}
                type="button"
                data-ta-type-choice={t.analysis_type}
                data-ta-type-count={t.count}
                aria-pressed={active}
                onClick={() => setTypeFilter(active ? null : t.analysis_type)}
                style={{ padding: '4px 12px', borderRadius: 12, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? '#6c63ff' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text-secondary)' }}
              >
                {t.label || t.analysis_type} ({t.count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── 293 §6: 適用中の条件（192のタグ条件チップと同じ形）。個別に外せる・すべて解除 ── */}
      <ActiveConditionChips conditions={activeConditions} onClearAll={clearAllConditions} />

      {/* 一括移動パネル */}
      {selectedIds.size > 0 && (
        <div
          style={{
            border: '2px solid var(--accent)',
            background: 'rgba(108,99,255,0.08)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              📋 {selectedIds.size}件を選択中
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'var(--bg-card)',
                border: '1px solid var(--accent)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              ✕ 選択をすべて解除
            </button>
            {/* 298: 用途の一括付け外し。削除（下段の右端・赤）とは段も色も分けて置く（§3-2） */}
            {(() => { const st = purposeBulkState(selectedIds.size); return (
              <button
                type="button"
                data-purpose-bulk-open
                onClick={(e) => setPurposeBulk({ rect: e.currentTarget.getBoundingClientRect() })}
                disabled={!st.enabled}
                title={st.reason ?? '選択した記事に用途カテゴリをまとめて付ける／外す（記事は削除されません）'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#115e59', background: '#ccfbf1', border: '1px solid rgba(13,148,136,0.6)', borderRadius: 999, cursor: st.enabled ? 'pointer' : 'not-allowed', opacity: st.enabled ? 1 : 0.6 }}
              >
                🎯 用途
              </button>
            ); })()}
          </div>
          {/* 分析タイプ別一括選択 */}
          {typeStats.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                🏷 タイプ別一括選択
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {typeStats.map((stat) => {
                  const allSelected = isAllSelectedByType(stat.type);
                  return (
                    <button
                      key={stat.type}
                      type="button"
                      onClick={() => handleSelectByType(stat.type)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${allSelected ? '#9333ea' : 'var(--border)'}`,
                        background: allSelected ? '#9333ea' : 'var(--bg-card)',
                        color: allSelected ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{allSelected ? '✅' : '☐'}</span>
                      <span>{stat.label}</span>
                      <span
                        style={{
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: allSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                          color: allSelected ? '#fff' : 'var(--text-muted)',
                        }}
                      >
                        {stat.count}
                      </span>
                    </button>
                  );
                })}
                {/* 296 §2-4: 「表示中を全選択」は撤去（院長の指定＝全選択を置かない。分析タイプ別の絞り選択は残す） */}
              </div>
            </div>
          )}

          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            📁 カテゴリに移動
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueFolders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => handleBulkMove(folder)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {folder}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const name = prompt('新しいカテゴリ名');
                if (!name?.trim()) return;
                await handleBulkMove(name.trim());
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px dashed var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              + 新規カテゴリ
            </button>
            <button
              type="button"
              onClick={() => handleBulkMove('')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              未分類に戻す
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              marginTop: 6,
            }}
          >
            {/* 選択項目の一括MDダウンロード（ZIP） */}
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={bulkDownloading || selectedIds.size === 0}
              style={{
                padding: '10px 22px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                background:
                  bulkDownloading || selectedIds.size === 0
                    ? 'var(--border)'
                    : '#0ea5e9',
                color: '#fff',
                cursor:
                  bulkDownloading || selectedIds.size === 0
                    ? 'not-allowed'
                    : 'pointer',
                boxShadow:
                  bulkDownloading || selectedIds.size === 0
                    ? 'none'
                    : '0 4px 12px rgba(14,165,233,0.3)',
              }}
            >
              {bulkDownloading
                ? '⏳ 生成中...'
                : `📥 選択した${selectedIds.size}件をMDダウンロード`}
            </button>

            {/* 292 §2: 選択した保存を横並びで比較（2〜4件。5件目を選んでいる間は無効化して理由を出す＝R-101） */}
            <button
              type="button"
              data-library-compare-open
              onClick={handleCompareSelect}
              disabled={!compareState.enabled || comparePreparing}
              title={compareState.reason ?? '選択した保存を横並びで比較します（列数・高さ・同期スクロール・各列から全画面）'}
              style={{
                padding: '10px 22px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                background: !compareState.enabled || comparePreparing ? 'var(--border)' : '#6c63ff',
                color: '#fff',
                cursor: !compareState.enabled || comparePreparing ? 'not-allowed' : 'pointer',
                boxShadow: !compareState.enabled || comparePreparing ? 'none' : '0 4px 12px rgba(108,99,255,0.3)',
              }}
            >
              {comparePreparing ? '⏳ 本文を取得中...' : compareState.label}
            </button>

            {selectedIds.size >= 2 && onSelectForCross && (
              <button
                type="button"
                onClick={handleCrossSelect}
                disabled={crossPreparing}
                style={{
                  padding: '10px 22px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  background: crossPreparing ? '#9ca3af' : '#9333ea',
                  color: '#fff',
                  cursor: crossPreparing ? 'not-allowed' : 'pointer',
                  boxShadow: crossPreparing ? 'none' : '0 4px 12px rgba(147,51,234,0.3)',
                }}
              >
                {crossPreparing
                  ? '⏳ 本文を取得中...'
                  : `🔀 選択した${selectedIds.size}件を横断分析する`}
              </button>
            )}

            {/* 231: テキスト分析→Kindle素材化（ana-N名前空間でウィザード①へ） */}
            {selectedIds.size >= 1 && (
              <button
                type="button"
                onClick={handleKindleSelect}
                style={{
                  padding: '10px 22px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  background: '#ec4899',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(236,72,153,0.3)',
                }}
              >
                📖 選択した{selectedIds.size}件をKindle本にする
              </button>
            )}

            {/* 250: 一括削除。不可逆なので色で区別し、列の末尾（他の操作と押し間違えない位置）に置く */}
            <button
              type="button"
              data-bulk-delete
              onClick={handleBulkDelete}
              disabled={bulkDeleting || selectedIds.size === 0}
              style={{
                padding: '10px 22px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                background: bulkDeleting || selectedIds.size === 0 ? 'var(--border)' : '#dc2626',
                color: '#fff',
                cursor: bulkDeleting || selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                boxShadow:
                  bulkDeleting || selectedIds.size === 0
                    ? 'none'
                    : '0 4px 12px rgba(220,38,38,0.3)',
                marginLeft: 'auto',
              }}
            >
              {bulkDeleting
                ? '⏳ 削除中...'
                : `🗑 選択した${selectedIds.size}件を削除`}
            </button>
          </div>
        </div>
      )}

      {/* 292 §2: 横並び比較パネル（291の共通部品。全画面は下の FullscreenReader を共用・MDは同じハンドラ） */}
      {compareEntries && (
        <LibraryCompareView
          entries={compareEntries}
          kindNote="各列の見出しに分析タイプ（全文書き起こし／詳細にまとめる／概要・要約 など）を表示しています。"
          onClose={() => setCompareEntries(null)}
          onFullscreen={(item) => void openReader(compareRecordOf(item))}
          onExportMd={(item) => void handleDownloadMd(compareRecordOf(item))}
        />
      )}

      {/* 一覧 */}
      {listLoading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          読み込み中...
        </div>
      ) : visibleRecords.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-muted)',
            fontSize: 13,
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          {activeConditions.length > 0 ? (
            <>
              {/* 293 §6-2: 0件のときは「絞りすぎ」を示し、その場で外せるようにする */}
              <div data-ta-empty style={{ lineHeight: 1.7 }}>{zeroResultMessage(activeConditions.length)}</div>
              <button
                type="button"
                data-ta-empty-clear
                onClick={clearAllConditions}
                style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                条件をすべて解除
              </button>
            </>
          ) : (
            '保存された分析結果はまだありません'
          )}
        </div>
      ) : (
        <div className={listGridClass(resolvedListCols)} {...listGridAttrs} style={{ gap: 8 }}>
          {visibleRecords.map((record) => {
            const title =
              record.auto_title || record.file_name || '無題';
            const checked = selectedIds.has(record.id);
            const expanded = expandedId === record.id;
            const folderColor = record.folder
              ? getFolderColor(record.folder, uniqueFolders)
              : null;
            const highlighted = highlightId === record.id;
            return (
              <div
                key={record.id}
                id={`article-${record.id}`}
                // 187: 「→次へ」追従ボタンの位置計測用（NoteBundleDock が参照）
                data-bundle-key={`ana-${record.id}`}
                // 250: 一括削除のE2Eがカード単位で存在を判定するための目印
                data-analysis-card={record.id}
                // 257: プレビューはこの要素の矩形に隣接して出る（位置の基準）
                data-hover-card={record.id}
                {...hoverPreview.bind(async () =>
                  markdownToReadableText(await fetchContent(record.id)),
                )}
                onClick={() => {
                  if (highlighted) onHighlightClear?.();
                }}
                style={{
                  background: highlighted ? 'rgba(147,51,234,0.08)' : 'var(--bg-card)',
                  border: `1px solid ${
                    highlighted
                      ? '#9333ea'
                      : (bundleSelectMode ? isBundleSelected('analysis', record.id) : checked)
                        ? 'var(--accent)'
                        : 'var(--border)'
                  }`,
                  borderRadius: 12,
                  padding: 12,
                  minWidth: 0,
                  boxShadow: highlighted ? '0 0 0 3px rgba(147,51,234,0.25)' : undefined,
                  transition: 'all 0.2s',
                  // お気に入りは金色の左ボーダー+淡アンバー背景で一目で区別
                  // （ハイライト/選択中はそちらの強調を優先）
                  ...(record.favorite && !highlighted
                    ? {
                        borderLeft: '4px solid #f59e0b',
                        background: checked
                          ? 'rgba(108,99,255,0.08)'
                          : 'rgba(245,158,11,0.08)',
                      }
                    : {}),
                }}
              >
                {highlighted && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#9333ea',
                    }}
                  >
                    <span>📎 横断まとめで使用した記事</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHighlightClear?.();
                      }}
                      style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        color: '#9333ea',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  {bundleSelectMode ? (
                    // note記事まとめの選択モード中は、この位置のチェックをnote素材選択に切り替える（180）
                    <BundleSelectCheckbox
                      source="analysis"
                      id={record.id}
                      topic={title}
                      onLimit={(m) => showToast(m, 'error')}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      data-select-check={record.id}
                      checked={checked}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(record.id)) next.delete(record.id);
                          else next.add(record.id);
                          return next;
                        });
                      }}
                      style={{ accentColor: 'var(--accent)', marginTop: 4 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 292（291 §3-4と同じ構成）: 1行目にバッジ（分析タイプ・文字数・日付・カテゴリ・⭐）、2行目にタイトル。
                        長いタイトルでもバッジの位置が動かない。文字数の濃淡は lib/library-view.ts の段階（数値併記） */}
                    <div
                      data-ta-badges
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span
                        data-ta-type-label={record.analysis_type}
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(108,99,255,0.15)',
                          color: 'var(--accent)',
                          fontWeight: 700,
                        }}
                      >
                        {record.analysis_label}
                      </span>
                      <CharCountBadge n={record.char_count ?? 0} />
                      <span>{new Date(record.created_at).toLocaleString('ja-JP')}</span>
                      {record.folder && folderColor && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 999,
                            color: '#fff',
                            background: folderColor,
                            fontWeight: 500,
                          }}
                        >
                          📁 {record.folder}
                        </span>
                      )}
                      {/* 249: 所属マイフォルダ（複数可）。自動カテゴリ📁の隣に📂で並ぶ（292: コンパクトでは出さない） */}
                      {listDensity === 'detail' && (
                        <FolderBadges
                          folderIds={record.custom_folder_ids}
                          folders={customFolders.folders}
                        />
                      )}
                      {/* 297: 所属用途カテゴリ（🎯青緑・📂金色のマイフォルダと区別）。コンパクトでは出さない */}
                      {listDensity === 'detail' && (
                        <PurposeBadges categoryIds={record.purpose_category_ids} categories={purposes.categories} />
                      )}
                      {record.favorite && (
                        <span
                          style={{
                            fontSize: 18,
                            lineHeight: 1,
                            filter: 'drop-shadow(0 1px 1px rgba(245,158,11,0.4))',
                          }}
                          title="お気に入り"
                        >
                          ⭐
                        </span>
                      )}
                    </div>
                    <div data-ta-title style={{ marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {title}
                      </span>
                    </div>
                    {/* ── アクションバー（タイトル直下に配置）。292: 密度=コンパクトでは出さない（高さを抑える） ── */}
                    {listDensity === 'detail' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(record)}
                        style={listBtnStyle()}
                      >
                        {expanded ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openReader(record)}
                        style={listBtnStyle()}
                        title={`全画面のリーダー表示で読む${showKbHints ? KEY_HINT.readerOpenSuffix : ''}`}
                      >
                        ⛶ 全画面
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(record)}
                        style={{
                          ...listBtnStyle(),
                          background:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.12)'
                              : listBtnStyle().background,
                          borderColor:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.4)'
                              : 'var(--border)',
                          color: copiedId === record.id ? '#16a34a' : 'var(--text-secondary)',
                        }}
                      >
                        {copiedId === record.id ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTxt(record)}
                        disabled={downloadingId === record.id}
                        style={{
                          ...listBtnStyle(),
                          cursor:
                            downloadingId === record.id ? 'not-allowed' : 'pointer',
                          opacity: downloadingId === record.id ? 0.6 : 1,
                        }}
                      >
                        {downloadingId === record.id
                          ? '⏳ 準備中...'
                          : '⬇ テキスト'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadMd(record)}
                        disabled={downloadingId === record.id}
                        style={{
                          ...listBtnStyle(),
                          cursor:
                            downloadingId === record.id ? 'not-allowed' : 'pointer',
                          opacity: downloadingId === record.id ? 0.6 : 1,
                        }}
                      >
                        {downloadingId === record.id
                          ? '⏳ 準備中...'
                          : '📥 MD'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadDocx(record)}
                        disabled={downloadingId === record.id}
                        style={{
                          ...listBtnStyle(),
                          cursor:
                            downloadingId === record.id ? 'not-allowed' : 'pointer',
                          opacity: downloadingId === record.id ? 0.6 : 1,
                        }}
                      >
                        {downloadingId === record.id
                          ? '⏳ 準備中...'
                          : '📄 Word'}
                      </button>
                      {/* 249: お気に入りと同時にフォルダ分類も決める。既にお気に入りなら
                          分類の変更・追加・解除をこのパネルから行う */}
                      <button
                        type="button"
                        data-favorite-button={record.id}
                        onClick={(e) =>
                          handleFavoriteButton(
                            record,
                            e.currentTarget.getBoundingClientRect(),
                          )
                        }
                        title={
                          record.favorite
                            ? 'フォルダ分類の変更・お気に入り解除'
                            : 'お気に入りに登録してフォルダに分類する'
                        }
                        style={
                          record.favorite
                            ? {
                                ...listBtnStyle(),
                                background: '#fef3c7',
                                border: '1px solid #f59e0b',
                                color: '#92400e',
                                fontWeight: 700,
                              }
                            : listBtnStyle()
                        }
                      >
                        {record.favorite ? '⭐ 分類' : '☆ お気に入り'}
                      </button>
                      {/* 297: 用途カテゴリの割り当て（お気に入りとは無関係・マイフォルダの☆と同じ操作感） */}
                      <button
                        type="button"
                        data-purpose-button={record.id}
                        onClick={(e) => handlePurposeButton(record, e.currentTarget.getBoundingClientRect())}
                        title="用途カテゴリを割り当て（note用・Kindle用など）"
                        style={{ ...listBtnStyle(), color: '#115e59', border: '1px solid rgba(13,148,136,0.45)', background: 'rgba(13,148,136,0.08)' }}
                      >
                        🎯 用途
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          editingId === record.id
                            ? setEditingId(null)
                            : void startEdit(record)
                        }
                        disabled={editLoadingId !== null && editLoadingId !== record.id}
                        style={{
                          ...listBtnStyle(),
                          background:
                            editingId === record.id
                              ? 'rgba(108,99,255,0.12)'
                              : listBtnStyle().background,
                          borderColor:
                            editingId === record.id
                              ? 'var(--accent)'
                              : 'var(--border)',
                          color:
                            editingId === record.id
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {editingId === record.id
                          ? '✏️ 編集中'
                          : editLoadingId === record.id
                            ? '⏳ 本文取得中...'
                            : '✏️ 編集'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        style={{
                          ...listBtnStyle(),
                          color: '#ef4444',
                          marginLeft: 'auto',
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>
                    )}
                    {expanded ? (
                      <>
                      {/* 本文表示枠の高さ切替（S/M/L/全）。生成結果カードと同じ仕様・見た目 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          marginBottom: 6,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginRight: 4,
                          }}
                        >
                          高さ:
                        </span>
                        {(['S', 'M', 'L', 'full'] as SavedHeightMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => changeHeight(m)}
                            style={{
                              padding: '2px 8px',
                              fontSize: 10,
                              borderRadius: 4,
                              border: '1px solid',
                              borderColor:
                                heightMode === m ? 'var(--accent)' : 'var(--border)',
                              background:
                                heightMode === m ? 'var(--accent)' : 'transparent',
                              color: heightMode === m ? '#fff' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {m === 'full' ? '全' : m}
                          </button>
                        ))}
                      </div>
                      <div
                        style={{
                          padding: 10,
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          // 「全」(full=0)は高さ制限なしで全文表示、S/M/Lは枠内スクロール
                          ...(heightMode === 'full'
                            ? {}
                            : {
                                maxHeight: SAVED_HEIGHT_VALUES[heightMode],
                                overflowY: 'auto',
                              }),
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          position: 'relative',
                        }}
                      >
                        {/* 展開時のみ右上 sticky な閉じるボタン */}
                        <div
                          style={{
                            position: 'sticky',
                            top: 4,
                            float: 'right',
                            zIndex: 5,
                            marginLeft: 'auto',
                            marginBottom: -28,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 11,
                              fontWeight: 500,
                              background: 'rgba(255, 255, 255, 0.92)',
                              color: '#374151',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                              backdropFilter: 'blur(4px)',
                              WebkitBackdropFilter: 'blur(4px)',
                              whiteSpace: 'nowrap',
                            }}
                            title="このアイテムを閉じる"
                          >
                            ▲ 閉じる
                          </button>
                        </div>
                        {/* 編集モード: タイトルinput + 本文textarea（生Markdown）。
                            通常時: 保存済み結果を Markdown リッチ描画 */}
                        {editingId === record.id ? (
                          <div onClick={(e) => e.stopPropagation()}>
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
                                background: 'var(--input-bg, var(--bg-primary))',
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
                                background: 'var(--input-bg, var(--bg-primary))',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                              }}
                            />
                            <div
                              style={{ display: 'flex', gap: 8, marginTop: 8 }}
                            >
                              <button
                                type="button"
                                onClick={() => saveEdit(record.id)}
                                disabled={editSaving}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  border: 'none',
                                  background: editSaving
                                    ? '#9ca3af'
                                    : 'var(--accent)',
                                  color: '#fff',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {editSaving ? '⏳ 保存中...' : '💾 保存'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={editSaving}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: 13,
                                  fontWeight: 500,
                                  borderRadius: 8,
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg-card)',
                                  color: 'var(--text-secondary)',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                }}
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : contentLoading[record.id] ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                            本文を読み込み中...
                          </div>
                        ) : loadedContents[record.id] === undefined ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                            本文を取得できませんでした。もう一度「▼ 全文表示」を開き直してください。
                          </div>
                        ) : (
                          <div
                            className="markdown-body"
                            style={{
                              lineHeight: 1.75,
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word',
                            }}
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(loadedContents[record.id]),
                            }}
                          />
                        )}
                        {/* 📥 元の入力テキスト（紐付け表示）。入力はユーザーの生テキストなので
                            renderMarkdown には流さず pre-wrap の生表示にする */}
                        {record.has_input && (
                          <div
                            style={{
                              marginTop: 12,
                              borderTop: '1px dashed var(--border)',
                              paddingTop: 10,
                            }}
                          >
                            {/* 見出し行: 文字数 + 表示トグル + コピー（デフォルト折りたたみ） */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: inputTextOpen[record.id] ? 6 : 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                📥 元の入力テキスト（{(record.input_char_count ?? 0).toLocaleString()}文字）
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleInputText(record.id)}
                                style={listBtnStyle()}
                              >
                                {inputTextOpen[record.id] ? '▲ 閉じる' : '▼ 表示'}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyInputText(record.id)}
                                disabled={copyingInputId === record.id}
                                style={{
                                  ...listBtnStyle(),
                                  cursor:
                                    copyingInputId === record.id
                                      ? 'not-allowed'
                                      : 'pointer',
                                  opacity: copyingInputId === record.id ? 0.6 : 1,
                                }}
                              >
                                {copyingInputId === record.id ? '⏳ 取得中...' : '📋 コピー'}
                              </button>
                            </div>
                            {inputTextOpen[record.id] &&
                              (inputTextLoading[record.id] ? (
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  読み込み中...
                                </div>
                              ) : (
                                <div
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                                    padding: 10,
                                    borderRadius: 8,
                                    maxHeight: 300,
                                    overflowY: 'auto',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {loadedInputTexts[record.id] ||
                                    '（入力テキストを取得できませんでした）'}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      </>
                    ) : null /* 本文プレビューは非表示。閲覧は「▼全文表示」/「⛶全画面」に集約 */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 194: もっと見る（175 context_saves 側と同方式のoffsetページング。全件に到達できる） */}
      {!listLoading && records.length < totalCount && (
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => fetchPage(records.length, true)}
            disabled={loadingMore}
            style={{
              padding: '10px 26px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loadingMore ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingMore ? '⏳ 読み込み中...' : `▼ もっと見る（${records.length} / ${totalCount}）`}
          </button>
        </div>
      )}

      {/* 全画面リーダー（保存テキストを読み物表示）。
          191: カードと同じアクション（同じハンドラを共有・二重実装しない）をヘッダーに追従表示。
          お気に入り/編集/削除のような一覧の状態を変える操作は誤操作防止のため入れない。
          204: j/k で表示中の一覧（絞り込み後）の次/前の資料へ移動（openReaderを共有＝本文は遅延取得） */}
      <FullscreenReader
        open={readerRecord !== null}
        title={readerRecord?.title ?? '無題'}
        content={readerRecord?.content ?? ''}
        onClose={() => setReaderRecord(null)}
        onPrev={(() => {
          if (!readerRecord) return undefined;
          const idx = visibleRecords.findIndex((r) => r.id === readerRecord.record.id);
          return idx > 0 ? () => void openReader(visibleRecords[idx - 1]) : undefined;
        })()}
        onNext={(() => {
          if (!readerRecord) return undefined;
          const idx = visibleRecords.findIndex((r) => r.id === readerRecord.record.id);
          return idx >= 0 && idx < visibleRecords.length - 1
            ? () => void openReader(visibleRecords[idx + 1])
            : undefined;
        })()}
        actions={
          readerRecord && (
            <>
              <button
                type="button"
                onClick={() => handleCopy(readerRecord.record)}
                style={{
                  ...listBtnStyle(),
                  background:
                    copiedId === readerRecord.record.id
                      ? 'rgba(34,197,94,0.12)'
                      : listBtnStyle().background,
                  borderColor:
                    copiedId === readerRecord.record.id
                      ? 'rgba(34,197,94,0.4)'
                      : 'var(--border)',
                  color:
                    copiedId === readerRecord.record.id
                      ? '#16a34a'
                      : 'var(--text-secondary)',
                }}
              >
                {copiedId === readerRecord.record.id ? '✅ コピー済み' : '📋 コピー'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTxt(readerRecord.record)}
                disabled={downloadingId === readerRecord.record.id}
                style={{
                  ...listBtnStyle(),
                  cursor:
                    downloadingId === readerRecord.record.id ? 'not-allowed' : 'pointer',
                  opacity: downloadingId === readerRecord.record.id ? 0.6 : 1,
                }}
              >
                {downloadingId === readerRecord.record.id
                  ? '⏳ 準備中...'
                  : '⬇ テキスト'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadMd(readerRecord.record)}
                disabled={downloadingId === readerRecord.record.id}
                style={{
                  ...listBtnStyle(),
                  cursor:
                    downloadingId === readerRecord.record.id ? 'not-allowed' : 'pointer',
                  opacity: downloadingId === readerRecord.record.id ? 0.6 : 1,
                }}
              >
                {downloadingId === readerRecord.record.id
                  ? '⏳ 準備中...'
                  : '📥 MD'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadDocx(readerRecord.record)}
                disabled={downloadingId === readerRecord.record.id}
                style={{
                  ...listBtnStyle(),
                  cursor:
                    downloadingId === readerRecord.record.id ? 'not-allowed' : 'pointer',
                  opacity: downloadingId === readerRecord.record.id ? 0.6 : 1,
                }}
              >
                {downloadingId === readerRecord.record.id
                  ? '⏳ 準備中...'
                  : '📄 Word'}
              </button>
            </>
          )
        }
      />
      </>
      )}

      {/* 256: 本文プレビューのポップアップ（1画面に1つだけ） */}
      {hoverPreview.layer}

      {/* 249: 分類パネル（☆ボタンから開く。createPortalでbody直下に出す＝R-19） */}
      {folderPicker &&
        (() => {
          const target = records.find((r) => r.id === folderPicker.id);
          if (!target) return null;
          return (
            <FolderPickerPopover
              anchorRect={folderPicker.rect}
              folders={customFolders.folders}
              selectedIds={target.custom_folder_ids ?? []}
              isFavorite={target.favorite}
              onChange={(ids) => void handleAssignFolders(target.id, ids)}
              onCreate={customFolders.createFolder}
              onUnfavorite={() => void handleUnfavorite(target.id)}
              onClose={closeFolderPicker}
            />
          );
        })()}

      {/* 298: 選択した記事への一括付け外し */}
      {purposeBulk && (
        <PurposeBulkPanel
          anchorRect={purposeBulk.rect}
          categories={purposes.categories}
          selectedCount={selectedIds.size}
          onApply={handleBulkPurposes}
          onCreate={purposes.createCategory}
          onClose={() => setPurposeBulk(null)}
        />
      )}

      {/* 297: 用途の割り当てパネル（🎯ボタンから開く） */}
      {purposePicker &&
        (() => {
          const target = records.find((r) => r.id === purposePicker.id);
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

function categoryCardStyle(active: boolean): React.CSSProperties {
  // 1行コンパクト表示: アイコン・名前・件数を横並びに詰める
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

// 共通スタイルを参照（コンテキストライブラリと同一の見た目）。実体は cardActionButtonStyle.ts。
function listBtnStyle(): React.CSSProperties {
  return cardActionBtnStyle();
}

