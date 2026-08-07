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
  KINDLE_MATERIAL_SOURCE_META,
  type KindleMaterialSource,
} from '@/lib/kindle-limits';
import { stripLeadingChapterHeading } from '@/lib/kindle-text';
import { triggerDownload } from '@/lib/download';
import { copyRichMarkdown } from '@/lib/rich-copy';
import {
  applyProofreadFix,
  countPendingIssues,
  KINDLE_ISSUE_BADGE,
  type KindleBookProofread,
  type KindleProofreadIssue,
} from '@/lib/kindle-proofread';
import { ProofreadDiffPane, type AppliedFix } from '@/components/proofread/ProofreadDiffPane';
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
const PRESETS = [
  { key: 'leadmagnet', emoji: '📗', label: 'リードマグネット', detail: '30ページ／2〜3万字（6〜8章）', enabled: true },
  { key: 'standard', emoji: '📘', label: '標準Kindle本', detail: '80〜120ページ／5〜8万字', enabled: false },
  { key: 'flagship', emoji: '📙', label: '本命書籍', detail: '200ページ／10〜15万字', enabled: false },
  { key: 'miniseries', emoji: '📚', label: 'ミニシリーズ', detail: '40ページ×3冊', enabled: false },
] as const;

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
  const [purposeKey, setPurposeKey] = useState<KindlePurposeKey | null>(null);
  const [styleKey, setStyleKey] = useState<KindleStyleKey>(DEFAULT_KINDLE_STYLE);
  const [theme, setTheme] = useState('');

  /* ④ 目次 */
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
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

  /* 作成中の本一覧 */
  const [wizardBooks, setWizardBooks] = useState<any[]>([]);

  /* ── 初期ロード（229A: DR+note記事の2ソースを取得。typeは各行のtype列で判別） ── */
  useEffect(() => {
    Promise.all(
      KINDLE_MATERIAL_SOURCES.map((t) =>
        fetch(`/api/library?type=${t}`)
          .then((r) => r.json())
          .then((data) => (Array.isArray(data) ? data : []))
          .catch(() => []),
      ),
    )
      .then((lists) => {
        const arr = lists.flat();
        setItems(arr);
        setItemsLoading(false);
        // 230【B-1】: リサーチ保存からのhandoff（読取後削除=冪等。C23は素の遷移でキー無し→影響なし）
        try {
          const raw = sessionStorage.getItem('lumina_kindle_selected');
          if (raw) {
            sessionStorage.removeItem('lumina_kindle_selected');
            // ?bookId= 復帰（④確定後）のときは素材選択を上書きしない
            if (!new URLSearchParams(window.location.search).get('bookId')) {
              const ids: unknown = JSON.parse(raw);
              if (Array.isArray(ids)) {
                const idSet = new Set(ids.map(String));
                const take = arr.filter((i: any) => idSet.has(String(i.id))).slice(0, MAX_KINDLE_SOURCES);
                if (take.length > 0) {
                  setSelectedIds(new Set(take.map((i: any) => String(i.id))));
                  setSourceTab(take[0].type === 'note-article' ? 'note-article' : 'deepresearch');
                }
              }
            }
          }
        } catch {
          /* handoff失敗時は通常の未選択状態で開く（選び直せる） */
        }
      })
      .catch(() => setItemsLoading(false));
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
  const totalChars = useMemo(
    () => selectedItems.reduce((sum, i) => sum + (i.content || '').length, 0),
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
  const generateOutline = async () => {
    if (!purposeKey) return;
    setError('');
    setOutlineLoading(true);
    try {
      const res = await fetch('/api/kindle/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: Array.from(selectedIds),
          purposeKey,
          styleKey,
          preset: 'leadmagnet',
          theme: theme.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `目次生成に失敗しました (${res.status})`);
      setOutline(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOutlineLoading(false);
    }
  };

  const updateChapter = (idx: number, patch: Partial<OutlineChapter>) => {
    setOutline((prev) =>
      prev ? { ...prev, chapters: prev.chapters.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : prev,
    );
  };
  const moveChapter = (idx: number, dir: -1 | 1) => {
    setOutline((prev) => {
      if (!prev) return prev;
      const next = [...prev.chapters];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...prev, chapters: next };
    });
  };
  const deleteChapter = (idx: number) => {
    setOutline((prev) => {
      if (!prev || prev.chapters.length <= 1) return prev;
      if (!confirm(`第${idx + 1}章を削除しますか？`)) return prev;
      return { ...prev, chapters: prev.chapters.filter((_, i) => i !== idx) };
    });
  };

  const confirmOutline = async () => {
    if (!outline || !purposeKey) return;
    if (outline.chapters.some((c) => !c.title.trim())) {
      setError('章タイトルが空の章があります');
      return;
    }
    setError('');
    setCreating(true);
    try {
      // 並び替え・削除を反映して章番号を連番に振り直す
      const normalized = {
        ...outline,
        chapters: outline.chapters.map((c, i) => ({ ...c, chapter_num: i + 1 })),
      };
      const res = await fetch('/api/kindle/wizard/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: normalized,
          sourceIds: Array.from(selectedIds),
          purposeKey,
          styleKey,
          preset: 'leadmagnet',
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `作成に失敗しました (${res.status})`);
      setBookId(data.bookId);
      await loadBook(data.bookId);
      // 以降はDBが正: リロード・離脱しても ?bookId= で復帰できる
      router.replace(`/dashboard/kindle-wizard?bookId=${data.bookId}`);
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
            else if (ev.type === 'done') done = true;
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
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📖 Kindle本づくり</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        ディープリサーチ結果やnote記事を束ねて、目的別のKindle本（まずはリードマグネット）を作成します。
      </p>

      {/* 作成中の本（復帰導線） */}
      {!bookId && wizardBooks.length > 0 && (
        <div style={{ marginBottom: 20, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>✍️ 作成中の本</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {wizardBooks.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/dashboard/kindle-wizard?bookId=${b.id}`)}
                style={{ ...ghostBtn, display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{(b.title || '無題').slice(0, 24)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {(b.currentWordCount ?? 0).toLocaleString()}字 → 続きから
                </span>
              </button>
            ))}
          </div>
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
            {KINDLE_MATERIAL_SOURCES.map((k) => {
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
                  : 'note記事がありません。✍️note記事群生成などで作成し、ライブラリに保存すると表示されます。'}
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
                    onFavoriteToggle={async (it) => {
                      const newVal = it.is_favorite ? 0 : 1;
                      await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, is_favorite: newVal }) });
                      setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, is_favorite: newVal } : i)));
                    }}
                    onDelete={async (id) => {
                      await fetch('/api/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                      setItems((prev) => prev.filter((i) => i.id !== id));
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                    }}
                    onExportMd={(it) => triggerDownload(`${(it.title || '無題').slice(0, 30)}.md`, `# ${it.title}\n\n${it.content || ''}`)}
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
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>この本の目的を1つ選んでください（構成・訴求・巻末CTAが変わります）</p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 20 }}>
            {KINDLE_PURPOSE_KEYS.map((key) => {
              const p = KINDLE_PURPOSES[key];
              return (
                <button key={key} onClick={() => setPurposeKey(key)} style={cardBtn(purposeKey === key)}>
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
              <button key={p.key} disabled={!p.enabled} style={cardBtn(p.key === 'leadmagnet', !p.enabled)} title={p.enabled ? undefined : '今後のアップデートで対応予定'}>
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

      {/* ── ④ 目次を生成・編集 ── */}
      {step === 4 && (
        <div>
          {outlineLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🪄</div>
              素材{selectedIds.size}件から目次を生成中...（1分前後かかります）
            </div>
          ) : !outline ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <button onClick={generateOutline} style={primaryBtn}>🪄 目次を生成する</button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>書籍タイトル（編集可）</p>
                <input
                  value={outline.book_title}
                  onChange={(e) => setOutline({ ...outline, book_title: e.target.value })}
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
                        onChange={(e) => updateChapter(idx, { title: e.target.value })}
                        style={{ flex: 1, minWidth: 0, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' }}
                      />
                      <button onClick={() => moveChapter(idx, -1)} disabled={idx === 0} style={{ ...smallBtn, opacity: idx === 0 ? 0.4 : 1 }} title="上へ">↑</button>
                      <button onClick={() => moveChapter(idx, 1)} disabled={idx === outline.chapters.length - 1} style={{ ...smallBtn, opacity: idx === outline.chapters.length - 1 ? 0.4 : 1 }} title="下へ">↓</button>
                      <button onClick={() => deleteChapter(idx)} disabled={outline.chapters.length <= 1} style={{ ...smallBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} title="この章を削除">🗑</button>
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
          )}
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
                    {summaryBusyId === c.id && <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>📝 まとめ生成中...</span>}
                    {summaryErrors[String(c.id)] && summaryBusyId !== c.id && !proofreading && (
                      <button onClick={() => generateSummaryFor(c, false)} style={{ ...smallBtn, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }} title={summaryErrors[String(c.id)]}>
                        ⚠️ まとめ失敗・🔄 再試行
                      </button>
                    )}
                  </div>

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

          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.6 }}>
            章は1章ずつ順番に生成します（前の章の流れを引き継ぐため）。途中で閉じても、このページに戻れば未生成の章から再開できます。
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
            <button onClick={downloadDocx} style={primaryBtn}>📥 Word (.docx)</button>
          </div>

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
            <button onClick={() => purposeKey && setStep(3)} disabled={!purposeKey} style={{ ...primaryBtn, opacity: purposeKey ? 1 : 0.5, cursor: purposeKey ? 'pointer' : 'not-allowed' }}>
              {purposeKey ? `${KINDLE_PURPOSES[purposeKey].emoji} ${KINDLE_PURPOSES[purposeKey].label}で次へ →` : '目的を選んでください'}
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <button onClick={() => setStep(2)} style={ghostBtn}>← 戻る</button>
            <button
              onClick={() => {
                setStep(4);
                if (!outline) generateOutline();
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
            {outline && !outlineLoading && (
              <>
                <button onClick={() => { if (confirm('目次を再生成しますか？（現在の編集内容は破棄されます）')) generateOutline(); }} style={ghostBtn}>
                  🔄 再生成
                </button>
                <button onClick={confirmOutline} disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.5 : 1 }}>
                  {creating ? '作成中...' : `この目次で確定（全${outline.chapters.length}章）→`}
                </button>
              </>
            )}
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
