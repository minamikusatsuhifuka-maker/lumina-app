'use client';
// 223: Kindle本づくりウィザード（先行リリース=リードマグネット）
// 6ステップ: ①素材 → ②目的 → ③分量・文体 → ④目次生成・編集 → ⑤本文生成 → ⑥出力
// ④確定以降は kindle_books/kindle_chapters が正（?bookId= で復帰・章status駆動レジューム）
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { LibraryItemRow } from '@/components/LibraryItemRow';
import { KINDLE_PURPOSES, KINDLE_PURPOSE_KEYS, type KindlePurposeKey } from '@/lib/kindle-purposes';
import {
  KINDLE_STYLES,
  KINDLE_STYLE_KEYS,
  DEFAULT_KINDLE_STYLE,
  type KindleStyleKey,
} from '@/lib/kindle-styles';
import {
  MAX_KINDLE_SOURCES,
  MAX_KINDLE_TOTAL_CHARS,
  KINDLE_MATERIAL_SOURCES,
  KINDLE_SOURCE_TABS,
  KINDLE_MATERIAL_SOURCE_META,
  type KindleMaterialSource,
} from '@/lib/kindle-limits';
import { stripLeadingChapterHeading } from '@/lib/kindle-text';
import { triggerDownload } from '@/lib/download';
import { copyRichMarkdown } from '@/lib/rich-copy';
import KindleToNoteModal from '@/components/kindle/KindleToNoteModal';
import {
  KINDLE_ASSET_KINDS,
  KINDLE_ASSET_META,
  kindleAssetToText,
  type KindleAssetKind,
  type KindleBookAssets,
} from '@/lib/kindle-assets';
import {
  applyProofreadFix,
  countPendingIssues,
  KINDLE_ISSUE_BADGE,
  type KindleBookProofread,
  type KindleProofreadIssue,
} from '@/lib/kindle-proofread';
import { ProofreadDiffPane, type AppliedFix } from '@/components/proofread/ProofreadDiffPane';
import { findBannedExpressions, type UngroundedTerm, type BannedExpression } from '@/lib/content-verify';
import {
  KINDLE_TASTES,
  KINDLE_TASTE_KEYS,
  KINDLE_SCORE_AXES,
  scoreColor,
  type KindleBookScores,
} from '@/lib/kindle-taste';
import DiffColumns from '@/components/kindle/DiffColumns';
import {
  hasChapterEndSummary,
  buildChapterSummaryBlock,
  buildBookSummarySection,
  type KindleBookSummaries,
} from '@/lib/kindle-summaries';
import { IMAGE_MODELS, type ImageModelKey } from '@/lib/image-providers';
import {
  SUMMARY_IMAGE_TEMPLATES,
  SUMMARY_IMAGE_TEMPLATE_KEYS,
  DEFAULT_SUMMARY_IMAGE_TEMPLATE,
  type SummaryImageTemplateKey,
  type KindleSummaryImages,
} from '@/lib/kindle-summary-image-templates';
import {
  KINDLE_IMAGE_STYLES,
  KINDLE_IMAGE_STYLE_KEYS,
  DEFAULT_KINDLE_IMAGE_STYLE,
  buildImageLine,
  stripImageLines,
  type KindleImageStyleKey,
  type KindleBookImages,
} from '@/lib/kindle-image-styles';

/* ── ステップ定義 ── */
const STEPS = [
  { num: 1, label: '素材' },
  { num: 2, label: '目的' },
  { num: 3, label: '分量・文体' },
  { num: 4, label: '目次' },
  { num: 5, label: '本文生成' },
  { num: 6, label: '出力' },
] as const;

/* 目的カードの「この目的で書くとどうなるか」要旨（表示専用・プロンプトはkindle-purposes.tsが正） */
const PURPOSE_HINTS: Record<KindlePurposeKey, string> = {
  monetize: '悩みの言語化→解決ステップ→「ここから先は専門家と」の線引き。巻末は相談・サービスへの導線',
  branding: '独自の視点・哲学・一次体験で「何者か」を伝える。巻末は発信フォロー・講演/取材窓口への導線',
  acquisition: '不安の解消と来院までの流れを丁寧に。医療広告に配慮し、巻末は予約・相談への導線',
  recruit: '職場のリアル・育成制度・院長の育成観を等身大で。巻末はカジュアル面談・見学への導線',
};

/* 分量プリセット（本便はリードマグネットのみ活性・他は224以降） */
// 225c: standard解禁。生成は従来どおり1リクエスト=1章（各300s内）×章status駆動レジューム
// ＝章数が増えるだけでVercel上限内。途中で閉じても?bookId=復帰で残り章から再開できる（222で確立）
const PRESETS = [
  { key: 'leadmagnet', emoji: '📗', label: 'リードマグネット', detail: '30ページ／2〜3万字（6〜8章）', enabled: true },
  { key: 'standard', emoji: '📘', label: '標準Kindle本', detail: '80〜120ページ／5〜8万字（12〜16章・30〜60分）', enabled: true },
  { key: 'flagship', emoji: '📙', label: '本命書籍', detail: '200ページ／10〜15万字', enabled: false },
  { key: 'miniseries', emoji: '📚', label: 'ミニシリーズ', detail: '40ページ×3冊', enabled: false },
] as const;
type WizardPreset = 'leadmagnet' | 'standard';

interface OutlineChapter {
  chapter_num: number;
  title: string;
  summary?: string;
  key_points?: string[];
  target_chars?: number;
  source_ids?: string[];
}
interface Outline {
  book_title: string;
  subtitle?: string;
  tagline?: string;
  target_reader?: string;
  unique_value?: string;
  chapters: OutlineChapter[];
  foreword_outline?: string;
  afterword_outline?: string;
}
interface WizardChapter {
  id: number;
  chapterNumber: number;
  title: string;
  summary: string;
  targetWordCount: number;
  content: string | null;
  status: string;
}

/* 233②: /api/kindle/wizard/verify のレスポンス（素材照合＋禁止表現・表示のみ） */
interface KindleVerifyChapter {
  chapterId: number;
  chapterNumber: number;
  title: string;
  ungrounded: UngroundedTerm[];
  banned: BannedExpression[];
}
interface KindleVerifyResponse {
  chapters: KindleVerifyChapter[];
  materialCount: number;
  groundingSkipped: boolean;
  totalUngrounded: number;
  totalBanned: number;
  ranAt: string;
}

const statusIcon = (s: string) => (s === 'completed' ? '✅' : s === 'failed' ? '❌' : s === 'writing' ? '⏳' : '⬜');

// 全ステップ共通の右下固定フッターバー（223改善-1）。
// .page-enter(dashboard main)のfadeInにtransformがあり、配下のfixedはビューポートに
// 効かないため createPortal(document.body) 必須（189の教訓・ShortcutPaletteと同方式）。
// z-indexはショートカット小窓(950)より下の900で干渉を避ける。
function WizardFooterBar({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 99,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        maxWidth: 'calc(100vw - 32px)',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// 汎用モーダル（224: ✏️手動編集・👁前後比較で使用）。
// WizardFooterBarと同じ理由で createPortal(document.body) 必須（189の教訓）。
// z-indexはフッター(900)より上・ショートカット小窓(950)より下の940。
function WizardModal({
  title,
  onClose,
  children,
  width = 860,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 940, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: width, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }} title="閉じる">✕</button>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const cardBtn = (active: boolean, disabled = false): React.CSSProperties => ({
  padding: '14px 16px',
  borderRadius: 12,
  border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-soft)' : 'var(--bg-secondary)',
  color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  textAlign: 'left',
  opacity: disabled ? 0.55 : 1,
  transition: 'border-color 0.15s',
});

const primaryBtn: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  whiteSpace: 'nowrap',
};

function KindleWizardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  /* ① 素材 */
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  // 229A: 素材ソースのタブ（選択はタブ横断で保持＝DR+note混在可・上限は合算）
  const [sourceTab, setSourceTab] = useState<KindleMaterialSource>('deepresearch');

  /* ②③ 設定 */
  // 225a: 複数目的（221案ii）。選択順を保持する配列＋④で表示中の目的（タブ）。
  // 単一選択時の挙動（seriesKey=null・従来フロー）は完全互換
  const [purposeKeys, setPurposeKeys] = useState<KindlePurposeKey[]>([]);
  const [activePurpose, setActivePurpose] = useState<KindlePurposeKey | null>(null);
  const [styleKey, setStyleKey] = useState<KindleStyleKey>(DEFAULT_KINDLE_STYLE);
  const [preset, setPreset] = useState<WizardPreset>('leadmagnet');
  const [theme, setTheme] = useState('');

  /* ④ 目次（225a: 目的ごとに分岐＝purposeKeyキーのRecord） */
  const [outlines, setOutlines] = useState<Record<string, Outline | null>>({});
  const [outlineLoading, setOutlineLoading] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  /* ⑤⑥ 本 */
  const [bookId, setBookId] = useState<number | null>(null);
  const [book, setBook] = useState<any>(null);
  const [chapters, setChapters] = useState<WizardChapter[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentChapterId, setCurrentChapterId] = useState<number | null>(null);
  const [liveChars, setLiveChars] = useState(0);
  const [genError, setGenError] = useState('');
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ⑤ 自動校正（224） */
  const [proofreading, setProofreading] = useState(false);
  const [proofChapterId, setProofChapterId] = useState<number | null>(null);
  const [proofErrors, setProofErrors] = useState<Record<string, string>>({});
  const [expandedIssuesId, setExpandedIssuesId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<WizardChapter | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [diffTarget, setDiffTarget] = useState<WizardChapter | null>(null);
  const proofStartedRef = useRef(false);

  /* 235: 実際に生成したモデル（Claude上限時はGeminiへ自動フォールバック）。
     無言で品質が変わる状態を作らないため、切り替わったら画面に明示する。 */
  const [aiProvider, setAiProvider] = useState<{ provider: string; modelLabel: string } | null>(null);

  /* ⑤ 採点（236A: 診断。224の校正＝個別修正とは役割が別） */
  const [scoreBusyId, setScoreBusyId] = useState<number | null>(null);
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [expandedScoreId, setExpandedScoreId] = useState<number | null>(null);
  const [scoringAll, setScoringAll] = useState(false);

  /* ⑤ テイスト変換（236B/C: サンプル比較 → 全文変換 → 左右diff → 適用/破棄） */
  const [tasteTarget, setTasteTarget] = useState<WizardChapter | null>(null);
  const [tasteSamples, setTasteSamples] = useState<Record<string, string> | null>(null);
  const [tasteBusy, setTasteBusy] = useState<'samples' | 'convert' | 'apply' | null>(null);
  const [tasteError, setTasteError] = useState('');
  const [tasteConverted, setTasteConverted] = useState<{ tasteKey: string; tasteLabel: string; original: string; revised: string } | null>(null);

  /* ⑤ 内容検証（233②: 素材照合＋禁止表現。AI呼び出しなし・表示のみ） */
  const [verify, setVerify] = useState<KindleVerifyResponse | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyOpenId, setVerifyOpenId] = useState<number | null>(null);
  const verifyStartedRef = useRef(false);

  /* ⑤ 章まとめ（227【A】【B】） */
  const [expandedSummaryId, setExpandedSummaryId] = useState<number | null>(null);
  const [summaryBusyId, setSummaryBusyId] = useState<number | null>(null);
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({});
  const [draftPoints, setDraftPoints] = useState<string[] | null>(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [appendBusyId, setAppendBusyId] = useState<number | null>(null);

  /* ⑥ 巻末「全章まとめ」トグル（既定ON） */
  const [includeBookSummary, setIncludeBookSummary] = useState(true);
  // 232: ⑥本文のリッチコピー（Word等に体裁付きで貼れる）の完了フィードバック
  const [outputCopied, setOutputCopied] = useState(false);
  // 229B: 📝noteに展開モーダルと、このセッションで保存した記事（🔗関連セクションへ即時反映）
  const [showToNote, setShowToNote] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<Array<{ id: string; title: string }>>([]);

  /* ⑥ 画像（226 Phase1: 表紙＋章扉） */
  const [imageModal, setImageModal] = useState<{ slot: 'cover' | 'chapter'; chapter?: WizardChapter } | null>(null);
  const [imgEngine, setImgEngine] = useState<ImageModelKey>('gpt-image-2');
  const [imgStyle, setImgStyle] = useState<KindleImageStyleKey>(DEFAULT_KINDLE_IMAGE_STYLE);
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgDrafting, setImgDrafting] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgDeleting, setImgDeleting] = useState<string | null>(null);

  /* ⑥ まとめ画像（227【C】: 方式b=プログラム描画・文字100%正確） */
  const [sumImgTemplate, setSumImgTemplate] = useState<SummaryImageTemplateKey>(DEFAULT_SUMMARY_IMAGE_TEMPLATE);
  const [sumImgBusy, setSumImgBusy] = useState<string | null>(null);
  const [sumImgError, setSumImgError] = useState('');

  /* 225b: 出版・販促アセット（⑥・kindle-studio吸収） */
  const [assetBusy, setAssetBusy] = useState<string | null>(null);
  const [assetError, setAssetError] = useState('');
  const [assetOpen, setAssetOpen] = useState<Record<string, boolean>>({});
  const [assetCopied, setAssetCopied] = useState<string | null>(null);

  /* 作成中の本一覧 */
  const [wizardBooks, setWizardBooks] = useState<any[]>([]);

  /* ── 初期ロード（229A: DR+note記事／231: テキスト分析=ana-N名前空間で混載） ── */
  useEffect(() => {
    // 231: text_analysis_saves の一覧v2は本文非返却＝char_count を使う。①の行として混載できる形に正規化
    const normalizeAnalysisItem = (row: any, contentIncluded = false) => ({
      id: `ana-${row.id}`,
      title: row.auto_title || row.file_name || '無題',
      content: contentIncluded ? row.content || '' : '',
      char_count: row.char_count ?? (contentIncluded ? (row.content || '').length : 0),
      created_at: row.created_at,
      type: 'analysis',
      is_favorite: row.favorite ? 1 : 0,
      tags: Array.isArray(row.tags) ? row.tags.join(',') : row.tags || '',
    });

    (async () => {
      try {
        const lists = await Promise.all([
          ...KINDLE_MATERIAL_SOURCES.map((t) =>
            fetch(`/api/library?type=${t}`)
              .then((r) => r.json())
              .then((data) => (Array.isArray(data) ? data : []))
              .catch(() => []),
          ),
          fetch(`/api/text-analysis/saves?limit=100`)
            .then((r) => r.json())
            .then((data) => (Array.isArray(data?.items) ? data.items.map((row: any) => normalizeAnalysisItem(row)) : []))
            .catch(() => []),
        ]);
        let arr = lists.flat();

        // 230【B-1】: リサーチ保存/テキスト分析からのhandoff（読取後削除=冪等。C23は素の遷移でキー無し→影響なし）
        try {
          const raw = sessionStorage.getItem('lumina_kindle_selected');
          if (raw) {
            sessionStorage.removeItem('lumina_kindle_selected');
            // ?bookId= 復帰（④確定後）のときは素材選択を上書きしない
            if (!new URLSearchParams(window.location.search).get('bookId')) {
              const ids: unknown = JSON.parse(raw);
              if (Array.isArray(ids)) {
                const keys = ids.map(String);
                // 231: 一覧100件に載っていない ana-N は ?ids= で追い取得（取りこぼし防止）
                const missingAna = keys
                  .map((k) => /^ana-(\d+)$/.exec(k))
                  .filter((m): m is RegExpExecArray => !!m && !arr.some((i: any) => String(i.id) === m[0]))
                  .map((m) => Number(m[1]));
                if (missingAna.length > 0) {
                  const extra = await fetch(`/api/text-analysis/saves?ids=${missingAna.join(',')}`)
                    .then((r) => r.json())
                    .then((data) => (Array.isArray(data?.items) ? data.items.map((row: any) => normalizeAnalysisItem(row, true)) : []))
                    .catch(() => []);
                  arr = [...arr, ...extra];
                }
                const idSet = new Set(keys);
                const take = arr.filter((i: any) => idSet.has(String(i.id))).slice(0, MAX_KINDLE_SOURCES);
                if (take.length > 0) {
                  setSelectedIds(new Set(take.map((i: any) => String(i.id))));
                  setSourceTab((take[0].type ?? 'deepresearch') as KindleMaterialSource);
                }
              }
            }
          }
        } catch {
          /* handoff失敗時は通常の未選択状態で開く（選び直せる） */
        }

        setItems(arr);
      } finally {
        setItemsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetch('/api/kindle')
      .then((r) => r.json())
      .then((data) => {
        const books = Array.isArray(data?.books) ? data.books : [];
        setWizardBooks(books.filter((b: any) => b?.bookMeta?.origin === 'wizard' && b.status !== 'completed'));
      })
      .catch(() => {});
  }, []);

  /* ?bookId= 復帰（④確定以降はDBが正） */
  const loadBook = useCallback(async (id: number): Promise<WizardChapter[]> => {
    const res = await fetch(`/api/kindle?id=${id}`);
    if (!res.ok) throw new Error(`書籍の読み込みに失敗しました (${res.status})`);
    const data = await res.json();
    setBook(data.book);
    const chs: WizardChapter[] = (data.chapters || []).map((c: any) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      summary: c.summary,
      targetWordCount: c.targetWordCount,
      content: c.content,
      status: c.status,
    }));
    setChapters(chs);
    return chs;
  }, []);

  useEffect(() => {
    const q = searchParams.get('bookId');
    if (!q) return;
    const id = parseInt(q, 10);
    if (!Number.isFinite(id)) return;
    setBookId(id);
    loadBook(id)
      .then((chs) => {
        const allDone = chs.length > 0 && chs.every((c) => c.status === 'completed');
        setStep(allDone ? 6 : 5);
      })
      .catch((e) => setError(e.message));
  }, [searchParams, loadBook]);

  /* 233②: 本が切り替わったら内容検証の結果と自動実行フラグをリセット
     （別の本の警告が残って見えるのを防ぐ＝fail-closed） */
  useEffect(() => {
    verifyStartedRef.current = false;
    setVerify(null);
    setVerifyError('');
    setVerifyOpenId(null);
  }, [bookId]);

  /* 生成中の離脱警告 */
  useEffect(() => {
    if (!generating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [generating]);

  /* ── ① 素材選択 ── */
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inTab = items.filter((i) => (i.type || 'deepresearch') === sourceTab);
    if (!q) return inTab;
    return inTab.filter((i) => (i.title || '').toLowerCase().includes(q));
  }, [items, search, sourceTab]);

  const selectedItems = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds]);
  // 231: ana-行は一覧が本文非返却のため char_count を優先（最終判定はサーバ側の実測）
  const totalChars = useMemo(
    () => selectedItems.reduce((sum, i) => sum + (i.char_count ?? (i.content || '').length), 0),
    [selectedItems],
  );
  const titleById = useMemo(() => new Map(items.map((i) => [String(i.id), i.title || '(無題)'])), [items]);
  // 229A: ④の素材バッジで種別絵文字（🗂/📝）を出すためのマップ
  const sourceEmojiById = useMemo(
    () =>
      new Map(
        items.map((i) => [
          String(i.id),
          KINDLE_MATERIAL_SOURCE_META[(i.type || 'deepresearch') as KindleMaterialSource]?.emoji ?? '📄',
        ]),
      ),
    [items],
  );

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= MAX_KINDLE_SOURCES) {
          alert(`素材は最大${MAX_KINDLE_SOURCES}件までです`);
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const confirmMaterials = async () => {
    setError('');
    setValidating(true);
    try {
      const res = await fetch('/api/kindle/wizard/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `検証に失敗しました (${res.status})`);
      if (data.missingCount > 0) throw new Error(`選択素材のうち${data.missingCount}件が見つかりません（削除済みの可能性）`);
      if (!data.ok) throw new Error(data.error || '素材が上限を超えています');
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setValidating(false);
    }
  };

  /* ── ④ 目次生成・編集 ── */
  // 225a: 目的1つぶんの目次生成（複数目的は呼び出し側が直列に回す）
  const generateOutline = async (purpose: KindlePurposeKey) => {
    setError('');
    setOutlineLoading((prev) => ({ ...prev, [purpose]: true }));
    try {
      const res = await fetch('/api/kindle/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: Array.from(selectedIds),
          purposeKey: purpose,
          styleKey,
          preset,
          theme: theme.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `目次生成に失敗しました (${res.status})`);
      // 235: どのモデルで生成したかを記録（Geminiフォールバック時に画面へ明示）
      if (data._ai?.provider) setAiProvider(data._ai);
      setOutlines((prev) => ({ ...prev, [purpose]: data }));
    } catch (e: any) {
      setError(`${KINDLE_PURPOSES[purpose].label}の目次: ${e.message}`);
    } finally {
      setOutlineLoading((prev) => ({ ...prev, [purpose]: false }));
    }
  };

  // 未生成の目的ぶんを直列生成（③→④遷移時・部分成功=失敗した目的は④タブから個別再生成）
  const generateMissingOutlines = async () => {
    for (const p of purposeKeys) {
      if (!outlines[p]) {
        // eslint-disable-next-line no-await-in-loop
        await generateOutline(p);
      }
    }
  };

  const patchOutline = (purpose: KindlePurposeKey, updater: (prev: Outline) => Outline) => {
    setOutlines((prev) => (prev[purpose] ? { ...prev, [purpose]: updater(prev[purpose]!) } : prev));
  };
  const updateChapter = (purpose: KindlePurposeKey, idx: number, patch: Partial<OutlineChapter>) => {
    patchOutline(purpose, (prev) => ({
      ...prev,
      chapters: prev.chapters.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };
  const moveChapter = (purpose: KindlePurposeKey, idx: number, dir: -1 | 1) => {
    patchOutline(purpose, (prev) => {
      const next = [...prev.chapters];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...prev, chapters: next };
    });
  };
  const deleteChapter = (purpose: KindlePurposeKey, idx: number) => {
    setOutlines((prev) => {
      const o = prev[purpose];
      if (!o || o.chapters.length <= 1) return prev;
      if (!confirm(`第${idx + 1}章を削除しますか？`)) return prev;
      return { ...prev, [purpose]: { ...o, chapters: o.chapters.filter((_, i) => i !== idx) } };
    });
  };

  // 225a: 目的ごとに1冊ずつ作成（直列）。複数目的時のみ共通seriesKeyで束ねる（単一時はnull=従来互換）。
  // 先頭の1冊で⑤へ入り、残りは「作成中の本」（シリーズ束ね表示）から1冊ずつ進める
  const confirmOutline = async () => {
    if (purposeKeys.length === 0) return;
    for (const p of purposeKeys) {
      const o = outlines[p];
      if (!o) {
        setError(`${KINDLE_PURPOSES[p].label}の目次がまだ生成されていません（④のタブで生成してください）`);
        return;
      }
      if (o.chapters.some((c) => !c.title.trim())) {
        setError(`${KINDLE_PURPOSES[p].label}の目次に章タイトルが空の章があります`);
        return;
      }
    }
    setError('');
    setCreating(true);
    try {
      const seriesKey = purposeKeys.length > 1 ? `wz-${crypto.randomUUID()}` : null;
      const createdIds: number[] = [];
      for (const p of purposeKeys) {
        const o = outlines[p]!;
        // 並び替え・削除を反映して章番号を連番に振り直す
        const normalized = {
          ...o,
          chapters: o.chapters.map((c, i) => ({ ...c, chapter_num: i + 1 })),
        };
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch('/api/kindle/wizard/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outline: normalized,
            sourceIds: Array.from(selectedIds),
            purposeKey: p,
            styleKey,
            preset,
            seriesKey,
          }),
        });
        // eslint-disable-next-line no-await-in-loop
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(`${KINDLE_PURPOSES[p].label}: ${data.error || `作成に失敗しました (${res.status})`}${createdIds.length > 0 ? `（作成済みの${createdIds.length}冊は「作成中の本」に残っています）` : ''}`);
        }
        createdIds.push(data.bookId);
      }
      const firstId = createdIds[0];
      setBookId(firstId);
      await loadBook(firstId);
      // 以降はDBが正: リロード・離脱しても ?bookId= で復帰できる
      router.replace(`/dashboard/kindle-wizard?bookId=${firstId}`);
      setStep(5);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  /* ── ⑤ 本文生成（直列キュー: 前章文脈注入のため並列不可・失敗時は停止） ── */
  const generateOne = async (ch: WizardChapter): Promise<{ ok: boolean; message?: string }> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setCurrentChapterId(ch.id);
    setLiveChars(0);
    setChapters((prev) => prev.map((c) => (c.id === ch.id ? { ...c, status: 'writing' } : c)));
    try {
      const res = await fetch('/api/kindle/generate-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: ch.id }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `生成リクエスト失敗 (${res.status})`;
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {}
        return { ok: false, message: msg };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let done = false;
      let errMsg = '';
      while (true) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'delta') setLiveChars((c) => c + String(ev.text || '').length);
            // 235: Claudeが流し始めてからGeminiに切り替わった場合、途中まで出た分の重複を捨てる
            else if (ev.type === 'reset') setLiveChars(0);
            else if (ev.type === 'done') {
              done = true;
              if (ev.ai?.provider) setAiProvider(ev.ai as { provider: string; modelLabel: string });
            }
            else if (ev.type === 'error') errMsg = ev.message || '生成エラー';
          } catch {}
        }
      }
      if (!done) return { ok: false, message: errMsg || 'ストリームが完了しませんでした（再試行してください）' };
      return { ok: true };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { ok: false, message: '中断しました' };
      return { ok: false, message: String(e?.message || e) };
    } finally {
      abortRef.current = null;
      setCurrentChapterId(null);
    }
  };

  const runQueue = async () => {
    if (!bookId || generating) return;
    setGenerating(true);
    setGenError('');
    stopRef.current = false;
    try {
      let chs = await loadBook(bookId);
      // 直列: 章番号順に未完了（pending/failed）を1章ずつ。失敗時はスキップせず停止
      for (const ch of chs.filter((c) => c.status !== 'completed').sort((a, b) => a.chapterNumber - b.chapterNumber)) {
        if (stopRef.current) break;
        const result = await generateOne(ch);
        chs = await loadBook(bookId);
        if (!result.ok) {
          if (!stopRef.current) {
            setGenError(`第${ch.chapterNumber}章で停止: ${result.message}（後続章は前章の文脈を使うため、再試行してから続行してください）`);
          }
          break;
        }
      }
    } catch (e: any) {
      setGenError(String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  };

  const stopQueue = () => {
    stopRef.current = true;
    abortRef.current?.abort();
  };

  const completedCount = chapters.filter((c) => c.status === 'completed').length;
  const allDone = chapters.length > 0 && completedCount === chapters.length;

  /* ── ⑤.5 自動校正（224: 全章完了後に一括自動実行・提案のみ表示→個別適用） ── */
  const proofread: KindleBookProofread = book?.bookMeta?.proofread ?? {};
  const hasProofData = !!book?.bookMeta?.proofread;

  /* ── ⑤.6 章まとめ（227【B】: book_meta.summaries 章IDキー・編集後が常にソース） ── */
  const summaries: KindleBookSummaries = book?.bookMeta?.summaries ?? {};

  // 戻り値: エラーメッセージ（成功時は空文字）。fail-closed=失敗しても既存まとめ・本文は無傷
  const summarizeOne = useCallback(
    async (chapterId: number): Promise<string> => {
      try {
        const res = await fetch('/api/kindle/wizard/summaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, chapterId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return data.error || `まとめ生成に失敗 (${res.status})`;
        return '';
      } catch (e: any) {
        return String(e?.message || e);
      }
    },
    [bookId],
  );

  // 戻り値: エラーメッセージ（成功時は空文字）。fail-closed=失敗しても本文・既存データは無傷
  const proofreadOne = useCallback(
    async (chapterId: number): Promise<string> => {
      try {
        const res = await fetch('/api/kindle/wizard/proofread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, chapterId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return data.error || `校正リクエスト失敗 (${res.status})`;
        return '';
      } catch (e: any) {
        return String(e?.message || e);
      }
    },
    [bookId],
  );

  const proofreadGlobal = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch('/api/kindle/wizard/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, global: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || `全体整合の確認に失敗 (${res.status})`;
      return '';
    } catch (e: any) {
      return String(e?.message || e);
    }
  }, [bookId]);

  // 章単位1リクエストの直列＋全体整合1回＋章まとめ生成（227【B】: 校正キューの後段に連結）。
  // 失敗章はスキップして続行（章間依存なし）し、章ごとに⚠️＋🔄再試行を出す（212方式）。
  // 実行済みの章はスキップ（やり直しは章ごとの🔄）。
  const runProofread = useCallback(async () => {
    if (!bookId || proofreading) return;
    setProofreading(true);
    const errs: Record<string, string> = {};
    const sErrs: Record<string, string> = {};
    try {
      const res = await fetch(`/api/kindle?id=${bookId}`);
      if (!res.ok) throw new Error(`書籍の読み込みに失敗しました (${res.status})`);
      const data = await res.json();
      const existing = data?.book?.bookMeta?.proofread ?? {};
      const existingSummaries = data?.book?.bookMeta?.summaries ?? {};
      const targets = (data.chapters || [])
        .filter((c: any) => c.status === 'completed')
        .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
      for (const c of targets) {
        if (existing.chapters?.[String(c.id)]) continue;
        setProofChapterId(c.id);
        const err = await proofreadOne(c.id);
        if (err) errs[String(c.id)] = err;
      }
      setProofChapterId(null);
      if (!existing.global) {
        const gerr = await proofreadGlobal();
        if (gerr) errs.global = gerr;
      }
      // 227【B】: 章まとめの自動生成（校正の後段・章ごと直列）
      for (const c of targets) {
        if (existingSummaries[String(c.id)]) continue;
        setSummaryBusyId(c.id);
        const err = await summarizeOne(c.id);
        if (err) sErrs[String(c.id)] = err;
      }
      setSummaryBusyId(null);
      await loadBook(bookId);
    } catch (e: any) {
      errs.run = String(e?.message || e);
    } finally {
      setProofErrors(errs);
      setSummaryErrors(sErrs);
      setProofreading(false);
      setProofChapterId(null);
      setSummaryBusyId(null);
    }
  }, [bookId, proofreading, proofreadOne, proofreadGlobal, summarizeOne, loadBook]);

  const retryChapterProofread = useCallback(
    async (chapterId: number) => {
      if (!bookId || proofreading) return;
      setProofreading(true);
      setProofChapterId(chapterId);
      const err = await proofreadOne(chapterId);
      setProofErrors((prev) => {
        const next = { ...prev };
        if (err) next[String(chapterId)] = err;
        else delete next[String(chapterId)];
        return next;
      });
      await loadBook(bookId);
      setProofreading(false);
      setProofChapterId(null);
    },
    [bookId, proofreading, proofreadOne, loadBook],
  );

  const retryGlobalProofread = useCallback(async () => {
    if (!bookId || proofreading) return;
    setProofreading(true);
    const err = await proofreadGlobal();
    setProofErrors((prev) => {
      const next = { ...prev };
      if (err) next.global = err;
      else delete next.global;
      return next;
    });
    await loadBook(bookId);
    setProofreading(false);
  }, [bookId, proofreading, proofreadGlobal, loadBook]);

  // 全章完了の検知→自動で校正を一括実行（初回のみ。復帰時に結果があれば再実行しない）
  useEffect(() => {
    if (step !== 5 || generating || proofreading) return;
    if (!bookId || !book || chapters.length === 0) return;
    if (!chapters.every((c) => c.status === 'completed')) return;
    if (book.bookMeta?.proofread) return;
    if (proofStartedRef.current) return;
    proofStartedRef.current = true;
    runProofread();
  }, [step, generating, proofreading, bookId, book, chapters, runProofread]);

  /* ── ⑤.7 内容検証（233②: 素材照合＋禁止表現） ──
     AI呼び出しゼロなので全章完了時に自動実行してよい（校正キューと違い数百msで返る）。
     結果はDBに保存せず画面表示のみ＝本文は絶対に書き換えない（RULES.md R-26）。 */
  const runVerify = useCallback(async () => {
    if (!bookId || verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError('');
    try {
      const res = await fetch('/api/kindle/wizard/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json().catch(() => ({}));
      // fail-closed: 失敗時は前回結果を残さない（「警告0件」に見えるのがいちばん危ない）
      if (!res.ok) {
        setVerify(null);
        setVerifyError(data.error || `内容検証に失敗 (${res.status})`);
        return;
      }
      setVerify(data as KindleVerifyResponse);
    } catch (e: any) {
      setVerify(null);
      setVerifyError(String(e?.message || e));
    } finally {
      setVerifyBusy(false);
    }
  }, [bookId, verifyBusy]);

  // 全章完了の検知→自動で内容検証（本ロード1回につき1度。🔄で再実行できる）
  // ⑥からの復帰（?bookId= で allDone なら step=6 に入る）でも走らせる＝出力直前に必ず結果がある
  useEffect(() => {
    if ((step !== 5 && step !== 6) || generating || !bookId || chapters.length === 0) return;
    if (!chapters.every((c) => c.status === 'completed')) return;
    if (verifyStartedRef.current) return;
    verifyStartedRef.current = true;
    runVerify();
  }, [step, generating, bookId, chapters, runVerify]);

  // 校正提案（suggestion）への禁止表現チェック（233②「校正提案・生成本文の双方に適用」）。
  // 純関数なのでクライアントで実行できる＝提案リストを開いた時点で即バッジが出る。
  const suggestionBanned = useCallback(
    (issue: KindleProofreadIssue) => findBannedExpressions(issue.suggestion, { maxResults: 3 }),
    [],
  );

  /* ── 236A: 章の採点（診断） ── */
  const scores: KindleBookScores = book?.bookMeta?.scores ?? {};

  // 戻り値: エラーメッセージ（成功時は空文字）。fail-closed=失敗しても既存スコア・本文は無傷
  const scoreOne = useCallback(
    async (chapterId: number): Promise<string> => {
      try {
        const res = await fetch('/api/kindle/wizard/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, chapterId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return data.error || `採点に失敗 (${res.status})`;
        if (data.score?.provider) setAiProvider({ provider: data.score.provider, modelLabel: data.score.modelLabel });
        return '';
      } catch (e: any) {
        return String(e?.message || e);
      }
    },
    [bookId],
  );

  const scoreChapter = async (c: WizardChapter) => {
    if (!bookId || scoreBusyId !== null || scoringAll) return;
    setScoreBusyId(c.id);
    const err = await scoreOne(c.id);
    setScoreErrors((prev) => {
      const next = { ...prev };
      if (err) next[String(c.id)] = err;
      else delete next[String(c.id)];
      return next;
    });
    if (!err) setExpandedScoreId(c.id);
    await loadBook(bookId);
    setScoreBusyId(null);
  };

  // 全章採点は直列（並列にするとレート制限に当たりやすく、失敗章の切り分けもしづらい）
  const scoreAllChapters = async () => {
    if (!bookId || scoringAll || scoreBusyId !== null) return;
    setScoringAll(true);
    const errs: Record<string, string> = {};
    try {
      for (const c of chapters.filter((ch) => ch.status === 'completed')) {
        setScoreBusyId(c.id);
        const err = await scoreOne(c.id);
        if (err) errs[String(c.id)] = err;
      }
      await loadBook(bookId);
    } finally {
      setScoreErrors(errs);
      setScoreBusyId(null);
      setScoringAll(false);
    }
  };

  /* ── 236B/C: テイスト変換（サンプル比較 → 全文変換 → 左右diff → 適用/破棄） ── */
  const openTastePanel = async (c: WizardChapter) => {
    setTasteTarget(c);
    setTasteSamples(null);
    setTasteConverted(null);
    setTasteError('');
    setTasteBusy('samples');
    try {
      const res = await fetch('/api/kindle/wizard/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: c.id, mode: 'samples' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `サンプル生成に失敗 (${res.status})`);
      if (data._ai?.provider) setAiProvider(data._ai);
      setTasteSamples(data.samples ?? {});
    } catch (e: any) {
      setTasteError(String(e?.message || e));
    } finally {
      setTasteBusy(null);
    }
  };

  const convertWithTaste = async (tasteKey: string) => {
    if (!tasteTarget || tasteBusy) return;
    setTasteError('');
    setTasteConverted(null);
    setTasteBusy('convert');
    try {
      const res = await fetch('/api/kindle/wizard/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: tasteTarget.id, mode: 'convert', tasteKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `変換に失敗 (${res.status})`);
      if (data._ai?.provider) setAiProvider(data._ai);
      setTasteConverted({ tasteKey: data.tasteKey, tasteLabel: data.tasteLabel, original: data.original, revised: data.revised });
    } catch (e: any) {
      setTasteError(String(e?.message || e));
    } finally {
      setTasteBusy(null);
    }
  };

  // 適用は院長がdiffを見た後の明示操作でのみ実行（サーバ側は変換結果を保存していない）
  const applyConverted = async () => {
    if (!tasteTarget || !tasteConverted || tasteBusy) return;
    setTasteBusy('apply');
    try {
      const res = await fetch('/api/kindle/chapters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tasteTarget.id, content: tasteConverted.revised }),
      });
      if (!res.ok) throw new Error(`本文の更新に失敗しました (${res.status})`);
      await loadBook(bookId!);
      setTasteTarget(null);
      setTasteConverted(null);
      setTasteSamples(null);
      // 本文が変わったので内容検証（233②）をやり直す＝素材外記述が増えていないか確認できる
      verifyStartedRef.current = true;
      runVerify();
    } catch (e: any) {
      setTasteError(String(e?.message || e));
    } finally {
      setTasteBusy(null);
    }
  };

  /* ── 227【A】【B】: まとめパネルの操作 ── */
  const openSummaryPanel = (c: WizardChapter) => {
    if (expandedSummaryId === c.id) {
      setExpandedSummaryId(null);
      setDraftPoints(null);
      return;
    }
    setExpandedSummaryId(c.id);
    const entry = summaries[String(c.id)];
    setDraftPoints(entry ? [...entry.points] : null);
  };

  // 🪄 生成/再生成（自動生成分は source:'auto'。既存があれば確認して上書き）
  const generateSummaryFor = async (c: WizardChapter, isRegenerate: boolean) => {
    if (!bookId || summaryBusyId !== null) return;
    if (isRegenerate && !confirm('まとめを再生成しますか？（現在の内容と編集は上書きされます）')) return;
    setSummaryBusyId(c.id);
    try {
      const res = await fetch('/api/kindle/wizard/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryErrors((prev) => ({ ...prev, [String(c.id)]: data.error || `まとめ生成に失敗 (${res.status})` }));
        return;
      }
      setSummaryErrors((prev) => {
        const next = { ...prev };
        delete next[String(c.id)];
        return next;
      });
      if (Array.isArray(data.summary?.points)) setDraftPoints([...data.summary.points]);
      await loadBook(bookId);
    } catch (e: any) {
      setSummaryErrors((prev) => ({ ...prev, [String(c.id)]: String(e?.message || e) }));
    } finally {
      setSummaryBusyId(null);
    }
  };

  // 💾 編集保存（source:'edited'。編集後のまとめが常にソース）
  const saveSummaryPoints = async (c: WizardChapter) => {
    if (!bookId || !draftPoints) return;
    const points = draftPoints.map((p) => p.trim()).filter((p) => p.length > 0);
    if (points.length === 0) {
      alert('要点が空です。1点以上入力してください');
      return;
    }
    setSummarySaving(true);
    try {
      const res = await fetch('/api/kindle/wizard/summaries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: c.id, points }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `保存に失敗しました (${res.status})`);
      setDraftPoints(points);
      await loadBook(bookId);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSummarySaving(false);
    }
  };

  // 📄 227【A】: 保存済みのまとめを本文末尾に「## この章のまとめ」として追記
  const appendSummaryToChapter = async (c: WizardChapter) => {
    if (!bookId || appendBusyId !== null) return;
    const entry = summaries[String(c.id)];
    if (!entry || entry.points.length === 0) {
      alert('先にまとめを生成・保存してください');
      return;
    }
    const content = (c.content || '').trimEnd();
    if (hasChapterEndSummary(content)) {
      alert('この章には既に章末まとめがあります（二重追記を防ぐため中止しました）');
      return;
    }
    setAppendBusyId(c.id);
    try {
      const next = `${content}\n\n${buildChapterSummaryBlock(entry.points)}\n`;
      const r = await fetch('/api/kindle/chapters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, content: next }),
      });
      if (!r.ok) throw new Error(`本文の更新に失敗しました (${r.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setAppendBusyId(null);
    }
  };

  const moveDraftPoint = (idx: number, dir: -1 | 1) => {
    setDraftPoints((prev) => {
      if (!prev) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  // ✅適用: ローカル置換→章PATCH（総文字数はサーバ側で再計算）→判断を記録。✕却下: 記録のみ
  const decideIssue = async (ch: WizardChapter, idx: number, issue: KindleProofreadIssue, decision: 'applied' | 'rejected') => {
    if (!bookId) return;
    try {
      if (decision === 'applied') {
        const content = ch.content || '';
        const next = applyProofreadFix(content, issue);
        if (next === content) {
          alert('該当箇所が本文に見つかりませんでした（編集済みの可能性）。✏️ 編集で直接修正してください');
          return;
        }
        const r = await fetch('/api/kindle/chapters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ch.id, content: next }),
        });
        if (!r.ok) throw new Error(`本文の更新に失敗しました (${r.status})`);
      }
      const r2 = await fetch('/api/kindle/wizard/proofread', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: ch.id, issueIndex: idx, decision }),
      });
      if (!r2.ok) throw new Error(`判断の記録に失敗しました (${r2.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  // ✏️ 手動編集の保存（空本文の上書き防止）
  const saveManualEdit = async () => {
    if (!editTarget || !bookId) return;
    if (!editText.trim()) {
      alert('本文が空です。空の内容では保存できません');
      return;
    }
    setEditSaving(true);
    try {
      const r = await fetch('/api/kindle/chapters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editTarget.id, content: editText }),
      });
      if (!r.ok) throw new Error(`保存に失敗しました (${r.status})`);
      await loadBook(bookId);
      setEditTarget(null);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setEditSaving(false);
    }
  };

  /* 👁 前後比較（未処理の提案を反映した場合のプレビュー） */
  const diffFixes: AppliedFix[] = useMemo(() => {
    if (!diffTarget) return [];
    const entry = proofread.chapters?.[String(diffTarget.id)];
    return (entry?.issues ?? [])
      .filter((i) => !i.status)
      .map((i) => ({ original: i.original, suggestion: i.suggestion, line: i.line, scope: i.scope, reason: i.reason }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffTarget, book]);
  const diffAfterText = useMemo(() => {
    if (!diffTarget) return '';
    let t = diffTarget.content || '';
    const entry = proofread.chapters?.[String(diffTarget.id)];
    for (const i of entry?.issues ?? []) {
      if (!i.status) t = applyProofreadFix(t, i);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffTarget, book]);

  /* ── ⑥ 出力 ── */
  const bookTitle = book?.title || '無題';
  const bookImages: KindleBookImages = book?.bookMeta?.images ?? {};
  const summaryImages: KindleSummaryImages = book?.bookMeta?.summaryImages ?? {};
  const bookAssets: KindleBookAssets = book?.bookMeta?.assets ?? {};
  const fullMarkdownBody = useMemo(() => {
    const imgs: KindleBookImages = book?.bookMeta?.images ?? {};
    const sumImgs: KindleSummaryImages = book?.bookMeta?.summaryImages ?? {};
    const parts: string[] = [];
    if (book?.subtitle) parts.push(`${book.subtitle}\n`);
    // 226: 表紙画像（あれば冒頭に）
    if (imgs.cover?.url) parts.push(`${buildImageLine('表紙', imgs.cover.url)}\n`);
    for (const c of [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)) {
      // 既存生成分の救済: 本文冒頭の章見出しH1を出力時に除去（DBは書き換えない）
      const body = stripLeadingChapterHeading((c.content || '').trim(), c.chapterNumber, c.title);
      // 226: 章扉画像（あれば見出し直下に）
      const door = imgs.chapters?.[String(c.id)];
      const doorLine = door?.url ? `${buildImageLine(`第${c.chapterNumber}章 扉`, door.url)}\n\n` : '';
      // 227【C】: 章まとめ画像（あれば章末に）
      const sumImg = sumImgs.chapters?.[String(c.id)];
      const sumImgLine = sumImg?.url ? `\n${buildImageLine(`第${c.chapterNumber}章 まとめ`, sumImg.url)}\n` : '';
      parts.push(`## 第${c.chapterNumber}章 ${c.title}\n\n${doorLine}${body}\n${sumImgLine}`);
    }
    // 227【B】: 巻末「全章まとめ」（ONのとき・まとめがある章のみ。MD/txt/Word共通）
    if (includeBookSummary) {
      const section = buildBookSummarySection(chapters, book?.bookMeta?.summaries ?? {});
      if (section) parts.push(`${section}\n`);
    }
    // 227【C】: 巻末まとめ一覧画像（あれば末尾に）
    if (sumImgs.book?.url) parts.push(`${buildImageLine('全章まとめ（一覧画像）', sumImgs.book.url)}\n`);
    return parts.join('\n');
  }, [book, chapters, includeBookSummary]);

  const downloadMd = () => triggerDownload(`${bookTitle.slice(0, 30)}.md`, `# ${bookTitle}\n\n${fullMarkdownBody}`);
  const downloadTxt = () =>
    triggerDownload(
      `${bookTitle.slice(0, 30)}.txt`,
      `${bookTitle}\n${'='.repeat(40)}\n\n${stripImageLines(fullMarkdownBody).replace(/^## /gm, '■ ')}`,
      'text/plain',
    );

  /* ── 226 Phase1: 画像（表紙・章扉）の操作 ── */
  const draftImagePrompt = async (slot: 'cover' | 'chapter', chapter?: WizardChapter) => {
    if (!bookId) return;
    setImgDrafting(true);
    setImgError('');
    try {
      const res = await fetch('/api/kindle/wizard/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft', bookId, slot, chapterId: chapter?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `プロンプトの起案に失敗 (${res.status})`);
      setImgPrompt(String(data.prompt || ''));
    } catch (e: any) {
      setImgError(String(e?.message || e));
    } finally {
      setImgDrafting(false);
    }
  };

  const openImageModal = (slot: 'cover' | 'chapter', chapter?: WizardChapter) => {
    setImageModal({ slot, chapter });
    setImgError('');
    const entry = slot === 'cover' ? bookImages.cover : bookImages.chapters?.[String(chapter?.id)];
    setImgEngine(((entry?.engine as ImageModelKey) && IMAGE_MODELS.some((m) => m.key === entry?.engine) ? entry!.engine : 'gpt-image-2') as ImageModelKey);
    setImgStyle((entry?.styleKey && entry.styleKey in KINDLE_IMAGE_STYLES ? entry.styleKey : DEFAULT_KINDLE_IMAGE_STYLE) as KindleImageStyleKey);
    if (entry?.prompt) {
      setImgPrompt(entry.prompt);
    } else {
      setImgPrompt('');
      draftImagePrompt(slot, chapter);
    }
  };

  const generateSlotImage = async () => {
    if (!bookId || !imageModal || imgGenerating) return;
    if (!imgPrompt.trim()) {
      setImgError('プロンプトが空です（🪄起案するか、直接入力してください）');
      return;
    }
    setImgGenerating(true);
    setImgError('');
    try {
      const res = await fetch('/api/kindle/wizard/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          bookId,
          slot: imageModal.slot,
          chapterId: imageModal.chapter?.id,
          engine: imgEngine,
          styleKey: imgStyle,
          prompt: imgPrompt.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `画像の生成に失敗 (${res.status})`);
      await loadBook(bookId);
      setImageModal(null);
    } catch (e: any) {
      setImgError(String(e?.message || e));
    } finally {
      setImgGenerating(false);
    }
  };

  /* ── 227【C】: まとめ画像（プログラム描画・編集後のまとめが常にソース） ── */
  const generateSummaryImage = async (target: 'chapter' | 'book', chapter?: WizardChapter) => {
    if (!bookId || sumImgBusy) return;
    const key = target === 'book' ? 'book' : `ch-${chapter?.id}`;
    setSumImgBusy(key);
    setSumImgError('');
    try {
      const res = await fetch('/api/kindle/wizard/summary-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, target, chapterId: chapter?.id, template: sumImgTemplate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `まとめ画像の生成に失敗 (${res.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      setSumImgError(String(e?.message || e));
    } finally {
      setSumImgBusy(null);
    }
  };

  const deleteSummaryImage = async (target: 'chapter' | 'book', chapter?: WizardChapter) => {
    if (!bookId || sumImgBusy) return;
    if (!confirm('このまとめ画像を削除して不使用にしますか？')) return;
    const key = target === 'book' ? 'book' : `ch-${chapter?.id}`;
    setSumImgBusy(key);
    try {
      const res = await fetch('/api/kindle/wizard/summary-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, target, chapterId: chapter?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `削除に失敗 (${res.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSumImgBusy(null);
    }
  };

  /* 225b: 出版・販促アセットの生成/削除/コピー */
  const generateAsset = async (kind: KindleAssetKind) => {
    if (!bookId || assetBusy) return;
    setAssetBusy(kind);
    setAssetError('');
    try {
      const res = await fetch('/api/kindle/wizard/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `生成に失敗 (${res.status})`);
      await loadBook(bookId);
      setAssetOpen((prev) => ({ ...prev, [kind]: true }));
    } catch (e: any) {
      setAssetError(String(e?.message || e));
    } finally {
      setAssetBusy(null);
    }
  };
  const deleteAsset = async (kind: KindleAssetKind) => {
    if (!bookId || assetBusy) return;
    if (!confirm(`${KINDLE_ASSET_META[kind].label}を削除しますか？（🔄再生成できます）`)) return;
    setAssetBusy(kind);
    try {
      const res = await fetch('/api/kindle/wizard/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `削除に失敗 (${res.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      setAssetError(String(e?.message || e));
    } finally {
      setAssetBusy(null);
    }
  };
  const copyAsset = async (kind: KindleAssetKind) => {
    const entry = bookAssets[kind];
    if (!entry) return;
    const ok = await copyRichMarkdown(`# ${bookTitle}｜${KINDLE_ASSET_META[kind].label}\n\n${kindleAssetToText(kind, entry.data)}`);
    if (ok) {
      setAssetCopied(kind);
      setTimeout(() => setAssetCopied(null), 2000);
    }
  };

  const deleteSlotImage = async (slot: 'cover' | 'chapter', chapter?: WizardChapter) => {
    if (!bookId || imgDeleting) return;
    if (!confirm('この画像を削除して不使用にしますか？')) return;
    const key = slot === 'cover' ? 'cover' : `ch-${chapter?.id}`;
    setImgDeleting(key);
    try {
      const res = await fetch('/api/kindle/wizard/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, slot, chapterId: chapter?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `削除に失敗 (${res.status})`);
      await loadBook(bookId);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setImgDeleting(null);
    }
  };
  const downloadDocx = async () => {
    const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
    const meta = book?.bookMeta ?? {};
    await downloadMarkdownAsDocx({
      title: bookTitle,
      metaLines: [
        `作成日: ${new Date().toLocaleDateString('ja-JP')}`,
        `目的: ${KINDLE_PURPOSES[meta.purposeKey as KindlePurposeKey]?.label ?? '-'} ／ 文体: ${KINDLE_STYLES[meta.styleKey as KindleStyleKey]?.label ?? '-'}`,
      ],
      markdown: fullMarkdownBody,
      fileName: `${bookTitle.slice(0, 30)}.docx`,
    });
  };

  /* ── レンダリング ── */
  return (
    // paddingBottom: 右下固定フッターにコンテンツ末尾が隠れないよう余白を確保
    <div style={{ paddingBottom: 96 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📕 Kindle本づくり</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        ディープリサーチ結果やnote記事を束ねて、目的別のKindle本（まずはリードマグネット）を作成します。
      </p>

      {/* 作成中の本（復帰導線。225a: seriesKeyで束ね表示＋目的バッジ） */}
      {!bookId && wizardBooks.length > 0 && (
        <div style={{ marginBottom: 20, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>✍️ 作成中の本</div>
          {(() => {
            // seriesKeyごとにグルーピング（nullは従来どおり単独扱い）
            const groups = new Map<string | null, any[]>();
            for (const b of wizardBooks) {
              const key = typeof b?.bookMeta?.seriesKey === 'string' && b.bookMeta.seriesKey ? b.bookMeta.seriesKey : null;
              if (key === null) {
                groups.set(`single-${b.id}`, [b]);
              } else {
                groups.set(key, [...(groups.get(key) ?? []), b]);
              }
            }
            const bookBtn = (b: any) => {
              const p = KINDLE_PURPOSES[b?.bookMeta?.purposeKey as KindlePurposeKey];
              return (
                <button
                  key={b.id}
                  onClick={() => router.push(`/dashboard/kindle-wizard?bookId=${b.id}`)}
                  style={{ ...ghostBtn, display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  {p && <span style={{ fontSize: 11 }} title={p.label}>{p.emoji}</span>}
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{(b.title || '無題').slice(0, 24)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {(b.currentWordCount ?? 0).toLocaleString()}字 → 続きから
                  </span>
                </button>
              );
            };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...groups.entries()].map(([key, books]) =>
                  books.length > 1 ? (
                    <div key={key} style={{ padding: '8px 10px', border: '1px dashed var(--border)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                        📕 同じ素材から作ったシリーズ（{books.length}冊）
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{books.map(bookBtn)}</div>
                    </div>
                  ) : (
                    <div key={key} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{books.map(bookBtn)}</div>
                  ),
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ステップインジケーター */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {STEPS.map((s) => (
          <div
            key={s.num}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              fontSize: 12,
              fontWeight: step === s.num ? 700 : 400,
              background: step === s.num ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${step === s.num ? 'var(--accent)' : 'var(--border)'}`,
              color: step > s.num ? 'var(--accent)' : step === s.num ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {step > s.num ? '✓ ' : ''}
            {s.num}. {s.label}
          </div>
        ))}
      </div>

      {/* 235: Claudeが上限に達しGeminiで生成した場合の明示（無言で品質が変わる状態を作らない） */}
      {aiProvider?.provider === 'gemini' && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: '#3b82f6' }}>✨ {aiProvider.modelLabel}で生成</strong>
          <span style={{ color: 'var(--text-muted)' }}>
            {' '}— Claudeが利用上限のため自動で切り替えました。文体・構成の傾向がClaudeとは異なる場合があります。
          </span>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
          ❌ {error}
        </div>
      )}

      {/* ── ① 素材を選ぶ ── */}
      {step === 1 && (
        <div>
          {/* 229A: 素材ソースのタブ（🗂DR／📝note記事・混在選択可） */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {KINDLE_SOURCE_TABS.map((k) => {
              const meta = KINDLE_MATERIAL_SOURCE_META[k];
              const count = items.filter((i) => (i.type || 'deepresearch') === k).length;
              const selCount = items.filter((i) => (i.type || 'deepresearch') === k && selectedIds.has(i.id)).length;
              const active = sourceTab === k;
              return (
                <button
                  key={k}
                  onClick={() => setSourceTab(k)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    background: active ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {meta.emoji} {meta.label}（{count}）{selCount > 0 ? ` ☑${selCount}` : ''}
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>タブをまたいで混在選択できます（上限は合算）</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 タイトルで絞り込み..."
              style={{ flex: 1, minWidth: 200, maxWidth: 420, padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
            />
          </div>

          {itemsLoading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>読み込み中...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div>
                {sourceTab === 'deepresearch'
                  ? 'ディープリサーチ結果がありません。先に🔭ディープリサーチで調査・保存してください。'
                  : sourceTab === 'note-article'
                    ? 'note記事がありません。✍️note記事群生成などで作成し、ライブラリに保存すると表示されます。'
                    : 'テキスト分析の保存がありません。🗂テキスト分析で分析・保存すると表示されます（最新100件）。'}
              </div>
              {/* 230【B-3】: 逆方向の案内（リサーチ保存の選択モード→📖Kindle本にする） */}
              <div style={{ marginTop: 12, fontSize: 12 }}>
                <button onClick={() => router.push('/dashboard/library')} style={smallBtn}>
                  📚 リサーチ保存から選んで持ってくることもできます
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ gap: 12 }}>
              {filteredItems.map((item) => (
                <div key={item.id} style={{ minWidth: 0, height: '100%' }}>
                  <LibraryItemRow
                    item={item}
                    mergeMode={true}
                    selected={selectedIds.has(item.id)}
                    onSelectToggle={toggleSelect}
                    // 231: ana-行（テキスト分析）は/api/libraryの対象外のため⭐/🗑/📥は出さない
                    //（編集・削除は🗂テキスト分析の保存一覧で行う。素材選択には影響しない）
                    onFavoriteToggle={item.type === 'analysis' ? undefined : async (it) => {
                      const newVal = it.is_favorite ? 0 : 1;
                      await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, is_favorite: newVal }) });
                      setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, is_favorite: newVal } : i)));
                    }}
                    onDelete={item.type === 'analysis' ? undefined : async (id) => {
                      await fetch('/api/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                      setItems((prev) => prev.filter((i) => i.id !== id));
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                    }}
                    onExportMd={item.type === 'analysis' ? undefined : (it) => triggerDownload(`${(it.title || '無題').slice(0, 30)}.md`, `# ${it.title}\n\n${it.content || ''}`)}
                    onExpandToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                    isExpanded={expandedId === item.id}
                    variant="compact"
                  />
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ── ② 目的を選ぶ ── */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
            この本の目的を選んでください（構成・訴求・巻末CTAが変わります）。
            <strong>複数選ぶと、同じ素材から目的ごとに1冊ずつ＝シリーズとして作成します</strong>（目次は目的別に生成・編集できます）
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 20 }}>
            {KINDLE_PURPOSE_KEYS.map((key) => {
              const p = KINDLE_PURPOSES[key];
              return (
                <button
                  key={key}
                  onClick={() =>
                    setPurposeKeys((prev) => {
                      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
                      setActivePurpose(next[0] ?? null);
                      return next;
                    })
                  }
                  style={cardBtn(purposeKeys.includes(key))}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    {p.emoji} {p.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{p.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>→ {PURPOSE_HINTS[key]}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ③ 分量・文体を選ぶ ── */}
      {step === 3 && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 }}>分量プリセット</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ gap: 12, marginBottom: 20 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                disabled={!p.enabled}
                onClick={() => p.enabled && setPreset(p.key as WizardPreset)}
                style={cardBtn(p.key === preset, !p.enabled)}
                title={p.enabled ? undefined : '今後のアップデートで対応予定'}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  {p.emoji} {p.label}
                  {!p.enabled && <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>準備中</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.detail}</div>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 }}>文体（語り口）</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ gap: 12, marginBottom: 20 }}>
            {KINDLE_STYLE_KEYS.map((key) => {
              const s = KINDLE_STYLES[key];
              return (
                <button key={key} onClick={() => setStyleKey(key)} style={cardBtn(styleKey === key)}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                    {s.emoji} {s.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>{s.description}</div>
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>補足（任意）</p>
          <textarea
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="本に盛り込みたいこと・避けたいことがあれば（例: 新メニューの紹介を1章入れる）"
            rows={3}
            style={{ width: '100%', maxWidth: 720, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 20 }}
          />

        </div>
      )}

      {/* ── ④ 目次を生成・編集（225a: 目的ごとにタブで分岐） ── */}
      {step === 4 && (
        <div>
          {/* 目的タブ（複数目的時のみ表示。単一時は従来と同じ見た目） */}
          {purposeKeys.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {purposeKeys.map((p) => {
                const meta = KINDLE_PURPOSES[p];
                const ready = !!outlines[p];
                const active = activePurpose === p;
                return (
                  <button
                    key={p}
                    onClick={() => setActivePurpose(p)}
                    style={{
                      padding: '7px 16px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                      fontWeight: active ? 700 : 400,
                      background: active ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {meta.emoji} {meta.label}{outlineLoading[p] ? ' 🪄...' : ready ? ' ✓' : ' （未生成）'}
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const p = activePurpose ?? purposeKeys[0] ?? null;
            if (!p) return null;
            const outline = outlines[p] ?? null;
            if (outlineLoading[p]) {
              return (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🪄</div>
                  素材{selectedIds.size}件から{KINDLE_PURPOSES[p].label}の目次を生成中...（1分前後かかります）
                </div>
              );
            }
            if (!outline) {
              return (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <button onClick={() => generateOutline(p)} style={primaryBtn}>🪄 {KINDLE_PURPOSES[p].label}の目次を生成する</button>
                </div>
              );
            }
            return (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    書籍タイトル（編集可）{purposeKeys.length > 1 && ` — ${KINDLE_PURPOSES[p].emoji} ${KINDLE_PURPOSES[p].label}の1冊`}
                  </p>
                  <input
                    value={outline.book_title}
                    onChange={(e) => patchOutline(p, (prev) => ({ ...prev, book_title: e.target.value }))}
                    style={{ width: '100%', maxWidth: 720, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {outline.subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{outline.subtitle}</p>}
                  {outline.target_reader && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>👤 {outline.target_reader}</p>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {outline.chapters.map((c, idx) => (
                    <div key={idx} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>第{idx + 1}章</span>
                        <input
                          value={c.title}
                          onChange={(e) => updateChapter(p, idx, { title: e.target.value })}
                          style={{ flex: 1, minWidth: 0, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' }}
                        />
                        <button onClick={() => moveChapter(p, idx, -1)} disabled={idx === 0} style={{ ...smallBtn, opacity: idx === 0 ? 0.4 : 1 }} title="上へ">↑</button>
                        <button onClick={() => moveChapter(p, idx, 1)} disabled={idx === outline.chapters.length - 1} style={{ ...smallBtn, opacity: idx === outline.chapters.length - 1 ? 0.4 : 1 }} title="下へ">↓</button>
                        <button onClick={() => deleteChapter(p, idx)} disabled={outline.chapters.length <= 1} style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} title="この章を削除">🗑</button>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{c.summary}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>目標{(c.target_chars ?? 3500).toLocaleString()}字</span>
                        {(c.source_ids ?? []).map((sid) => (
                          <span key={sid} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                            {sourceEmojiById.get(sid) ?? '📄'} {String(titleById.get(sid) ?? sid).slice(0, 18)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── ⑤ 本文を生成 ── */}
      {step === 5 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{bookTitle}</div>
            <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 99, overflow: 'hidden', maxWidth: 480 }}>
              <div style={{ height: '100%', width: `${chapters.length ? (completedCount / chapters.length) * 100 : 0}%`, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {completedCount}/{chapters.length}章 完了 ・ 合計 {(book?.currentWordCount ?? 0).toLocaleString()}字
            </div>
          </div>

          {genError && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#dc2626', lineHeight: 1.6 }}>
              ❌ {genError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {chapters.map((c) => {
              const entry = proofread.chapters?.[String(c.id)];
              const pending = countPendingIssues(entry);
              const chErr = proofErrors[String(c.id)];
              return (
                <div key={c.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${c.status === 'failed' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{statusIcon(currentChapterId === c.id ? 'writing' : c.status)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>第{c.chapterNumber}章</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {currentChapterId === c.id
                        ? `${liveChars.toLocaleString()}字 生成中...`
                        : c.status === 'completed'
                          ? `${(c.content || '').length.toLocaleString()}字`
                          : `目標${(c.targetWordCount ?? 3500).toLocaleString()}字`}
                    </span>
                    {c.status === 'failed' && !generating && (
                      <button onClick={runQueue} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>🔄 再試行</button>
                    )}
                    {c.status === 'completed' && (
                      <button onClick={() => { setEditTarget(c); setEditText(c.content || ''); }} style={smallBtn} title="本文を直接編集">✏️ 編集</button>
                    )}
                    {proofreading && proofChapterId === c.id && (
                      <span style={{ fontSize: 11, color: '#8b5cf6', flexShrink: 0 }}>🔍 校正中...</span>
                    )}
                    {entry && (
                      <button
                        onClick={() => setExpandedIssuesId(expandedIssuesId === c.id ? null : c.id)}
                        style={{ ...smallBtn, color: pending > 0 ? '#8b5cf6' : 'var(--text-muted)', borderColor: pending > 0 ? 'rgba(139,92,246,0.4)' : 'var(--border)' }}
                      >
                        🔍 提案{entry.issues.length}件{pending > 0 ? `（未処理${pending}）` : ''} {expandedIssuesId === c.id ? '▲' : '▼'}
                      </button>
                    )}
                    {chErr && !proofreading && (
                      <button onClick={() => retryChapterProofread(c.id)} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }} title={chErr}>
                        ⚠️ 校正失敗・🔄 再試行
                      </button>
                    )}
                    {c.status === 'completed' && (
                      <button
                        onClick={() => openSummaryPanel(c)}
                        style={{ ...smallBtn, color: summaries[String(c.id)] ? 'var(--text-secondary)' : '#22c55e', borderColor: summaries[String(c.id)] ? 'var(--border)' : 'rgba(34,197,94,0.4)' }}
                        title="章の要点まとめ（巻末「全章まとめ」のソース）"
                      >
                        📝 まとめ{summaries[String(c.id)] ? '' : 'を追加'} {expandedSummaryId === c.id ? '▲' : '▼'}
                      </button>
                    )}
                    {/* 236A: 採点（診断）。校正＝個別修正とは別枠であることを説明文で明示している */}
                    {c.status === 'completed' && (() => {
                      const sc = scores[String(c.id)];
                      return (
                        <button
                          onClick={() => (sc ? setExpandedScoreId(expandedScoreId === c.id ? null : c.id) : scoreChapter(c))}
                          disabled={scoreBusyId !== null || scoringAll}
                          style={{
                            ...smallBtn,
                            color: sc ? scoreColor(sc.average) : '#3b82f6',
                            borderColor: sc ? `${scoreColor(sc.average)}66` : 'rgba(59,130,246,0.4)',
                            opacity: scoreBusyId !== null || scoringAll ? 0.5 : 1,
                          }}
                          title="この章を5観点で評価します（診断。修正は行いません）"
                        >
                          {scoreBusyId === c.id ? '採点中...' : sc ? `📊 ${sc.average.toFixed(1)} ${expandedScoreId === c.id ? '▲' : '▼'}` : '📊 採点'}
                        </button>
                      );
                    })()}
                    {/* 236B: テイスト変換（サンプル比較→全文変換→左右diff→適用） */}
                    {c.status === 'completed' && (
                      <button
                        onClick={() => openTastePanel(c)}
                        disabled={tasteBusy !== null}
                        style={{ ...smallBtn, color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.4)', opacity: tasteBusy !== null ? 0.5 : 1 }}
                        title="文章のテイストを選んで書き換えます（適用前に前後を並べて確認できます）"
                      >
                        ✨ テイスト変換
                      </button>
                    )}
                    {scoreErrors[String(c.id)] && scoreBusyId !== c.id && (
                      <button onClick={() => scoreChapter(c)} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }} title={scoreErrors[String(c.id)]}>
                        ⚠️ 採点失敗・🔄 再試行
                      </button>
                    )}
                    {summaryBusyId === c.id && <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>📝 まとめ生成中...</span>}
                    {summaryErrors[String(c.id)] && summaryBusyId !== c.id && !proofreading && (
                      <button onClick={() => generateSummaryFor(c, false)} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }} title={summaryErrors[String(c.id)]}>
                        ⚠️ まとめ失敗・🔄 再試行
                      </button>
                    )}
                  </div>

                  {/* 236A: 採点結果（診断）。修正は行わず、何をどう直すかの要点を出す */}
                  {expandedScoreId === c.id && scores[String(c.id)] && (() => {
                    const sc = scores[String(c.id)];
                    return (
                      <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            📊 採点（診断）: 平均 <span style={{ color: scoreColor(sc.average) }}>{sc.average.toFixed(1)}</span> / 5.0
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            採点は「どこが弱いか」の診断です。文言の個別修正は「🔍 提案」（自動校正）で行います
                          </span>
                          <button onClick={() => scoreChapter(c)} disabled={scoreBusyId !== null || scoringAll} style={{ ...smallBtn, marginLeft: 'auto', opacity: scoreBusyId !== null || scoringAll ? 0.5 : 1 }}>
                            🔄 再採点
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                          {KINDLE_SCORE_AXES.map((axis) => {
                            const v = sc.scores[axis.key] ?? 0;
                            return (
                              <div key={axis.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                                <span style={{ width: 100, flexShrink: 0, color: 'var(--text-secondary)' }}>{axis.label}</span>
                                <span style={{ letterSpacing: 1, color: scoreColor(v) }}>{'★'.repeat(v)}{'☆'.repeat(5 - v)}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{axis.criteria}</span>
                              </div>
                            );
                          })}
                        </div>

                        {sc.comment && (
                          <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 8 }}>{sc.comment}</div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>改善の要点</div>
                        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sc.improvements.map((s, i) => (
                            <li key={i} style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{s}</li>
                          ))}
                        </ol>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button onClick={() => openTastePanel(c)} disabled={tasteBusy !== null} style={{ ...smallBtn, color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.4)', opacity: tasteBusy !== null ? 0.5 : 1 }}>
                            ✨ この講評を踏まえてテイスト変換
                          </button>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            採点日時: {new Date(sc.scoredAt).toLocaleString('ja-JP')}
                            {sc.modelLabel ? `・${sc.modelLabel}` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 校正提案リスト（提案のみ表示→院長が1件ずつ✅適用/✕却下） */}
                  {expandedIssuesId === c.id && entry && (
                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
                        {pending > 0 && <button onClick={() => setDiffTarget(c)} style={smallBtn}>👁 前後比較</button>}
                        <button onClick={() => retryChapterProofread(c.id)} disabled={proofreading} style={{ ...smallBtn, opacity: proofreading ? 0.5 : 1 }}>
                          🔄 この章を再校正
                        </button>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>再校正すると提案と適用/却下の記録は作り直されます</span>
                      </div>
                      {entry.issues.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>提案はありませんでした（問題なし）</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {entry.issues.map((issue, idx) => {
                            const badge = KINDLE_ISSUE_BADGE[issue.type] ?? KINDLE_ISSUE_BADGE['表現改善'];
                            const decided = issue.status;
                            return (
                              <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, opacity: decided ? 0.55 : 1 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, color: badge.color, border: `1px solid ${badge.color}44`, flexShrink: 0 }}>
                                    {badge.emoji} {issue.type}
                                  </span>
                                  {issue.principle && <span style={{ fontSize: 10, color: '#8b5cf6' }}>原則: {issue.principle}</span>}
                                  {issue.scope === 'all' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>全箇所を統一</span>}
                                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
                                    {decided ? (
                                      <span style={{ fontSize: 11, color: decided === 'applied' ? '#22c55e' : 'var(--text-muted)' }}>
                                        {decided === 'applied' ? '✅ 適用済み' : '✕ 却下'}
                                      </span>
                                    ) : (
                                      <>
                                        <button onClick={() => decideIssue(c, idx, issue, 'applied')} style={{ ...smallBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}>✅ 適用</button>
                                        <button onClick={() => decideIssue(c, idx, issue, 'rejected')} style={smallBtn}>✕ 却下</button>
                                      </>
                                    )}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                                  <div>− <span style={{ color: '#ef4444' }}>{issue.original}</span></div>
                                  <div>＋ <span style={{ color: '#22c55e' }}>{issue.suggestion}</span></div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{issue.reason}</div>
                                  {/* 233②: 提案そのものが禁止表現になっていないかの辞書チェック（表示のみ・適用は止めない） */}
                                  {suggestionBanned(issue).map((b, bi) => (
                                    <div key={bi} style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, lineHeight: 1.6 }}>
                                      ⚠️ この提案に禁止表現の疑い「{b.matched}」（{b.category}）— {b.reason}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 227【A】【B】: 章まとめの編集パネル（追加・削除・↑↓・文言編集・本文末尾への追記） */}
                  {expandedSummaryId === c.id && (
                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                      {!summaries[String(c.id)] ? (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>この章の要点まとめ（3〜5点）はまだありません</span>
                          <button onClick={() => generateSummaryFor(c, false)} disabled={summaryBusyId !== null} style={{ ...smallBtn, opacity: summaryBusyId !== null ? 0.5 : 1 }}>
                            {summaryBusyId === c.id ? '生成中...' : '🪄 まとめを生成'}
                          </button>
                        </div>
                      ) : (
                        (() => {
                          const entry = summaries[String(c.id)];
                          const pts = draftPoints ?? entry.points;
                          const dirty = JSON.stringify(pts) !== JSON.stringify(entry.points);
                          return (
                            <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {entry.source === 'edited' ? '✍️ 編集済み' : '🪄 自動生成'}・巻末「全章まとめ」のソースになります
                                </span>
                                <button onClick={() => generateSummaryFor(c, true)} disabled={summaryBusyId !== null} style={{ ...smallBtn, opacity: summaryBusyId !== null ? 0.5 : 1 }}>
                                  🪄 再生成
                                </button>
                              </div>
                              {pts.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>・</span>
                                  <input
                                    value={p}
                                    onChange={(e) =>
                                      setDraftPoints((prev) => (prev ?? [...entry.points]).map((x, i) => (i === idx ? e.target.value : x)))
                                    }
                                    style={{ flex: 1, minWidth: 0, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                                  />
                                  <button onClick={() => moveDraftPoint(idx, -1)} disabled={idx === 0} style={{ ...smallBtn, opacity: idx === 0 ? 0.4 : 1 }} title="上へ">↑</button>
                                  <button onClick={() => moveDraftPoint(idx, 1)} disabled={idx === pts.length - 1} style={{ ...smallBtn, opacity: idx === pts.length - 1 ? 0.4 : 1 }} title="下へ">↓</button>
                                  <button
                                    onClick={() => setDraftPoints((prev) => (prev ?? [...entry.points]).filter((_, i) => i !== idx))}
                                    disabled={pts.length <= 1}
                                    style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', opacity: pts.length <= 1 ? 0.4 : 1 }}
                                    title="この要点を削除"
                                  >
                                    🗑
                                  </button>
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={() => setDraftPoints((prev) => [...(prev ?? entry.points), ''])} disabled={pts.length >= 8} style={{ ...smallBtn, opacity: pts.length >= 8 ? 0.4 : 1 }}>
                                  ＋ 追加
                                </button>
                                <button
                                  onClick={() => saveSummaryPoints(c)}
                                  disabled={summarySaving || !dirty}
                                  style={{ ...smallBtn, color: dirty ? '#22c55e' : 'var(--text-muted)', borderColor: dirty ? 'rgba(34,197,94,0.4)' : 'var(--border)', opacity: summarySaving ? 0.5 : 1 }}
                                >
                                  {summarySaving ? '保存中...' : dirty ? '💾 保存（未保存の変更あり）' : '💾 保存済み'}
                                </button>
                                {!hasChapterEndSummary(c.content || '') && (
                                  <button
                                    onClick={() => appendSummaryToChapter(c)}
                                    disabled={appendBusyId !== null || dirty}
                                    style={{ ...smallBtn, color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.4)', opacity: appendBusyId !== null || dirty ? 0.5 : 1 }}
                                    title={dirty ? '先に💾保存してください（追記は保存済みの内容を使います）' : '本文末尾に「## この章のまとめ」を追記します'}
                                  >
                                    {appendBusyId === c.id ? '追記中...' : '📄 本文末尾に追記'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 236A: 全章まとめて採点（直列）。校正との役割分担をここでも明示する */}
          {allDone && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, maxWidth: 720 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📊 章の採点（診断）</span>
                <button
                  onClick={scoreAllChapters}
                  disabled={scoringAll || scoreBusyId !== null}
                  style={{ ...smallBtn, marginLeft: 'auto', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)', opacity: scoringAll || scoreBusyId !== null ? 0.5 : 1 }}
                >
                  {scoringAll
                    ? `採点中...（第${chapters.find((c) => c.id === scoreBusyId)?.chapterNumber ?? '-'}章）`
                    : '📊 全章を採点'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                5つの観点（分かりやすさ／読者への響き／構成の明快さ／具体性／目的との整合）で章を評価し、改善の要点を3つ示します。
                <strong>採点は診断のみで本文は変わりません。</strong>
                文言の個別修正は「🔍 提案」（自動校正）、文章全体の書き換えは「✨ テイスト変換」で行います。
              </div>
              {Object.keys(scores).length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
                  {chapters.map((c) => {
                    const sc = scores[String(c.id)];
                    if (!sc) return null;
                    return (
                      <span key={c.id} style={{ color: 'var(--text-muted)' }}>
                        第{c.chapterNumber}章 <span style={{ color: scoreColor(sc.average), fontWeight: 700 }}>{sc.average.toFixed(1)}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 🔍 自動校正の状態＋本全体の指摘（224） */}
          {allDone && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, maxWidth: 720 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                🔍 自動校正（提案のみ・適用は1件ずつ選べます）
              </div>
              {proofreading ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {proofChapterId
                    ? `校正を実行中...（第${chapters.find((c) => c.id === proofChapterId)?.chapterNumber ?? '-'}章）`
                    : summaryBusyId
                      ? `章まとめを生成中...（第${chapters.find((c) => c.id === summaryBusyId)?.chapterNumber ?? '-'}章）`
                      : '校正を実行中...（本全体の整合を確認中）'}
                </div>
              ) : !hasProofData ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>全章の生成完了後に自動で実行されます</span>
                  <button onClick={runProofread} style={smallBtn}>🔍 いま実行する</button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>章ごとの提案は上の「🔍 提案」から確認・適用できます</div>
              )}
              {proofErrors.run && !proofreading && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#dc2626' }}>⚠️ 校正できませんでした: {proofErrors.run}</span>
                  <button onClick={runProofread} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>🔄 再試行</button>
                </div>
              )}

              {proofread.global && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📋 本全体の指摘（用語ゆれ・章間重複・流れ）</div>
                  {proofread.global.notes.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>指摘はありませんでした</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {proofread.global.notes.map((n, i) => (
                        <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                          <span style={{ fontWeight: 700 }}>[{n.type}]</span> {n.note}
                          {(n.chapters ?? []).length > 0 && <span style={{ color: 'var(--text-muted)' }}>（第{(n.chapters ?? []).join('・')}章）</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {proofErrors.global && !proofreading && (
                <button onClick={retryGlobalProofread} style={{ ...smallBtn, marginTop: 8, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }} title={proofErrors.global}>
                  ⚠️ 全体整合の確認に失敗・🔄 再試行
                </button>
              )}
            </div>
          )}

          {/* 🔎 内容検証（233②: 素材照合＋禁止表現／AI不使用・表示のみ・自動修正しない） */}
          {allDone && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, maxWidth: 720 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🔎 内容の検証（確認用・自動修正はしません）</span>
                <button onClick={runVerify} disabled={verifyBusy} style={{ ...smallBtn, marginLeft: 'auto', opacity: verifyBusy ? 0.5 : 1 }}>
                  {verifyBusy ? '検証中...' : '🔄 再検証'}
                </button>
              </div>

              {verifyError ? (
                <div style={{ fontSize: 12, color: '#dc2626' }}>⚠️ 検証できませんでした: {verifyError}</div>
              ) : verifyBusy && !verify ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>本文と素材を照合しています...</div>
              ) : !verify ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>全章の生成完了後に自動で実行されます</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
                    <span style={{ color: verify.totalUngrounded > 0 ? '#f59e0b' : '#22c55e' }}>
                      {verify.totalUngrounded > 0 ? `⚠️ 素材にない記述 ${verify.totalUngrounded}件` : '✅ 素材にない記述なし'}
                    </span>
                    <span style={{ color: verify.totalBanned > 0 ? '#f59e0b' : '#22c55e' }}>
                      {verify.totalBanned > 0 ? `⚠️ 禁止表現の疑い ${verify.totalBanned}件` : '✅ 禁止表現の疑いなし'}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>素材{verify.materialCount}件と照合</span>
                  </div>

                  {verify.groundingSkipped && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      素材本文を取得できなかったため、素材照合はスキップしました（禁止表現チェックのみ実施）
                    </div>
                  )}

                  {verify.totalUngrounded === 0 && verify.totalBanned === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>指摘はありませんでした</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {verify.chapters
                        .filter((v) => v.ungrounded.length > 0 || v.banned.length > 0)
                        .map((v) => (
                          <div key={v.chapterId} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <button
                              onClick={() => setVerifyOpenId(verifyOpenId === v.chapterId ? null : v.chapterId)}
                              style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>第{v.chapterNumber}章</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                              {v.ungrounded.length > 0 && <span style={{ fontSize: 11, color: '#f59e0b', flexShrink: 0 }}>素材にない記述{v.ungrounded.length}件</span>}
                              {v.banned.length > 0 && <span style={{ fontSize: 11, color: '#ef4444', flexShrink: 0 }}>禁止表現{v.banned.length}件</span>}
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{verifyOpenId === v.chapterId ? '▲' : '▼'}</span>
                            </button>
                            {verifyOpenId === v.chapterId && (
                              <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border)' }}>
                                {v.banned.length > 0 && (
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>禁止表現の疑い</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {v.banned.map((b, i) => (
                                        <div key={i} style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                                          <span style={{ fontWeight: 700, color: '#ef4444' }}>「{b.matched}」</span>
                                          <span style={{ color: 'var(--text-muted)' }}>（{b.category}{b.count > 1 ? `・${b.count}箇所` : ''}）</span>
                                          <div style={{ color: 'var(--text-muted)' }}>{b.reason}</div>
                                          <div style={{ color: 'var(--text-muted)', opacity: 0.8 }}>{b.context}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {v.ungrounded.length > 0 && (
                                  <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>素材にない記述（誤検出も含みます。事実か確認してください）</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {v.ungrounded.map((u, i) => (
                                        <div key={i} style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                                          <span style={{ fontWeight: 700, color: '#f59e0b' }}>「{u.term}」</span>
                                          <span style={{ color: 'var(--text-muted)' }}>（{u.kind}{u.count > 1 ? `・${u.count}箇所` : ''}）</span>
                                          <div style={{ color: 'var(--text-muted)', opacity: 0.8 }}>{u.context}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
                    辞書と文字列照合による機械チェックです（AIは使いません）。誤検出があるため自動での修正・削除はしません。修正が必要なときは「✏️ 編集」から直してください。
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.6 }}>
            章は1章ずつ順番に生成します（前の章の流れを引き継ぐため）。途中で閉じても、このページに戻れば未生成の章から再開できます。
            {book?.bookMeta?.preset === 'standard' && (
              <strong style={{ color: '#f59e0b' }}>
                {' '}標準Kindle本は全章で30〜60分かかります。章ごとに保存されるため、途中で閉じて後から再開しても問題ありません。
              </strong>
            )}
          </div>
        </div>
      )}

      {/* ── ⑥ 出力 ── */}
      {step === 6 && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginRight: 'auto' }}>✅ {bookTitle}（全{chapters.length}章・{(book?.currentWordCount ?? 0).toLocaleString()}字）</span>
            {/* 232: 本全体のリッチコピー（MDダウンロードと同一内容。Word等には体裁付きで貼れる） */}
            <button
              onClick={async () => {
                const ok = await copyRichMarkdown(`# ${bookTitle}\n\n${fullMarkdownBody}`);
                if (ok) {
                  setOutputCopied(true);
                  setTimeout(() => setOutputCopied(false), 2000);
                }
              }}
              style={ghostBtn}
            >
              {outputCopied ? '✅ コピー済み' : '📋 コピー'}
            </button>
            <button onClick={downloadMd} style={ghostBtn}>📥 Markdown</button>
            <button onClick={downloadTxt} style={ghostBtn}>📥 テキスト</button>
            {/* 229B: 章を単体で読み切れるnote記事に展開（保存で相互関連付け） */}
            <button onClick={() => setShowToNote(true)} style={ghostBtn}>📝 noteに展開</button>
            <button onClick={downloadDocx} style={primaryBtn}>📥 Word (.docx)</button>
          </div>

          {/* 233②: 出力直前の内容検証サマリー（詳細は⑤の「🔎 内容の検証」／表示のみ） */}
          {verify && (verify.totalUngrounded > 0 || verify.totalBanned > 0) && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>⚠️ 出力前の確認</span>
              <div>
                {verify.totalUngrounded > 0 && <>素材にない記述 <strong>{verify.totalUngrounded}件</strong>　</>}
                {verify.totalBanned > 0 && <>禁止表現の疑い <strong>{verify.totalBanned}件</strong>　</>}
                <button onClick={() => setStep(5)} style={{ ...smallBtn, marginLeft: 4 }}>⑤で内容を確認する</button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>機械チェックのため誤検出を含みます。修正するかどうかは院長が判断してください（自動修正はしません）。</div>
            </div>
          )}

          {/* 229B: 🔗関連note記事（この本から展開した記事＋素材にしたnote記事） */}
          {(() => {
            const savedIds: string[] = Array.isArray(book?.bookMeta?.noteArticleIds) ? book.bookMeta.noteArticleIds : [];
            const fromBook = [
              ...savedIds.map((id) => ({ id, title: titleById.get(String(id)) ?? 'note記事（保存済み）' })),
              ...sessionNotes.filter((n) => !savedIds.includes(n.id)),
            ];
            const usedNotes = (Array.isArray(book?.bookMeta?.sourceIds) ? book.bookMeta.sourceIds : [])
              .map((id: string) => items.find((i) => String(i.id) === String(id)))
              .filter((i: any) => i && i.type === 'note-article');
            if (fromBook.length === 0 && usedNotes.length === 0) return null;
            return (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, lineHeight: 1.9 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>🔗 関連note記事</span>
                {fromBook.length > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    この本から展開:{' '}
                    {fromBook.map((n, i) => (
                      <span key={n.id}>
                        {i > 0 && '・'}
                        <a href="/dashboard/library" style={{ color: 'var(--accent)' }}>{n.title}</a>
                      </span>
                    ))}
                  </div>
                )}
                {usedNotes.length > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    素材にしたnote記事:{' '}
                    {usedNotes.map((n: any, i: number) => (
                      <span key={n.id}>
                        {i > 0 && '・'}
                        <a href="/dashboard/library" style={{ color: 'var(--accent)' }}>{n.title || '(無題)'}</a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 227【B】: 巻末「全章まとめ」トグル（既定ON・未生成章の注記つき） */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeBookSummary} onChange={(e) => setIncludeBookSummary(e.target.checked)} />
              巻末に「全章まとめ」を付ける
            </label>
            {includeBookSummary && chapters.some((c) => !summaries[String(c.id)]) && (
              <span style={{ fontSize: 11, color: '#f59e0b' }}>
                ⚠️ まとめ未生成が{chapters.filter((c) => !summaries[String(c.id)]).length}章あります（未生成の章は巻末に載りません。⑤の「📝 まとめ」から生成できます）
              </span>
            )}
          </div>
          {/* 226 Phase1: 🖼 画像（表紙・章扉） */}
          <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🖼 画像（表紙・章扉）</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              生成した画像は出力に自動で含まれます（Word=埋め込み・Markdown=リンク・テキスト=含めない）。画像内に文字は入れません（文字化け防止）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { slot: 'cover' as const, chapter: undefined as WizardChapter | undefined, label: '📕 表紙（縦長）' },
                ...[...chapters]
                  .sort((a, b) => a.chapterNumber - b.chapterNumber)
                  .map((c) => ({ slot: 'chapter' as const, chapter: c as WizardChapter | undefined, label: `第${c.chapterNumber}章 ${c.title}` })),
              ].map(({ slot, chapter, label }) => {
                const entry = slot === 'cover' ? bookImages.cover : bookImages.chapters?.[String(chapter?.id)];
                const delKey = slot === 'cover' ? 'cover' : `ch-${chapter?.id}`;
                return (
                  <div key={delKey} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {entry?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.url} alt={label} style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 56, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                        —
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 120, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {entry && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {IMAGE_MODELS.find((m) => m.key === entry.engine)?.label ?? entry.engine}・{KINDLE_IMAGE_STYLES[entry.styleKey]?.label ?? ''}
                      </span>
                    )}
                    <button onClick={() => openImageModal(slot, chapter)} style={smallBtn}>{entry ? '🔄 再生成' : '🎨 生成'}</button>
                    {entry && (
                      <button
                        onClick={() => deleteSlotImage(slot, chapter)}
                        disabled={imgDeleting !== null}
                        style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', opacity: imgDeleting === delKey ? 0.5 : 1 }}
                      >
                        {imgDeleting === delKey ? '削除中...' : '✕ 不使用'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 227【C】: 🧾 まとめ画像（方式b=プログラム描画・文字100%正確） */}
          <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🧾 まとめ画像（章ごと・巻末一覧）</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              📝まとめの文言をそのまま図に描画します（AI画像生成ではないため文字崩れゼロ・数秒/枚・無料）。まとめを編集したら🔄再生成してください
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>テンプレート:</span>
              {SUMMARY_IMAGE_TEMPLATE_KEYS.map((k) => {
                const t = SUMMARY_IMAGE_TEMPLATES[k];
                const active = sumImgTemplate === k;
                return (
                  <button
                    key={k}
                    onClick={() => setSumImgTemplate(k)}
                    style={{ padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 400, background: active ? 'var(--accent-soft)' : 'var(--bg-primary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, color: active ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            {sumImgError && (
              <div style={{ marginBottom: 8, fontSize: 12, color: '#dc2626' }}>⚠️ {sumImgError}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ...[...chapters]
                  .sort((a, b) => a.chapterNumber - b.chapterNumber)
                  .filter((c) => (summaries[String(c.id)]?.points ?? []).length > 0)
                  .map((c) => ({ target: 'chapter' as const, chapter: c as WizardChapter | undefined, label: `第${c.chapterNumber}章 ${c.title}` })),
                { target: 'book' as const, chapter: undefined as WizardChapter | undefined, label: '📚 巻末「全章まとめ」一覧' },
              ].map(({ target, chapter, label }) => {
                const entry = target === 'book' ? summaryImages.book : summaryImages.chapters?.[String(chapter?.id)];
                const key = target === 'book' ? 'book' : `ch-${chapter?.id}`;
                // 編集後のまとめが常にソース: 生成時点と現在のまとめupdatedAtの不一致=古い画像
                const latestSource =
                  target === 'book'
                    ? chapters.map((c) => summaries[String(c.id)]?.updatedAt || '').filter(Boolean).sort().pop() || ''
                    : summaries[String(chapter?.id)]?.updatedAt || '';
                const stale = !!entry && !!latestSource && entry.sourceUpdatedAt !== latestSource;
                return (
                  <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {entry?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.url} alt={label} style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 56, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                        —
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 120, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {entry && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{SUMMARY_IMAGE_TEMPLATES[entry.template]?.label ?? ''}</span>}
                    {stale && (
                      <span style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }}>⚠️ まとめが更新されています</span>
                    )}
                    <button onClick={() => generateSummaryImage(target, chapter)} disabled={sumImgBusy !== null} style={{ ...smallBtn, opacity: sumImgBusy !== null && sumImgBusy !== key ? 0.5 : 1, color: stale ? '#f59e0b' : undefined, borderColor: stale ? 'rgba(245,158,11,0.4)' : undefined }}>
                      {sumImgBusy === key ? '生成中...' : entry ? '🔄 再生成' : '🎨 生成'}
                    </button>
                    {entry && (
                      <button onClick={() => deleteSummaryImage(target, chapter)} disabled={sumImgBusy !== null} style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                        ✕ 不使用
                      </button>
                    )}
                  </div>
                );
              })}
              {chapters.every((c) => (summaries[String(c.id)]?.points ?? []).length === 0) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>まとめのある章がありません（⑤の「📝 まとめ」で生成すると、ここで画像化できます）</div>
              )}
            </div>
          </div>

          {/* 225b: 📣 出版・販促アセット（kindle-studioの販促5機能を吸収。保存先=book_meta.assets） */}
          <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📣 出版・販促アセット</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              KDP出版・宣伝に使う素材をこの本の内容（タイトル・章立て・まとめ）から生成します。結果は本に保存され、📋コピーでそのまま使えます。
            </div>
            {assetError && <div style={{ marginBottom: 8, fontSize: 12, color: '#dc2626' }}>⚠️ {assetError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {KINDLE_ASSET_KINDS.map((kind) => {
                const meta = KINDLE_ASSET_META[kind];
                const entry = bookAssets[kind];
                const busy = assetBusy === kind;
                return (
                  <div key={kind} style={{ padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} title={meta.hint}>
                        {meta.emoji} {meta.label}
                      </span>
                      {entry && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {new Date(entry.generatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 生成
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => generateAsset(kind)} disabled={assetBusy !== null} style={smallBtn} title={meta.hint}>
                          {busy ? '🪄 生成中...' : entry ? '🔄 再生成' : '🪄 生成'}
                        </button>
                        {entry && (
                          <>
                            <button onClick={() => setAssetOpen((p) => ({ ...p, [kind]: !p[kind] }))} style={smallBtn}>
                              {assetOpen[kind] ? '▲ 閉じる' : '▼ 開く'}
                            </button>
                            <button onClick={() => copyAsset(kind)} style={smallBtn}>
                              {assetCopied === kind ? '✅ コピー済み' : '📋 コピー'}
                            </button>
                            <button onClick={() => deleteAsset(kind)} disabled={assetBusy !== null} style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                              ✕ 不使用
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {entry && assetOpen[kind] && (
                      <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflowY: 'auto' }}>
                        {kindleAssetToText(kind, entry.data)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, maxHeight: '65vh', overflowY: 'auto', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {`${bookTitle}\n\n${stripImageLines(fullMarkdownBody).replace(/^## /gm, '■ ')}`}
          </div>
        </div>
      )}

      {/* ── ✏️ 手動編集モーダル（224: 校正提案とは独立に本文を直接編集） ── */}
      {editTarget && (
        <WizardModal
          title={`✏️ 第${editTarget.chapterNumber}章 ${editTarget.title}`}
          onClose={() => { if (!editSaving) setEditTarget(null); }}
        >
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={22}
            style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{editText.length.toLocaleString()}字（保存すると総文字数を再計算します）</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditTarget(null)} disabled={editSaving} style={ghostBtn}>キャンセル</button>
              <button onClick={saveManualEdit} disabled={editSaving} style={{ ...primaryBtn, opacity: editSaving ? 0.5 : 1 }}>
                {editSaving ? '保存中...' : '💾 保存'}
              </button>
            </span>
          </div>
        </WizardModal>
      )}

      {/* ── ✨ テイスト変換モーダル（236B/C: サンプル比較 → 全文変換 → 左右diff → 適用/破棄） ── */}
      {tasteTarget && (
        <WizardModal
          title={`✨ 第${tasteTarget.chapterNumber}章 テイスト変換 — ${tasteTarget.title}`}
          onClose={() => { if (!tasteBusy) { setTasteTarget(null); setTasteConverted(null); setTasteSamples(null); setTasteError(''); } }}
          width={1200}
        >
          {tasteError && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#dc2626', lineHeight: 1.7 }}>
              ⚠️ {tasteError}
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>章の本文はそのままです（変換は適用していません）。</div>
            </div>
          )}

          {/* 段階2の結果があるときは左右diffを出す（適用前に必ず見せる＝無言で書き換えない） */}
          {tasteConverted ? (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6' }}>
                  {KINDLE_TASTES[tasteConverted.tasteKey]?.emoji} {tasteConverted.tasteLabel} に変換した結果
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>まだ保存していません。内容を確認してから適用してください</span>
              </div>

              <DiffColumns original={tasteConverted.original} revised={tasteConverted.revised} leftLabel="原文" rightLabel={`変換後（${tasteConverted.tasteLabel}）`} maxHeight={420} />

              {/* 変換後の本文に対する禁止表現チェック（233②の辞書判定・AI不使用） */}
              {(() => {
                const banned = findBannedExpressions(tasteConverted.revised, { maxResults: 8 });
                if (banned.length === 0) {
                  return <div style={{ marginTop: 10, fontSize: 11, color: '#10b981' }}>✅ 変換後の本文に禁止表現の疑いはありません</div>;
                }
                return (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: '#ef4444' }}>⚠️ 変換後に禁止表現の疑い {banned.length}件</strong>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                      {banned.map((b, i) => (
                        <li key={i}>「{b.matched}」（{b.category}）— {b.reason}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={applyConverted} disabled={tasteBusy !== null} style={{ ...primaryBtn, opacity: tasteBusy !== null ? 0.5 : 1 }}>
                  {tasteBusy === 'apply' ? '適用中...' : '✅ この内容を適用'}
                </button>
                <button onClick={() => setTasteConverted(null)} disabled={tasteBusy !== null} style={ghostBtn}>✕ 破棄してテイスト選びに戻る</button>
                <button
                  onClick={() => convertWithTaste(tasteConverted.tasteKey)}
                  disabled={tasteBusy !== null}
                  style={{ ...smallBtn, opacity: tasteBusy !== null ? 0.5 : 1 }}
                  title="同じテイストでもう一度生成し直します"
                >
                  🔄 同じテイストで再変換
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  適用すると本文を置き換え、総文字数を再計算し、内容の検証（素材照合）をやり直します
                </span>
              </div>
            </div>
          ) : (
            /* 段階1: サンプル比較 */
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 12 }}>
                同じ冒頭を各テイストで書き換えたサンプルです。読み比べて選ぶと、その1つで<strong>章の全文</strong>を変換します。
                内容・事実・数値は変えず、表現だけを変換します（医療広告のNG表現もどのテイストでも使いません）。
              </div>

              {tasteBusy === 'samples' && !tasteSamples && (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                  各テイストのサンプルを生成しています…（30秒前後）
                </div>
              )}

              {tasteSamples && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 12 }}>
                  {KINDLE_TASTE_KEYS.filter((k) => tasteSamples[k]).map((k) => {
                    const t = KINDLE_TASTES[k];
                    return (
                      <div key={k} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.emoji} {t.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>{t.hint}</div>
                        <div style={{ flex: 1, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, lineHeight: 1.85, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}>
                          {tasteSamples[k]}
                        </div>
                        <button
                          onClick={() => convertWithTaste(k)}
                          disabled={tasteBusy !== null}
                          style={{ ...primaryBtn, width: '100%', fontSize: 12, padding: '8px 12px', opacity: tasteBusy !== null ? 0.5 : 1 }}
                        >
                          {tasteBusy === 'convert' ? '変換中...' : 'このテイストで全文を変換'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {tasteBusy === 'convert' && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  章の全文を変換しています…（1〜2分かかることがあります。完了すると原文との比較を表示します）
                </div>
              )}

              {tasteSamples && Object.keys(tasteSamples).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>サンプルを取得できませんでした。🔄 もう一度お試しください。</div>
              )}
            </div>
          )}
        </WizardModal>
      )}

      {/* ── 👁 前後比較モーダル（未処理の提案をすべて適用した場合のプレビュー） ── */}
      {diffTarget && (
        <WizardModal title={`👁 第${diffTarget.chapterNumber}章 前後比較（未処理の提案${diffFixes.length}件を反映した場合）`} onClose={() => setDiffTarget(null)} width={1100}>
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>校正前</div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: '60vh', overflowY: 'auto' }}>
                <ProofreadDiffPane
                  text={diffTarget.content || ''}
                  fixes={diffFixes}
                  mode="before"
                  className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-[var(--text-secondary)] m-0"
                />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>校正後（プレビュー・適用するまで本文は変わりません）</div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: '60vh', overflowY: 'auto' }}>
                <ProofreadDiffPane
                  text={diffAfterText}
                  fixes={diffFixes}
                  mode="after"
                  className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-[var(--text-secondary)] m-0"
                />
              </div>
            </div>
          </div>
        </WizardModal>
      )}

      {/* ── 🎨 画像生成モーダル（226 Phase1: エンジン/画風選択＋プロンプト人間確認型） ── */}
      {imageModal && (
        <WizardModal
          title={`🎨 ${imageModal.slot === 'cover' ? '表紙（縦長）' : `第${imageModal.chapter?.chapterNumber}章 扉（横長）`}の画像を生成`}
          onClose={() => { if (!imgGenerating) setImageModal(null); }}
        >
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>生成エンジン（毎回選べます）</p>
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 8, marginBottom: 14 }}>
            {IMAGE_MODELS.map((m) => (
              <button key={m.key} onClick={() => setImgEngine(m.key)} style={cardBtn(imgEngine === m.key)}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.note}・{m.approxCost}</div>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>画風（既定: やわらかいイラスト調）</p>
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 8, marginBottom: 14 }}>
            {KINDLE_IMAGE_STYLE_KEYS.map((k) => {
              const s = KINDLE_IMAGE_STYLES[k];
              return (
                <button key={k} onClick={() => setImgStyle(k)} style={cardBtn(imgStyle === k)}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{s.emoji} {s.label}</div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 6 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>画像プロンプト（AIの起案・編集できます）</p>
            <button
              onClick={() => imageModal && draftImagePrompt(imageModal.slot, imageModal.chapter)}
              disabled={imgDrafting || imgGenerating}
              style={{ ...smallBtn, opacity: imgDrafting || imgGenerating ? 0.5 : 1 }}
            >
              {imgDrafting ? '起案中...' : '🪄 内容から起案し直す'}
            </button>
          </div>
          <textarea
            value={imgPrompt}
            onChange={(e) => setImgPrompt(e.target.value)}
            rows={5}
            placeholder={imgDrafting ? '本の内容からプロンプトを起案しています...' : '生成したい画像を説明してください'}
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.7, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            ※ 文字を入れない・実在人物/患部の写実描写をしない等のガードは、編集内容にかかわらずサーバ側で必ず適用されます
          </div>

          {imgError && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
              ⚠️ {imgError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={() => setImageModal(null)} disabled={imgGenerating} style={ghostBtn}>キャンセル</button>
            <button onClick={generateSlotImage} disabled={imgGenerating || imgDrafting} style={{ ...primaryBtn, opacity: imgGenerating || imgDrafting ? 0.6 : 1 }}>
              {imgGenerating ? '🎨 生成中...（最大2分）' : '🎨 この内容で生成する'}
            </button>
          </div>
        </WizardModal>
      )}

      {/* ── 右下固定フッター（全ステップ共通・スクロール位置に依存しない主操作） ── */}
      <WizardFooterBar>
        {step === 1 && (
          <>
            <span data-kw-limits style={{ fontSize: 13, color: selectedIds.size > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
              選択 {selectedIds.size}/{MAX_KINDLE_SOURCES}件 ・ 合計 {totalChars.toLocaleString()}字（上限{MAX_KINDLE_TOTAL_CHARS.toLocaleString()}字）
            </span>
            <button
              onClick={confirmMaterials}
              disabled={selectedIds.size === 0 || validating}
              style={{ ...primaryBtn, opacity: selectedIds.size === 0 || validating ? 0.5 : 1, cursor: selectedIds.size === 0 || validating ? 'not-allowed' : 'pointer' }}
            >
              {validating ? '確認中...' : `次へ（${selectedIds.size}件で進む）→`}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <button onClick={() => setStep(1)} style={ghostBtn}>← 戻る</button>
            <button onClick={() => purposeKeys.length > 0 && setStep(3)} disabled={purposeKeys.length === 0} style={{ ...primaryBtn, opacity: purposeKeys.length > 0 ? 1 : 0.5, cursor: purposeKeys.length > 0 ? 'pointer' : 'not-allowed' }}>
              {purposeKeys.length === 0
                ? '目的を選んでください'
                : purposeKeys.length === 1
                  ? `${KINDLE_PURPOSES[purposeKeys[0]].emoji} ${KINDLE_PURPOSES[purposeKeys[0]].label}で次へ →`
                  : `${purposeKeys.map((p) => KINDLE_PURPOSES[p].emoji).join('')} ${purposeKeys.length}目的（${purposeKeys.length}冊）で次へ →`}
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <button onClick={() => setStep(2)} style={ghostBtn}>← 戻る</button>
            <button
              onClick={() => {
                setStep(4);
                setActivePurpose((prev) => prev ?? purposeKeys[0] ?? null);
                generateMissingOutlines();
              }}
              style={primaryBtn}
            >
              目次を生成する →
            </button>
          </>
        )}
        {step === 4 && (
          <>
            <button onClick={() => setStep(3)} style={ghostBtn}>← 戻る</button>
            {(() => {
              const p = activePurpose ?? purposeKeys[0] ?? null;
              const current = p ? outlines[p] : null;
              const readyAll = purposeKeys.length > 0 && purposeKeys.every((k) => !!outlines[k] && !outlineLoading[k]);
              const totalChapters = purposeKeys.reduce((sum, k) => sum + (outlines[k]?.chapters.length ?? 0), 0);
              return (
                <>
                  {p && current && !outlineLoading[p] && (
                    <button onClick={() => { if (confirm(`${KINDLE_PURPOSES[p].label}の目次を再生成しますか？（この目的の編集内容は破棄されます）`)) generateOutline(p); }} style={ghostBtn}>
                      🔄 再生成{purposeKeys.length > 1 ? `（${KINDLE_PURPOSES[p].label}）` : ''}
                    </button>
                  )}
                  {readyAll && (
                    <button onClick={confirmOutline} disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.5 : 1 }}>
                      {creating
                        ? '作成中...'
                        : purposeKeys.length === 1
                          ? `この目次で確定（全${totalChapters}章）→`
                          : `この目次で確定（${purposeKeys.length}冊・合計${totalChapters}章）→`}
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}
        {step === 5 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {completedCount}/{chapters.length}章 ・ {(book?.currentWordCount ?? 0).toLocaleString()}字
            </span>
            {generating ? (
              <button onClick={stopQueue} style={{ ...ghostBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>⏸ 中断する</button>
            ) : allDone ? (
              <button onClick={() => setStep(6)} style={primaryBtn}>出力へ →</button>
            ) : (
              <button onClick={runQueue} style={primaryBtn}>
                ▶ 本文生成を{completedCount > 0 ? '再開' : '開始'}する（残り{chapters.length - completedCount}章）
              </button>
            )}
          </>
        )}
        {step === 6 && (
          <>
            <button onClick={() => setStep(5)} style={ghostBtn}>← 生成画面に戻る</button>
            <button onClick={() => router.push('/dashboard/kindle-wizard')} style={ghostBtn}>🆕 新しい本を作る</button>
          </>
        )}
      </WizardFooterBar>

      {/* 229B: Kindle→note展開モーダル */}
      {bookId !== null && (
        <KindleToNoteModal
          open={showToNote}
          onClose={() => setShowToNote(false)}
          bookId={bookId}
          bookTitle={bookTitle}
          kindleStyleKey={book?.bookMeta?.styleKey ?? styleKey}
          chapters={chapters.map((c) => ({
            id: c.id,
            chapterNumber: c.chapterNumber,
            title: c.title,
            hasContent: !!(c.content && c.content.trim()),
          }))}
          onSaved={(article) => setSessionNotes((prev) => (prev.some((n) => n.id === article.id) ? prev : [...prev, article]))}
        />
      )}
    </div>
  );
}

export default function KindleWizardPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 40 }}>読み込み中...</div>}>
      <KindleWizardInner />
    </Suspense>
  );
}
