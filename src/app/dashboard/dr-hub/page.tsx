'use client';
// 261: 🚀 発信ハブ — ディープリサーチ記事を起点に note記事・X投稿・Kindle本・戦略・画像へ展開する起点画面。
// 261a: ①ペルソナ別サンプル比較 → note記事全文生成（236テイスト変換の「サンプル→選択→全文」方式を流用）。
// 261b: ②分割記事化（プラン提案→1リクエスト=1記事で生成。シリーズ導線＝10原則ベースのマーケ設計込み）。
// 生成APIは保存しない（R-38と同方針）。保存は SaveToLibraryButton の明示操作のみ。
import { useEffect, useMemo, useRef, useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { loadFeatureDraft, saveFeatureDraft, clearFeatureDraft } from '@/lib/feature-drafts';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdown, copyRichMarkdownForNote } from '@/lib/rich-copy';
import { PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';
import {
  buildScheduleRows,
  scheduleToMarkdown,
  NOTE_SLOTS,
  DEFAULT_SCHEDULE_SLOT,
  type ScheduleSlot,
} from '@/lib/posting-schedule';
import { getSavedModel } from '@/lib/model-preference';
import { EyecatchModal, type EyecatchKind } from '@/components/eyecatch/EyecatchModal';
import NoteEnhancePanel from '@/components/note-enhance/NoteEnhancePanel';
import { emptyNoteEnhance, normalizeNoteEnhance, type NoteEnhanceState } from '@/lib/note-enhance';
import {
  PERSONA_STYLES,
  PERSONA_STYLE_KEYS,
  PERSONA_COMPARE_MIN,
  PERSONA_COMPARE_MAX,
  type PersonaStyleKey,
} from '@/lib/persona-styles';

interface DrItem {
  id: string;
  title: string;
  content: string;
  created_at?: string;
  is_favorite?: number;
}

interface AdCheck {
  status: 'ok' | 'warn';
  findings: string[];
}

interface PersonaArticle {
  personaKey: PersonaStyleKey;
  personaLabel: string;
  content: string;
  /** 264: noteのタイトル欄に貼る用のタイトル案（本文と分離して生成） */
  titles?: string[];
  adCheck?: AdCheck | null;
}

// ② 分割プランの1記事分（/api/dr-hub/split mode:'plan' の articles[]）
interface PlanArticle {
  title: string;
  role: string;
  /** 265c: 対象読者1行（N-03 ターゲットの極小化） */
  audience?: string;
  points: string[];
  bridge: string;
  principles: string[];
}

interface SplitPlan {
  recommendedCount: number;
  reason: string;
  articles: PlanArticle[];
}

interface SplitArticleResult {
  content: string;
  adCheck?: AdCheck | null;
}

type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '短め（1500〜2500字）' },
  { value: 'medium', label: '標準（3000〜4500字）' },
  { value: 'long', label: '長め（5000〜7000字）' },
];

type Feature = 'persona' | 'split' | 'xpost' | 'strategy' | 'schedule';
const FEATURES: Array<{ key: Feature; label: string }> = [
  { key: 'persona', label: '✍️ ペルソナ別note記事' },
  { key: 'split', label: '🧩 分割記事化（シリーズ）' },
  { key: 'xpost', label: '🐦 X投稿連動' },
  { key: 'strategy', label: '📈 発信戦略' },
  { key: 'schedule', label: '🗓 予約投稿カレンダー' },
];

// ③ X投稿の生成結果と保存状態（265c: v2対応＝警告・URLリプライ導線・長さ/型）
interface XPostWarningItem {
  code: string;
  message: string;
}

interface XPostResult {
  single: string;
  thread: string[];
  charLimit: number;
  urlReplyLeadin?: string;
  warnings?: Record<string, XPostWarningItem[]>;
  xLength?: 'short' | 'mini' | 'long';
}

const X_LENGTH_OPTIONS: Array<{ value: 'short' | 'mini' | 'long'; label: string }> = [
  { value: 'short', label: '短文（140字前後）' },
  { value: 'mini', label: 'ミニ講義（1,000〜2,000字・既定）' },
  { value: 'long', label: '長編（3,000〜5,000字）' },
];

const X_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'knowhow', label: '📚 ノウハウ体系化型（既定・保存/共有）' },
  { value: 'story', label: '🔄 Before/After逆転ストーリー型（主語は自分）' },
  { value: 'debate', label: '💬 二者択一・議論型（リプライ）' },
  { value: 'insight', label: '💡 常識破壊・本質論型（引用リポスト）' },
  { value: 'infographic', label: '🖼 図解・インフォグラフィック型（滞在時間）' },
];

interface XSaveState {
  saving: boolean;
  savedId: string;
  error: string;
}

const EMPTY_X_SAVE: XSaveState = { saving: false, savedId: '', error: '' };

// 全角換算の文字数（Xは半角=0.5、全角=1で280単位=全角140字。表示用の目安）
function xCharCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    // 半角英数記号・半角スペースは0.5、それ以外（日本語・絵文字等）は1と数える
    n += /[\x20-\x7e]/.test(ch) ? 0.5 : 1;
  }
  return Math.ceil(n);
}

// 自動下書き（feature_result_drafts feature_key='dr-hub'）のpayload
interface DrHubDraftPayload {
  feature?: Feature;
  drId?: string;
  drTitle?: string;
  personaKeys?: PersonaStyleKey[];
  samples?: Partial<Record<PersonaStyleKey, string>> | null;
  article?: PersonaArticle | null;
  length?: Length;
  // ② 分割記事化
  splitCount?: number | 'auto';
  splitPersona?: PersonaStyleKey | '';
  splitPlan?: SplitPlan | null;
  seriesKey?: string;
  splitArticles?: Record<number, SplitArticleResult>;
  // ③ X投稿連動
  xArticleId?: string;
  xArticleTitle?: string;
  threadCount?: number;
  articleUrl?: string;
  xResult?: XPostResult | null;
  // ⑤ 仕上げ（まとめ・図表・画像配置）の状態。本文とは別レイヤ＝失敗しても本文は無傷
  personaEnhance?: NoteEnhanceState;
  splitEnhance?: Record<number, NoteEnhanceState>;
  // ④ 発信戦略
  strategyDrIds?: string[];
  strategyArticleIds?: string[];
  strategyDoc?: string;
}

const ACCENT = '#e0684b'; // 発信ハブのアクセント（ロケットの暖色系）

export default function DrHubPage() {
  // ── DR記事の選択 ──
  const [drItems, setDrItems] = useState<DrItem[]>([]);
  const [drLoading, setDrLoading] = useState(true);
  const [drError, setDrError] = useState('');
  const [drQuery, setDrQuery] = useState('');
  const [selectedDrId, setSelectedDrId] = useState('');
  const [feature, setFeature] = useState<Feature>('persona');

  // ── ① ペルソナ別サンプル比較 → 全文生成 ──
  const [personaKeys, setPersonaKeys] = useState<PersonaStyleKey[]>([]);
  const [samples, setSamples] = useState<Partial<Record<PersonaStyleKey, string>> | null>(null);
  const [samplesBusy, setSamplesBusy] = useState(false);
  const [fullBusyKey, setFullBusyKey] = useState<PersonaStyleKey | null>(null);
  const [article, setArticle] = useState<PersonaArticle | null>(null);
  const [length, setLength] = useState<Length>('medium');

  // ── ② 分割記事化 ──
  const [splitCount, setSplitCount] = useState<number | 'auto'>('auto');
  const [splitPersona, setSplitPersona] = useState<PersonaStyleKey | ''>('');
  const [splitPlan, setSplitPlan] = useState<SplitPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [seriesKey, setSeriesKey] = useState('');
  const [splitArticles, setSplitArticles] = useState<Record<number, SplitArticleResult>>({});
  const [splitBusyIndex, setSplitBusyIndex] = useState<number | null>(null);
  const [splitRunAll, setSplitRunAll] = useState(false);
  const [openArticleIndex, setOpenArticleIndex] = useState<number | null>(null);

  // ── ③ X投稿連動 ──
  const [noteItems, setNoteItems] = useState<DrItem[]>([]);
  const [noteItemsLoaded, setNoteItemsLoaded] = useState(false);
  const [xSourceKind, setXSourceKind] = useState<'saved' | 'session'>('saved');
  const [xArticleId, setXArticleId] = useState('');
  const [xSessionKey, setXSessionKey] = useState(''); // 'persona' | 'split-1'…
  const [threadCount, setThreadCount] = useState(3);
  const [articleUrl, setArticleUrl] = useState('');
  const [xLengthSel, setXLengthSel] = useState<'short' | 'mini' | 'long'>('mini'); // 265c: 既定=ミニ講義
  const [xTypeSel, setXTypeSel] = useState('knowhow'); // 265c: 既定=①ノウハウ体系化型
  const [appendRipNote, setAppendRipNote] = useState(true); // 「▼詳細はリプ欄に」を末尾に付ける
  const [xResult, setXResult] = useState<XPostResult | null>(null);
  const [xBusy, setXBusy] = useState(false);
  const [xSaveSingle, setXSaveSingle] = useState<XSaveState>(EMPTY_X_SAVE);
  const [xSaveThread, setXSaveThread] = useState<XSaveState>(EMPTY_X_SAVE);

  // ── ⑤ 画像・仕上げ（261d）──
  const [personaEnhance, setPersonaEnhance] = useState<NoteEnhanceState>(emptyNoteEnhance());
  const [splitEnhance, setSplitEnhance] = useState<Record<number, NoteEnhanceState>>({});
  const [eyecatch, setEyecatch] = useState<{ open: boolean; title: string; text: string; kind: EyecatchKind }>({
    open: false,
    title: '',
    text: '',
    kind: 'note',
  });
  // enhance変更の自動下書き保存はデバウンス（入力のたびのPUT連打を避ける。note-articleと同方式）
  const enhanceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ④ 発信戦略（261e）──
  const [strategyDrIds, setStrategyDrIds] = useState<string[]>([]);
  const [strategyArticleIds, setStrategyArticleIds] = useState<string[]>([]);
  const [strategyDoc, setStrategyDoc] = useState('');
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyEdit, setStrategyEdit] = useState(false);
  const [strategySave, setStrategySave] = useState<XSaveState>(EMPTY_X_SAVE);

  // ── 🗓 予約投稿カレンダー（266【3】・NP-02。AI不使用＝選択と日付から即時に割り当て表を導出） ──
  const [schedSelected, setSchedSelected] = useState<string[]>([]); // 選択順を保持（この順で割り当てる）
  const [schedStart, setSchedStart] = useState('');
  const [schedSlots, setSchedSlots] = useState<Partial<Record<number, ScheduleSlot>>>({});
  const [schedDefaultSlot, setSchedDefaultSlot] = useState<ScheduleSlot>(DEFAULT_SCHEDULE_SLOT);

  // 開始日の既定は「明日」（クライアントで一度だけ計算）
  useEffect(() => {
    if (schedStart) return;
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    setSchedStart(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedRows = useMemo(() => {
    const items = schedSelected
      .map((id) => noteItems.find((n) => n.id === id))
      .filter((x): x is DrItem => !!x)
      .map((n) => ({ id: n.id, title: n.title || '(無題)' }));
    return buildScheduleRows(items, schedStart, schedSlots, schedDefaultSlot);
  }, [schedSelected, noteItems, schedStart, schedSlots, schedDefaultSlot]);

  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const selectedDr = useMemo(
    () => drItems.find((d) => d.id === selectedDrId) ?? null,
    [drItems, selectedDrId],
  );

  // 復元取得が返ってきた時点で既に操作が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current =
    samplesBusy || !!fullBusyKey || !!samples || !!article || planBusy || !!splitPlan || xBusy || !!xResult ||
    strategyBusy || !!strategyDoc;

  // ②の逐次生成で最新stateを参照するためのref（連続fetch中のstale closure対策）
  const splitArticlesRef = useRef(splitArticles);
  splitArticlesRef.current = splitArticles;

  // DR記事一覧（📚リサーチ保存の type='deepresearch'）を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/library?type=deepresearch');
        if (!res.ok) throw new Error(`一覧の取得に失敗しました（${res.status}）`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setDrItems(data as DrItem[]);
      } catch (e: unknown) {
        if (!cancelled) setDrError(e instanceof Error ? e.message : 'DR記事一覧を取得できませんでした');
      } finally {
        if (!cancelled) setDrLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // マウント時に前回の実行結果（自動下書き）を復元（R-20）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DrHubDraftPayload>('dr-hub');
      if (cancelled || !draft?.payload) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      if (!p.samples && !p.article && !p.splitPlan) return;
      if (p.feature) setFeature(p.feature);
      if (p.drId) setSelectedDrId(p.drId);
      if (Array.isArray(p.personaKeys)) {
        setPersonaKeys(p.personaKeys.filter((k) => k in PERSONA_STYLES));
      }
      setSamples(p.samples ?? null);
      setArticle(p.article ?? null);
      if (p.length) setLength(p.length);
      if (p.splitCount) setSplitCount(p.splitCount);
      if (p.splitPersona && p.splitPersona in PERSONA_STYLES) setSplitPersona(p.splitPersona);
      setSplitPlan(p.splitPlan ?? null);
      if (p.seriesKey) setSeriesKey(p.seriesKey);
      if (p.splitArticles) setSplitArticles(p.splitArticles);
      if (p.xArticleId) setXArticleId(p.xArticleId);
      if (p.threadCount && p.threadCount >= 2 && p.threadCount <= 5) setThreadCount(p.threadCount);
      if (p.articleUrl) setArticleUrl(p.articleUrl);
      setXResult(p.xResult ?? null);
      if (p.personaEnhance) setPersonaEnhance(normalizeNoteEnhance(p.personaEnhance));
      if (p.splitEnhance && typeof p.splitEnhance === 'object') {
        const m: Record<number, NoteEnhanceState> = {};
        for (const [k, v] of Object.entries(p.splitEnhance)) m[Number(k)] = normalizeNoteEnhance(v);
        setSplitEnhance(m);
      }
      if (Array.isArray(p.strategyDrIds)) setStrategyDrIds(p.strategyDrIds.map(String));
      if (Array.isArray(p.strategyArticleIds)) setStrategyArticleIds(p.strategyArticleIds.map(String));
      if (typeof p.strategyDoc === 'string') setStrategyDoc(p.strategyDoc);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ③④🗓のタブを開いたら保存済みnote記事の一覧を読み込む（開くまで取得しない）
  useEffect(() => {
    if ((feature !== 'xpost' && feature !== 'strategy' && feature !== 'schedule') || noteItemsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/library?type=note-article');
        if (!res.ok) return; // 一覧が取れなくてもセッション内記事から作れる（劣化で許容）
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setNoteItems(data as DrItem[]);
      } catch {
        /* 一覧なしでも動く */
      } finally {
        if (!cancelled) setNoteItemsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feature, noteItemsLoaded]);

  const handleClearDraft = () => {
    setRestoredAt(null);
    setSamples(null);
    setArticle(null);
    setPersonaKeys([]);
    setSplitPlan(null);
    setSplitArticles({});
    setSeriesKey('');
    setXResult(null);
    setXSaveSingle(EMPTY_X_SAVE);
    setXSaveThread(EMPTY_X_SAVE);
    setPersonaEnhance(emptyNoteEnhance());
    setSplitEnhance({});
    setStrategyDoc('');
    setStrategyEdit(false);
    setStrategySave(EMPTY_X_SAVE);
    clearFeatureDraft('dr-hub');
  };

  // 下書き保存の共通化（そのとき点の全状態をまとめて保存）
  const persistDraft = (over: Partial<DrHubDraftPayload> = {}) => {
    saveFeatureDraft('dr-hub', {
      feature,
      drId: selectedDrId,
      drTitle: selectedDr?.title,
      personaKeys,
      samples,
      article,
      length,
      splitCount,
      splitPersona,
      splitPlan,
      seriesKey,
      splitArticles: splitArticlesRef.current,
      xArticleId,
      threadCount,
      articleUrl,
      xResult,
      personaEnhance,
      splitEnhance,
      strategyDrIds,
      strategyArticleIds,
      strategyDoc,
      ...over,
    } satisfies DrHubDraftPayload);
  };

  // ⑤ 仕上げ状態の変更（デバウンスして下書き保存）
  const handlePersonaEnhanceChange = (next: NoteEnhanceState) => {
    setPersonaEnhance(next);
    if (enhanceSaveTimer.current) clearTimeout(enhanceSaveTimer.current);
    enhanceSaveTimer.current = setTimeout(() => persistDraft({ personaEnhance: next }), 1200);
  };

  const handleSplitEnhanceChange = (index: number, next: NoteEnhanceState) => {
    setSplitEnhance((prev) => {
      const merged = { ...prev, [index]: next };
      if (enhanceSaveTimer.current) clearTimeout(enhanceSaveTimer.current);
      enhanceSaveTimer.current = setTimeout(() => persistDraft({ splitEnhance: merged }), 1200);
      return merged;
    });
  };

  const filteredDr = useMemo(() => {
    const q = drQuery.trim().toLowerCase();
    if (!q) return drItems;
    return drItems.filter((d) => (d.title || '').toLowerCase().includes(q));
  }, [drItems, drQuery]);

  const togglePersona = (key: PersonaStyleKey) => {
    setPersonaKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= PERSONA_COMPARE_MAX) return prev; // 上限4（それ以上は無反応でなくカウンタで示す）
      return [...prev, key];
    });
  };

  const canGenerateSamples =
    !!selectedDrId && personaKeys.length >= PERSONA_COMPARE_MIN && personaKeys.length <= PERSONA_COMPARE_MAX;

  const generateSamples = async () => {
    if (!canGenerateSamples || samplesBusy) return;
    setSamplesBusy(true);
    setError('');
    setRestoredAt(null);
    setSamples(null);
    setArticle(null);
    try {
      const res = await fetch('/api/dr-hub/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drId: selectedDrId, mode: 'samples', personaKeys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `サンプル生成に失敗しました（${res.status}）`);
      setSamples(data.samples ?? null);
      persistDraft({ samples: data.samples ?? null, article: null });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'サンプル生成に失敗しました');
    } finally {
      setSamplesBusy(false);
    }
  };

  const generateFull = async (personaKey: PersonaStyleKey) => {
    if (!selectedDrId || fullBusyKey) return;
    setFullBusyKey(personaKey);
    setError('');
    setRestoredAt(null);
    try {
      const res = await fetch('/api/dr-hub/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drId: selectedDrId,
          mode: 'full',
          personaKey,
          length,
          model: getSavedModel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `記事の生成に失敗しました（${res.status}）`);
      const next: PersonaArticle = {
        personaKey,
        personaLabel: data.personaLabel || PERSONA_STYLES[personaKey].label,
        content: data.content || '',
        titles: Array.isArray(data.titles) ? data.titles : [],
        adCheck: data.ad_check ?? null,
      };
      setArticle(next);
      persistDraft({ article: next });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '記事の生成に失敗しました');
    } finally {
      setFullBusyKey(null);
    }
  };

  // ── ② 分割プランの提案 ──
  const generatePlan = async () => {
    if (!selectedDrId || planBusy) return;
    setPlanBusy(true);
    setError('');
    setRestoredAt(null);
    setSplitPlan(null);
    setSplitArticles({});
    try {
      const res = await fetch('/api/dr-hub/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drId: selectedDrId,
          mode: 'plan',
          count: splitCount === 'auto' ? 'auto' : splitCount,
          personaKey: splitPersona || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `分割プランの提案に失敗しました（${res.status}）`);
      const plan: SplitPlan = {
        recommendedCount: data.recommendedCount ?? (data.articles?.length || 0),
        reason: data.reason ?? '',
        articles: Array.isArray(data.articles) ? data.articles : [],
      };
      // シリーズ識別キー（保存時のmetadataで記事同士を関連付ける。229Bの関連付け方式の簡易版）
      const key =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `series-${Math.random().toString(36).slice(2)}`;
      setSplitPlan(plan);
      setSeriesKey(key);
      splitArticlesRef.current = {};
      persistDraft({ splitPlan: plan, seriesKey: key, splitArticles: {} });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '分割プランの提案に失敗しました');
    } finally {
      setPlanBusy(false);
    }
  };

  // ── ② 1記事分を生成（部分成功方針。全記事生成は直列で回す） ──
  const generateSplitArticle = async (index: number): Promise<boolean> => {
    if (!selectedDrId || !splitPlan) return false;
    const a = splitPlan.articles[index - 1];
    if (!a) return false;
    setSplitBusyIndex(index);
    setError('');
    try {
      const res = await fetch('/api/dr-hub/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drId: selectedDrId,
          mode: 'article',
          article: a,
          series: {
            index,
            total: splitPlan.articles.length,
            prevTitle: splitPlan.articles[index - 2]?.title ?? '',
            nextTitle: splitPlan.articles[index]?.title ?? '',
          },
          personaKey: splitPersona || undefined,
          length,
          model: getSavedModel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `第${index}記事の生成に失敗しました（${res.status}）`);
      const next = {
        ...splitArticlesRef.current,
        [index]: { content: data.content || '', adCheck: data.ad_check ?? null },
      };
      splitArticlesRef.current = next;
      setSplitArticles(next);
      persistDraft({ splitArticles: next });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `第${index}記事の生成に失敗しました`);
      return false;
    } finally {
      setSplitBusyIndex(null);
    }
  };

  const generateAllSplitArticles = async () => {
    if (!splitPlan || splitRunAll || splitBusyIndex) return;
    setSplitRunAll(true);
    try {
      for (let i = 1; i <= splitPlan.articles.length; i++) {
        if (splitArticlesRef.current[i]?.content) continue; // 生成済みは飛ばす（部分成功の続きから）
        const ok = await generateSplitArticle(i);
        if (!ok) break; // 失敗したら止める（エラーは画面に出ている）
      }
    } finally {
      setSplitRunAll(false);
    }
  };

  const articleTitle = useMemo(() => {
    if (!article) return '';
    // 264以降はタイトル案の1本目を正とする（本文に # h1 は入らない）。旧形式は # 抽出でフォールバック
    const fromTitles = article.titles?.[0]?.trim();
    if (fromTitles) return fromTitles;
    const m = article.content.match(/^#\s+(.+)$/m);
    return (m?.[1] || `${article.personaLabel}向け: ${selectedDr?.title ?? ''}`).trim();
  }, [article, selectedDr]);

  // ── ③ このセッションで生成した記事（①・②）を連動元に選べるようにする ──
  const sessionArticleOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; title: string; content: string }> = [];
    if (article) {
      const m = article.content.match(/^#\s+(.+)$/m);
      opts.push({
        key: 'persona',
        label: `①の記事（${article.personaLabel}）`,
        title: article.titles?.[0]?.trim() || (m?.[1] ?? '').trim() || `${article.personaLabel}向け記事`,
        content: article.content,
      });
    }
    if (splitPlan) {
      for (let i = 1; i <= splitPlan.articles.length; i++) {
        const r = splitArticles[i];
        if (r?.content) {
          opts.push({
            key: `split-${i}`,
            label: `②の第${i}記事`,
            title: splitPlan.articles[i - 1].title,
            content: r.content,
          });
        }
      }
    }
    return opts;
  }, [article, splitPlan, splitArticles]);

  const xSourceReady =
    xSourceKind === 'saved' ? !!xArticleId : !!sessionArticleOptions.find((o) => o.key === xSessionKey);

  const generateXPosts = async () => {
    if (!xSourceReady || xBusy) return;
    setXBusy(true);
    setError('');
    setRestoredAt(null);
    setXResult(null);
    setXSaveSingle(EMPTY_X_SAVE);
    setXSaveThread(EMPTY_X_SAVE);
    try {
      const session = sessionArticleOptions.find((o) => o.key === xSessionKey);
      const res = await fetch('/api/dr-hub/x-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(xSourceKind === 'saved'
            ? { articleId: xArticleId }
            : { article: { title: session?.title ?? '', content: session?.content ?? '' } }),
          threadCount,
          xLength: xLengthSel,
          postType: xTypeSel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `X投稿の生成に失敗しました（${res.status}）`);
      const result: XPostResult = {
        single: data.single ?? '',
        thread: Array.isArray(data.thread) ? data.thread : [],
        charLimit: data.charLimit ?? 25000,
        urlReplyLeadin: data.urlReplyLeadin ?? '',
        warnings: data.warnings ?? {},
        xLength: data.xLength ?? xLengthSel,
      };
      setXResult(result);
      persistDraft({ xResult: result });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'X投稿の生成に失敗しました');
    } finally {
      setXBusy(false);
    }
  };

  // 265c: URLは本文に入れない（X-03）。1つ目のリプライへ置く前提の「2通目」を別に組み立てる
  const ripNote = (text: string) => (appendRipNote ? `${text}\n\n▼詳細はリプ欄に` : text);
  const urlReplyContent = `${xResult?.urlReplyLeadin || '本文で触れた記事の全文はこちらです'}\n👉 ${articleUrl.trim() || '（記事URLをここに貼ってください）'}`;

  // ③ 保存（ペア管理: /api/dr-hub/x-post/save）。R-53: 保存済み表示・失敗時再試行を状態で持つ
  const saveXPost = async (kind: 'single' | 'thread') => {
    if (!xResult) return;
    const setState = kind === 'single' ? setXSaveSingle : setXSaveThread;
    const replySection = `\n\n---\n\n[1つ目のリプライ（URL用）]\n${urlReplyContent}`;
    const content =
      kind === 'single'
        ? ripNote(xResult.single) + replySection
        : xResult.thread.map((t, i) => `${i + 1}/${xResult.thread.length}\n${i === 0 ? ripNote(t) : t}`).join('\n\n---\n\n') + replySection;
    setState({ saving: true, savedId: '', error: '' });
    try {
      const res = await fetch('/api/dr-hub/x-post/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: kind,
          articleId: xSourceKind === 'saved' ? xArticleId : '',
          drId: selectedDrId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setState({ saving: false, savedId: data.id ?? 'saved', error: '' });
    } catch (e: unknown) {
      setState({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' });
    }
  };

  // ── ④ 発信戦略 ──
  const toggleStrategyDr = (id: string) => {
    setStrategyDrIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id].slice(0, 10)));
  };
  const toggleStrategyArticle = (id: string) => {
    setStrategyArticleIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id].slice(0, 10)));
  };

  // ④タブを開いたとき、STEP1で選んだDR記事を初期選択に含める（未選択のときだけ）
  useEffect(() => {
    if (feature === 'strategy' && selectedDrId && strategyDrIds.length === 0) {
      setStrategyDrIds([selectedDrId]);
    }
    // strategyDrIds を依存に入れると選択解除のたびに再選択されてしまうため意図的に外す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, selectedDrId]);

  const generateStrategy = async () => {
    if (strategyDrIds.length === 0 || strategyBusy) return;
    setStrategyBusy(true);
    setError('');
    setRestoredAt(null);
    setStrategySave(EMPTY_X_SAVE);
    try {
      const res = await fetch('/api/dr-hub/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drIds: strategyDrIds,
          articleIds: strategyArticleIds,
          model: getSavedModel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `戦略の生成に失敗しました（${res.status}）`);
      setStrategyDoc(data.content || '');
      setStrategyEdit(false);
      persistDraft({ strategyDoc: data.content || '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '戦略の生成に失敗しました');
    } finally {
      setStrategyBusy(false);
    }
  };

  // ④ 保存: 🗃保存一覧（text_analysis_saves）へ「編集可能なドキュメント」として保存
  const saveStrategy = async () => {
    if (!strategyDoc.trim() || strategySave.saving) return;
    setStrategySave({ saving: true, savedId: '', error: '' });
    try {
      const m = strategyDoc.match(/^#\s+(.+)$/m);
      const title = (m?.[1] || `発信戦略: ${selectedDr?.title ?? ''}`).trim();
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: strategyDoc,
          analysisType: 'dr_hub_strategy',
          analysisLabel: '発信戦略',
          tags: ['発信戦略', '発信ハブ'],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setStrategySave({ saving: false, savedId: String(data.id ?? data.save?.id ?? 'saved'), error: '' });
    } catch (e: unknown) {
      setStrategySave({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' });
    }
  };

  // ── 🗓 カレンダーの選択・コピー ──
  const toggleSched = (id: string) => {
    setSchedSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
    setSchedSlots({}); // 選択が変わったら行ごとの時間帯上書きはリセット（対応がズレるのを防ぐ）
  };

  const copySchedule = async () => {
    if (schedRows.length === 0) return;
    try {
      await copyRichMarkdown(scheduleToMarkdown(schedRows));
      setCopied('schedule');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* 失敗時はボタン表示が変わらない */
    }
  };

  // ── ⑥ Kindle本づくりへのhandoff（230/231の方式: sessionStorage＋読取後削除は受信側） ──
  const sendToKindle = () => {
    if (!selectedDrId) return;
    try {
      sessionStorage.setItem('lumina_kindle_selected', JSON.stringify([selectedDrId]));
    } catch {
      /* プライベートモード等で書けなくても遷移は続行（Kindle側で選び直せる） */
    }
    window.location.href = '/dashboard/kindle-wizard';
  };

  const handleCopy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // 264→266【1】: note用のリッチコピー（text/html＋plain同時）。
  // note は h2=大見出し/h3=小見出しのため、専用ラッパーで見出しを1段繰り上げてから書く
  // （表示用 renderMarkdown の1段下げをそのまま貼ると全見出しが小見出しに落ちる）
  const handleRichCopy = async (text: string, key: string) => {
    try {
      await copyRichMarkdownForNote(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* 失敗時はボタン表示が変わらない（コピーできていないことが分かる） */
    }
  };

  const sampleKeys = samples
    ? PERSONA_STYLE_KEYS.filter((k) => typeof samples[k] === 'string' && samples[k])
    : [];

  const splitDoneCount = splitPlan
    ? splitPlan.articles.filter((_, i) => splitArticles[i + 1]?.content).length
    : 0;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        発信ハブ
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        ディープリサーチ記事を起点に、note記事・X投稿・Kindle本・発信戦略・画像へ展開します
        {/* 265a: 生成の土台にしているナレッジの版（KB自身が定期更新前提のため見えるところに出す） */}
        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          📚 ナレッジ v{PLAYBOOK_VERSION}
        </span>
      </p>

      {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />}

      {/* 関連機能への導線 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/deepresearch', icon: '🔭', label: 'ディープリサーチ' },
          { href: '/dashboard/library', icon: '📚', label: 'リサーチ保存' },
          { href: '/dashboard/note-article', icon: '✍️', label: 'note記事生成' },
          { href: '/dashboard/kindle-wizard', icon: '📕', label: 'Kindle本づくり' },
        ].map((link) => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* ── STEP1: DR記事を選ぶ ── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            1️⃣ 元になるDR記事を選ぶ
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* ⑥ Kindle本づくりへのhandoff（選んだDR記事を素材として引き継ぐ・230/231方式） */}
            <button
              type="button"
              onClick={sendToKindle}
              disabled={!selectedDrId}
              title="選んだDR記事を素材として📕Kindle本づくりへ引き継ぎます"
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                cursor: selectedDrId ? 'pointer' : 'not-allowed', opacity: selectedDrId ? 1 : 0.5,
              }}
            >
              📕 Kindle本づくりへ
            </button>
            <input
              value={drQuery}
              onChange={(e) => setDrQuery(e.target.value)}
              placeholder="🔍 タイトルで絞り込み"
              style={{ padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', minWidth: 220 }}
            />
          </div>
        </div>

        {drLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>読み込み中…</div>
        )}
        {drError && (
          <div style={{ padding: 12, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
            {drError}
          </div>
        )}
        {!drLoading && !drError && drItems.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>
            保存済みのDR記事がありません。先に 🔭 ディープリサーチで調査し、📚 リサーチ保存に保存してください。
          </div>
        )}

        {filteredDr.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {filteredDr.map((d) => {
              const selected = d.id === selectedDrId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDrId(selected ? '' : d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: selected ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                    background: selected ? `${ACCENT}12` : 'var(--bg-primary)',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{selected ? '🔘' : '⚪'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.is_favorite ? '⭐ ' : ''}{d.title || '(無題)'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                      {(d.created_at || '').slice(0, 10)}・{(d.content || '').length.toLocaleString()}字
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── STEP2: 機能を選ぶ ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFeature(f.key)}
            style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: feature === f.key ? `2px solid ${ACCENT}` : '1px solid var(--border)',
              background: feature === f.key ? `${ACCENT}12` : 'var(--bg-secondary)',
              color: feature === f.key ? ACCENT : 'var(--text-muted)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── ① ペルソナ別note記事 ── */}
      {feature === 'persona' && (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ ✍️ ペルソナ別note記事（読み比べて選ぶ）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          読者ペルソナを{PERSONA_COMPARE_MIN}〜{PERSONA_COMPARE_MAX}つ選ぶと、それぞれの冒頭サンプルを横並びで読み比べられます。気に入ったペルソナで記事全文を生成します。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
          {PERSONA_STYLE_KEYS.map((k) => {
            const p = PERSONA_STYLES[k];
            const checked = personaKeys.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => togglePersona(k)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'var(--bg-primary)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {checked ? '☑' : '☐'} {p.emoji} {p.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.hint}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: personaKeys.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            選択中: {personaKeys.length}/{PERSONA_COMPARE_MAX}件
            {!selectedDrId && '（先にDR記事を選んでください）'}
          </div>
          <button
            type="button"
            onClick={generateSamples}
            disabled={!canGenerateSamples || samplesBusy}
            style={{
              padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14, cursor: !canGenerateSamples || samplesBusy ? 'not-allowed' : 'pointer',
              opacity: !canGenerateSamples || samplesBusy ? 0.5 : 1,
            }}
          >
            {samplesBusy ? 'サンプル生成中…' : '📝 サンプルを生成して読み比べる'}
          </button>
        </div>
      </div>
      )}

      {/* ── ② 分割記事化 ── */}
      {feature === 'split' && (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ 🧩 分割記事化（DR記事1本 → note記事シリーズ）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          DR記事を1〜5本のnote記事シリーズに分割します。記事間の導線（第1記事で問題提起→続きへの興味／最終記事でまとめとCTA）をAIが設計します。
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            分割数:
            <select
              value={String(splitCount)}
              onChange={(e) => setSplitCount(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              <option value="auto">🤖 AIにおまかせ（1〜5）</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}記事に分割</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            読者ペルソナ:
            <select
              value={splitPersona}
              onChange={(e) => setSplitPersona(e.target.value as PersonaStyleKey | '')}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              <option value="">指定なし（一般読者）</option>
              {PERSONA_STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{PERSONA_STYLES[k].emoji} {PERSONA_STYLES[k].label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            記事の長さ:
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as Length)}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              {LENGTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {!selectedDrId && '先にDR記事を選んでください'}
          </div>
          <button
            type="button"
            onClick={generatePlan}
            disabled={!selectedDrId || planBusy}
            style={{
              padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14, cursor: !selectedDrId || planBusy ? 'not-allowed' : 'pointer',
              opacity: !selectedDrId || planBusy ? 0.5 : 1,
            }}
          >
            {planBusy ? 'プランを提案中…' : '🧩 分割プランを提案してもらう'}
          </button>
        </div>
      </div>
      )}

      {/* ── ③ X投稿連動 ── */}
      {feature === 'xpost' && (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ 🐦 X投稿連動（記事への導線ポスト）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          note記事への導線となるX投稿を、単発ポストとスレッド形式の両方で作ります。Xへの自動投稿は行いません（コピーして貼り付ける運用です）。
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {([
            { kind: 'saved' as const, label: '📚 保存済みのnote記事から' },
            { kind: 'session' as const, label: '🆕 この画面で生成した記事から' },
          ]).map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => setXSourceKind(o.kind)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: xSourceKind === o.kind ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                background: xSourceKind === o.kind ? `${ACCENT}12` : 'var(--bg-primary)',
                color: xSourceKind === o.kind ? ACCENT : 'var(--text-muted)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {xSourceKind === 'saved' && (
          <div style={{ marginBottom: 10 }}>
            {noteItems.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {noteItemsLoaded ? '保存済みのnote記事がありません。①や②で記事を作って保存するとここに出ます。' : '読み込み中…'}
              </div>
            ) : (
              <select
                value={xArticleId}
                onChange={(e) => setXArticleId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              >
                <option value="">— 連動元のnote記事を選ぶ —</option>
                {noteItems.map((n) => (
                  <option key={n.id} value={n.id}>{n.title || '(無題)'}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {xSourceKind === 'session' && (
          <div style={{ marginBottom: 10 }}>
            {sessionArticleOptions.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                まだこの画面で生成した記事がありません。①ペルソナ別記事 か ②分割記事化 で記事を作るとここに出ます。
              </div>
            ) : (
              <select
                value={xSessionKey}
                onChange={(e) => setXSessionKey(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              >
                <option value="">— 連動元の記事を選ぶ —</option>
                {sessionArticleOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}: {o.title}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {/* 265c: 長さ3プリセット（既定=ミニ講義。Xプレミアム前提・上限25,000字） */}
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            長さ:
            <select
              data-x-length
              value={xLengthSel}
              onChange={(e) => setXLengthSel(e.target.value as 'short' | 'mini' | 'long')}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              {X_LENGTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {/* 265c: 投稿テンプレート5型（X-07。既定=①ノウハウ体系化型） */}
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            型:
            <select
              data-x-type
              value={xTypeSel}
              onChange={(e) => setXTypeSel(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              {X_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            スレッドの本数:
            <select
              value={threadCount}
              onChange={(e) => setThreadCount(Number(e.target.value))}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}ポスト</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 260 }}>
            記事URL（任意）:
            <input
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://note.com/…（コピー時に末尾へ付けます）"
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={generateXPosts}
            disabled={!xSourceReady || xBusy}
            style={{
              padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14, cursor: !xSourceReady || xBusy ? 'not-allowed' : 'pointer',
              opacity: !xSourceReady || xBusy ? 0.5 : 1,
            }}
          >
            {xBusy ? 'X投稿を生成中…' : '🐦 X投稿を生成する（単発＋スレッド）'}
          </button>
        </div>
      </div>
      )}

      {/* ── ④ 発信戦略 ── */}
      {feature === 'strategy' && (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ 📈 発信戦略の策定（AIの提案）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          選んだDR記事群・note記事群から、ターゲティング／投稿スケジュール／note⇄X⇄Kindleの導線設計を提案します。戦略はあくまで提案で、成果を保証するものではありません。
        </p>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          対象のDR記事（{strategyDrIds.length}/10件選択中）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
          {drItems.map((d) => {
            const checked = strategyDrIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleStrategyDr(d.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 12px',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              >
                <span>{checked ? '☑' : '☐'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || '(無題)'}</span>
              </button>
            );
          })}
          {drItems.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>保存済みのDR記事がありません。</div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          生成済みのnote記事も加える（任意・{strategyArticleIds.length}/10件選択中）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 12 }}>
          {noteItems.map((n) => {
            const checked = strategyArticleIds.includes(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleStrategyArticle(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 12px',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              >
                <span>{checked ? '☑' : '☐'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || '(無題)'}</span>
              </button>
            );
          })}
          {noteItems.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {noteItemsLoaded ? '保存済みのnote記事がありません（DR記事だけでも策定できます）。' : '読み込み中…'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={generateStrategy}
            disabled={strategyDrIds.length === 0 || strategyBusy}
            style={{
              padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14, cursor: strategyDrIds.length === 0 || strategyBusy ? 'not-allowed' : 'pointer',
              opacity: strategyDrIds.length === 0 || strategyBusy ? 0.5 : 1,
            }}
          >
            {strategyBusy ? '戦略を策定中…' : '📈 発信戦略を策定してもらう'}
          </button>
        </div>
      </div>
      )}

      {/* ── 🗓 予約投稿カレンダー（266・NP-02） ── */}
      {feature === 'schedule' && (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ 🗓 予約投稿カレンダー（書き溜め→平日に予約）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          保存済みのnote記事を選ぶと、平日1日1本で公開日時を割り当てた表を作ります（既定: 夜20:30）。
          予約の実行は<strong>note側の予約投稿機能</strong>で行います（このアプリからの自動投稿・note連携はしません）。
        </p>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          予約する記事（選んだ順に割り当て・{schedSelected.length}件選択中）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
          {noteItems.map((n) => {
            const idx = schedSelected.indexOf(n.id);
            const checked = idx >= 0;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleSched(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 12px',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              >
                <span style={{ minWidth: 22, fontWeight: 700, color: checked ? ACCENT : 'var(--text-muted)' }}>
                  {checked ? `${idx + 1}.` : '☐'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || '(無題)'}</span>
              </button>
            );
          })}
          {noteItems.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {noteItemsLoaded ? '保存済みのnote記事がありません。①や②で記事を作って保存するとここに出ます。' : '読み込み中…'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            開始日:
            <input
              type="date"
              data-sched-start
              value={schedStart}
              onChange={(e) => setSchedStart(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            />
            <span style={{ fontSize: 11 }}>（土日は次の月曜へ送ります）</span>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            時間帯の既定:
            <select
              data-sched-slot
              value={schedDefaultSlot}
              onChange={(e) => { setSchedDefaultSlot(e.target.value as ScheduleSlot); setSchedSlots({}); }}
              style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              <option value="night">🌙 夜 20:30（長文・有料向き・既定）</option>
              <option value="morning">☀️ 朝 7:30</option>
              <option value="noon">🍱 昼 12:30</option>
            </select>
          </label>
        </div>
      </div>
      )}

      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── ① サンプル比較（2〜4列） ── */}
      {feature === 'persona' && sampleKeys.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              3️⃣ 読み比べて、記事全文にするペルソナを選ぶ
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              記事の長さ:
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as Length)}
                style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
              >
                {LENGTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          {/* 2〜4列の横並び比較（狭い画面では折り返す） */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {sampleKeys.map((k) => {
              const p = PERSONA_STYLES[k];
              const busy = fullBusyKey === k;
              return (
                <div key={k} style={{ background: 'var(--bg-secondary)', border: article?.personaKey === k ? `2px solid ${ACCENT}` : '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {p.emoji} {p.label}
                  </div>
                  <div
                    className="markdown-body"
                    style={{ flex: 1, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(samples?.[k] ?? '') }}
                  />
                  <button
                    type="button"
                    onClick={() => generateFull(k)}
                    disabled={!!fullBusyKey}
                    style={{
                      padding: '10px 16px', background: busy ? 'var(--bg-primary)' : `${ACCENT}15`,
                      color: ACCENT, border: `1px solid ${ACCENT}50`, borderRadius: 8,
                      fontWeight: 700, fontSize: 13, cursor: fullBusyKey ? 'not-allowed' : 'pointer',
                      opacity: fullBusyKey && !busy ? 0.5 : 1,
                    }}
                  >
                    {busy ? '全文を生成中…' : 'このペルソナで記事全文を生成'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ① 記事全文 ── */}
      {feature === 'persona' && article && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              📄 生成された記事（{PERSONA_STYLES[article.personaKey].emoji} {article.personaLabel}）
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <SaveToLibraryButton
                title={articleTitle}
                content={article.content}
                type="note-article"
                groupName="note記事"
                tags="note記事,下書き,発信ハブ"
                metadata={{
                  from: 'dr-hub',
                  sourceDrId: selectedDrId,
                  sourceDrTitle: selectedDr?.title ?? '',
                  persona: article.personaKey,
                }}
              />
              <button
                type="button"
                data-copy-note
                onClick={() => handleRichCopy(article.content, 'persona-note')}
                title="noteエディタに貼ると見出し・太字が保持される形式でコピーします"
                style={{ padding: '6px 14px', background: `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {copied === 'persona-note' ? '✅ コピー済み' : '📋 note用にコピー'}
              </button>
              <button
                type="button"
                data-copy-md
                onClick={() => handleCopy(article.content, 'persona-md')}
                title="生のMarkdownをコピーします（他ツール・保管用）"
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                {copied === 'persona-md' ? '✅ コピー済み' : '📋 Markdownでコピー'}
              </button>
              <button
                type="button"
                onClick={() => setEyecatch({ open: true, title: articleTitle, text: article.content, kind: 'note' })}
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                🎨 見出し画像を作る
              </button>
            </div>
          </div>

          {/* 264: タイトル案（noteのタイトル欄に貼るため本文と分離。1本ずつコピーできる） */}
          {(article.titles?.length ?? 0) > 0 && (
            <div data-title-suggestions style={{ padding: 12, background: `${ACCENT}0d`, border: `1px solid ${ACCENT}30`, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                🏷 タイトル案（noteのタイトル欄に貼り付け）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {article.titles!.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(t, `title-${i}`)}
                      style={{ padding: '4px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 11, flex: 'none' }}
                    >
                      {copied === `title-${i}` ? '✅' : '📋 コピー'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {article.adCheck && article.adCheck.status === 'warn' && article.adCheck.findings.length > 0 && (
            <div style={{ padding: 12, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 6 }}>
                ⚠️ 医療広告表現の自己チェック（投稿前に確認してください）
              </div>
              {article.adCheck.findings.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>・{f}</div>
              ))}
            </div>
          )}

          <div
            className="markdown-body"
            style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
          />

          {/* ⑤ 仕上げ（まとめ・図表・画像配置・貼り付けキット。既存note系機能をそのまま接続） */}
          <div style={{ marginTop: 16 }}>
            <NoteEnhancePanel
              title={articleTitle}
              content={article.content}
              state={personaEnhance}
              onChange={handlePersonaEnhanceChange}
            />
          </div>
        </div>
      )}

      {/* ── ② 分割プランと記事生成 ── */}
      {feature === 'split' && splitPlan && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              3️⃣ プランを確認して、記事を生成する（{splitDoneCount}/{splitPlan.articles.length}本 生成済み）
            </div>
            <button
              type="button"
              onClick={generateAllSplitArticles}
              disabled={splitRunAll || splitBusyIndex !== null || splitDoneCount >= splitPlan.articles.length}
              style={{
                padding: '10px 20px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
                fontWeight: 700, fontSize: 13,
                cursor: splitRunAll || splitBusyIndex !== null ? 'not-allowed' : 'pointer',
                opacity: splitRunAll || splitBusyIndex !== null || splitDoneCount >= splitPlan.articles.length ? 0.5 : 1,
              }}
            >
              {splitRunAll ? `順に生成中…（${splitDoneCount}/${splitPlan.articles.length}）` : '▶️ 残りの記事を順に生成'}
            </button>
          </div>

          {splitPlan.reason && (
            <div style={{ padding: 12, background: `${ACCENT}0d`, border: `1px solid ${ACCENT}30`, borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              🤖 AIの提案: {splitPlan.recommendedCount}本構成 — {splitPlan.reason}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {splitPlan.articles.map((a, i) => {
              const index = i + 1;
              const result = splitArticles[index];
              const busy = splitBusyIndex === index;
              const isOpen = openArticleIndex === index;
              return (
                <div key={index} style={{ background: 'var(--bg-secondary)', border: result ? `1px solid ${ACCENT}50` : '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, marginBottom: 2 }}>
                        第{index}記事{a.role ? `｜${a.role}` : ''}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                        {a.title}
                      </div>
                      {a.audience && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          🎯 対象読者: {a.audience}
                        </div>
                      )}
                      {a.points.length > 0 && (
                        <ul style={{ margin: '0 0 6px 18px', padding: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                          {a.points.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ul>
                      )}
                      {a.bridge && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>↪ 導線設計: {a.bridge}</div>
                      )}
                      {a.principles.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                          {a.principles.map((p, j) => (
                            <span key={j} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {!result && (
                        <button
                          type="button"
                          onClick={() => generateSplitArticle(index)}
                          disabled={splitBusyIndex !== null || splitRunAll}
                          style={{
                            padding: '8px 16px', background: `${ACCENT}15`, color: ACCENT,
                            border: `1px solid ${ACCENT}50`, borderRadius: 8, fontWeight: 700, fontSize: 12,
                            cursor: splitBusyIndex !== null || splitRunAll ? 'not-allowed' : 'pointer',
                            opacity: splitBusyIndex !== null && !busy ? 0.5 : 1,
                          }}
                        >
                          {busy ? '生成中…' : 'この記事を生成'}
                        </button>
                      )}
                      {result && (
                        <>
                          <SaveToLibraryButton
                            title={a.title}
                            content={result.content}
                            type="note-article"
                            groupName="note記事"
                            tags="note記事,下書き,発信ハブ,シリーズ"
                            metadata={{
                              from: 'dr-hub-split',
                              sourceDrId: selectedDrId,
                              sourceDrTitle: selectedDr?.title ?? '',
                              seriesKey,
                              seriesIndex: index,
                              seriesTotal: splitPlan.articles.length,
                              persona: splitPersona || null,
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setOpenArticleIndex(isOpen ? null : index)}
                              style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                            >
                              {isOpen ? '▲ 本文を閉じる' : '▼ 本文を読む'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(result.content, `split-${index}`)}
                              style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                            >
                              {copied === `split-${index}` ? '✅ コピー済み' : '📋 コピー'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEyecatch({ open: true, title: a.title, text: result.content, kind: 'note' })}
                              style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                            >
                              🎨 画像
                            </button>
                            <button
                              type="button"
                              onClick={() => generateSplitArticle(index)}
                              disabled={splitBusyIndex !== null || splitRunAll}
                              title="同じプランでこの記事だけ作り直します（現在の本文は置き換わります）"
                              style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: splitBusyIndex !== null || splitRunAll ? 'not-allowed' : 'pointer', fontSize: 12 }}
                            >
                              {busy ? '生成中…' : '🔄 再生成'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {result?.adCheck && result.adCheck.status === 'warn' && result.adCheck.findings.length > 0 && (
                    <div style={{ padding: 10, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginBottom: 4 }}>
                        ⚠️ 医療広告表現の自己チェック（投稿前に確認してください）
                      </div>
                      {result.adCheck.findings.map((f, j) => (
                        <div key={j} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>・{f}</div>
                      ))}
                    </div>
                  )}

                  {result && isOpen && (
                    <>
                      <div
                        className="markdown-body"
                        style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content) }}
                      />
                      {/* ⑤ 仕上げ（記事ごとに独立した状態を持つ） */}
                      <div style={{ marginTop: 16 }}>
                        <NoteEnhancePanel
                          title={a.title}
                          content={result.content}
                          state={splitEnhance[index] ?? emptyNoteEnhance()}
                          onChange={(next) => handleSplitEnhanceChange(index, next)}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── ③ X投稿の生成結果（265c: v2対応） ── */}
      {feature === 'xpost' && xResult && (() => {
        const renderWarnings = (key: string) => {
          const ws = xResult.warnings?.[key] ?? [];
          if (ws.length === 0) return null;
          return (
            <div data-x-warnings={key} style={{ padding: 10, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, marginBottom: 8 }}>
              {ws.map((w, j) => (
                <div key={j} style={{ fontSize: 11, color: '#B45309', lineHeight: 1.7 }}>⚠️ {w.message}</div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                直す場合は本文を手で調整するか、「🐦 X投稿を生成する」で再生成してください（自動では書き換えません）
              </div>
            </div>
          );
        };
        const charInfo = (t: string) => (
          <span style={{ fontSize: 11, color: t.length > xResult.charLimit || (xResult.xLength === 'short' && xCharCount(t) > 140) ? '#B45309' : 'var(--text-muted)' }}>
            {xCharCount(t).toLocaleString()}字{xResult.xLength === 'short' ? '（140字目安）' : `（上限${xResult.charLimit.toLocaleString()}字）`}
          </span>
        );
        return (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              3️⃣ できた投稿（コピーしてXに貼り付け）
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={appendRipNote} onChange={(e) => setAppendRipNote(e.target.checked)} />
                末尾に「▼詳細はリプ欄に」を付ける
              </label>
              <button
                type="button"
                onClick={() =>
                  setEyecatch({
                    open: true,
                    title: 'X投稿画像',
                    text: [xResult.single, ...xResult.thread].filter(Boolean).join('\n\n'),
                    kind: 'sns',
                  })
                }
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                🎨 投稿画像を作る
              </button>
            </div>
          </div>

          {/* §5-2: 投稿時間帯の目安（媒体でズレる。表示のみ・予約投稿はしない） */}
          <div data-posting-times style={{ padding: 10, background: `${ACCENT}0d`, border: `1px solid ${ACCENT}30`, borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
            🕐 投稿時間帯の目安 — <strong>note公開: 20:00〜22:30</strong>（朝7:00〜8:30・昼12:00〜13:00も可）／
            <strong>Xポスト: 18:00〜21:00</strong>（朝7:00〜8:30・昼12:00〜13:00も可）。noteとXでゴールデンタイムがズレる点に注意
          </div>

          {/* 単発ポスト（1通目。URLは入れない） */}
          {xResult.single && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>💬 単発ポスト（1通目）</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {charInfo(xResult.single)}
                  <button
                    type="button"
                    onClick={() => handleCopy(ripNote(xResult.single), 'x-single')}
                    style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    {copied === 'x-single' ? '✅ コピー済み' : '📋 コピー'}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveXPost('single')}
                    disabled={xSaveSingle.saving || !!xSaveSingle.savedId}
                    style={{ padding: '6px 12px', background: xSaveSingle.savedId ? 'var(--bg-primary)' : `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: xSaveSingle.saving || xSaveSingle.savedId ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    {xSaveSingle.saving ? '保存中…' : xSaveSingle.savedId ? '✅ 保存済み' : xSaveSingle.error ? '⚠️ 保存に失敗・再試行' : '💾 保存（記事と関連付け）'}
                  </button>
                </div>
              </div>
              {renderWarnings('single')}
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                {xResult.single}
              </div>
            </div>
          )}

          {/* 2通目（リプライ・URL用）— 本文にURLを入れず露出低下を避ける（X-03/C-02） */}
          <div data-url-reply style={{ background: 'var(--bg-secondary)', border: `1px dashed ${ACCENT}50`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                ↩️ 2通目（1つ目のリプライ・記事URL用）
              </div>
              <button
                type="button"
                onClick={() => handleCopy(urlReplyContent, 'x-url-reply')}
                style={{ padding: '6px 12px', background: `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {copied === 'x-url-reply' ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              {urlReplyContent}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              ℹ️ 本文にURLを貼ると露出が下がるため、URLは投稿直後にこの内容を1つ目のリプライとして貼ります
            </div>
          </div>

          {/* スレッド */}
          {xResult.thread.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🧵 スレッド（{xResult.thread.length}ポスト）</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        xResult.thread
                          .map((t, i) => `${i + 1}/${xResult.thread.length}\n${i === 0 ? ripNote(t) : t}`)
                          .join('\n\n---\n\n') + `\n\n---\n\n[リプライ用]\n${urlReplyContent}`,
                        'x-thread-all',
                      )
                    }
                    style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    {copied === 'x-thread-all' ? '✅ コピー済み' : '📋 全ポストをコピー'}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveXPost('thread')}
                    disabled={xSaveThread.saving || !!xSaveThread.savedId}
                    style={{ padding: '6px 12px', background: xSaveThread.savedId ? 'var(--bg-primary)' : `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: xSaveThread.saving || xSaveThread.savedId ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    {xSaveThread.saving ? '保存中…' : xSaveThread.savedId ? '✅ 保存済み' : xSaveThread.error ? '⚠️ 保存に失敗・再試行' : '💾 保存（記事と関連付け）'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {xResult.thread.map((t, i) => (
                  <div key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{i + 1}/{xResult.thread.length}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {charInfo(t)}
                        <button
                          type="button"
                          onClick={() => handleCopy(i === 0 ? ripNote(t) : t, `x-thread-${i}`)}
                          style={{ padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                        >
                          {copied === `x-thread-${i}` ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>
                    {renderWarnings(`thread-${i}`)}
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{t}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                ℹ️ 記事URLは最終ポストではなく「2通目（1つ目のリプライ）」に貼ります（露出低下の回避）
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── ④ 戦略ドキュメント（編集可能） ── */}
      {feature === 'strategy' && strategyDoc && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              3️⃣ 発信戦略（編集して保存できます）
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStrategyEdit((v) => !v)}
                style={{ padding: '6px 14px', background: strategyEdit ? `${ACCENT}15` : 'var(--bg-primary)', border: strategyEdit ? `1px solid ${ACCENT}50` : '1px solid var(--border)', color: strategyEdit ? ACCENT : 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {strategyEdit ? '👁 プレビューに戻る' : '✏️ 編集する'}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(strategyDoc, 'strategy')}
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                {copied === 'strategy' ? '✅ コピー済み' : '📋 コピー'}
              </button>
              <button
                type="button"
                onClick={saveStrategy}
                disabled={strategySave.saving || !!strategySave.savedId}
                style={{ padding: '6px 14px', background: strategySave.savedId ? 'var(--bg-primary)' : `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: strategySave.saving || strategySave.savedId ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {strategySave.saving ? '保存中…' : strategySave.savedId ? '✅ 保存済み（🗃保存一覧）' : strategySave.error ? '⚠️ 保存に失敗・再試行' : '💾 保存一覧へ保存'}
              </button>
            </div>
          </div>

          {strategyEdit ? (
            <textarea
              value={strategyDoc}
              onChange={(e) => {
                setStrategyDoc(e.target.value);
                // 編集したら「保存済み」を解除し、直した版をまた保存できるようにする（R-53と同方針）
                if (strategySave.savedId) setStrategySave(EMPTY_X_SAVE);
              }}
              onBlur={() => persistDraft()}
              style={{ width: '100%', minHeight: 400, padding: 14, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.8, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          ) : (
            <div
              className="markdown-body"
              style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(strategyDoc) }}
            />
          )}
        </div>
      )}

      {/* ── 🗓 割り当て表（選択と日付から即時導出・保存しない） ── */}
      {feature === 'schedule' && schedRows.length > 0 && (
        <div data-schedule-table style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              3️⃣ 割り当て表（noteの予約設定に転記）
            </div>
            <button
              type="button"
              onClick={copySchedule}
              style={{ padding: '6px 14px', background: `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {copied === 'schedule' ? '✅ コピー済み' : '📋 表をコピー'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>公開日</th>
                  <th style={{ padding: '6px 8px' }}>曜日</th>
                  <th style={{ padding: '6px 8px' }}>note公開</th>
                  <th style={{ padding: '6px 8px' }}>記事</th>
                  <th style={{ padding: '6px 8px' }}>X告知の目安</th>
                </tr>
              </thead>
              <tbody>
                {schedRows.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <td style={{ padding: '8px' }}>{r.date}</td>
                    <td style={{ padding: '8px' }}>{r.weekday}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <select
                        value={r.slot}
                        onChange={(e) => setSchedSlots((prev) => ({ ...prev, [i]: e.target.value as ScheduleSlot }))}
                        style={{ padding: '4px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                      >
                        <option value="night">夜 {NOTE_SLOTS.night.time}</option>
                        <option value="morning">朝 {NOTE_SLOTS.morning.time}</option>
                        <option value="noon">昼 {NOTE_SLOTS.noon.time}</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                    <td style={{ padding: '8px' }}>{r.xHint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.7 }}>
            🕐 note夜帯: 20:00〜22:30 ／ X夜帯: 18:00〜21:00（媒体でズレる点に注意・R-70）。
            長文・重厚なノウハウ・有料コンテンツは夜帯が向いています。予約の実行はnoteの予約投稿機能で行ってください。
          </div>
        </div>
      )}

      {/* ⑤ 見出し/投稿画像の生成モーダル（226基盤: モデル比較・比率・ガードつき起案） */}
      <EyecatchModal
        open={eyecatch.open}
        onClose={() => setEyecatch((s) => ({ ...s, open: false }))}
        sourceTitle={eyecatch.title}
        sourceText={eyecatch.text}
        sourceKind={eyecatch.kind}
      />
    </div>
  );
}
