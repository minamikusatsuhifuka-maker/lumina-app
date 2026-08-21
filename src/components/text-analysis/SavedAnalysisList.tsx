'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { MAX_KINDLE_SOURCES, makeAnalysisSourceKey } from '@/lib/kindle-limits';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { markdownToReadableText } from '@/lib/markdownToText';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';
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
import FolderBadges from '@/components/custom-folders/FolderBadges';
import FolderPickerPopover from '@/components/custom-folders/FolderPickerPopover';
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
  const [activeCustomFolder, setActiveCustomFolder] = useState<FolderFilter>(null);
  // 分類パネルを開いている記事（☆ボタンの矩形に合わせてポップオーバーを出す）
  const [folderPicker, setFolderPicker] = useState<{ id: number; rect: DOMRect } | null>(null);
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
      if (activeFolder !== null) p.set('folder', activeFolder);
      if (favoriteOnly) p.set('favorite', '1');
      if (inputOnly) p.set('hasInput', '1');
      // 249: マイフォルダでの絞り込み（id指定 / お気に入りの未分類）
      if (activeCustomFolder !== null) p.set('cfolder', String(activeCustomFolder));
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

  // フィルタ変更・親からの再読込トリガで1ページ目から取り直す
  useEffect(() => {
    fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeFolder, favoriteOnly, inputOnly, activeCustomFolder, reloadKey]);

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

  // 194: 絞り込み（検索/カテゴリ/入力付き/お気に入り）はサーバ側で適用済み＝ロード済みをそのまま表示
  const visibleRecords = records;

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

  const handleSelectAllVisible = () => {
    const allIds = visibleRecords.map((r) => r.id);
    if (allIds.length === 0) return;
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* 検索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          data-kb-search
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`🔍 タイトル・本文で検索${showKbHints ? KEY_HINT.searchSuffix : ''}`}
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
                {visibleRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${
                        visibleRecords.every((r) => selectedIds.has(r.id))
                          ? 'var(--text-primary)'
                          : 'var(--border)'
                      }`,
                      background: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--text-primary)'
                        : 'var(--bg-card)',
                      color: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--bg-primary)'
                        : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>📋</span>
                    <span>表示中を全選択</span>
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {visibleRecords.length}
                    </span>
                  </button>
                )}
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
          </div>
        </div>
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
          {debouncedSearch ||
          activeFolder !== null ||
          inputOnly ||
          favoriteOnly ||
          activeCustomFolder !== null
            ? '条件に一致する保存はありません'
            : '保存された分析結果はまだありません'}
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(108,99,255,0.15)',
                          color: 'var(--accent)',
                        }}
                      >
                        {record.analysis_label}
                      </span>
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
                      {/* 249: 所属マイフォルダ（複数可）。自動カテゴリ📁の隣に📂で並ぶ */}
                      <FolderBadges
                        folderIds={record.custom_folder_ids}
                        folders={customFolders.folders}
                      />
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
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginBottom: 6,
                      }}
                    >
                      {new Date(record.created_at).toLocaleString('ja-JP')} ・
                      {record.char_count?.toLocaleString() ?? 0}文字
                    </div>
                    {/* ── アクションバー（タイトル直下に配置） ── */}
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

