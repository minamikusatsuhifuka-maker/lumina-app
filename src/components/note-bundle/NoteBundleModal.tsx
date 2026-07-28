'use client';

// 179/180: 保存資料の複数選択 → 記事プラン提案（パス1・編集可）→ note記事群の生成（パス2・逐次/部分成功）
// - 素材は 🧠AI参照素材(context_saves) と 🗂テキスト分析(text_analysis_saves) を横断選択できる（180）
// - パス1: /api/note-bundle/plan に {source,id} のみ送信（本文はサーバ側で取得＝一覧の本文非返却を温存）
// - 人間確認型: プランを院長が編集（本数・タイトル・要点・資料割り当て・文体）してから生成へ
// - パス2: 1記事=1リクエストを逐次実行（キュー方式）。進捗N/M・部分失敗は該当記事のみエラー（成功分は使える）
// - 文体プリセットは lib/note-styles.ts に一元管理。各記事に文体バッジ＋「🔁別文体で再生成」
// - 182: 全文表示（▼/⛶=FullscreenReader流用・🧠カードと同作法）／生成の中止（⏹全体=AbortControllerで
//   進行中も中断・✕個別=キューから除外。中止済みは🔄再試行可・生成済みは残す）／🗑削除（confirm簡易確認）／
//   「🔁別文体で再生成」の重複ガード（同一タイトル×同一文体を弾く）＋キュー上限20件

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { getSavedModel, getModelIcon, getModelLabel } from '@/lib/model-preference';
import {
  BUNDLE_SOURCE_META,
  makeBundleKey,
  parseBundleKey,
  type BundleSource,
} from '@/lib/note-bundle';
import type { BundleSelectedItem } from './useNoteBundleSelection';
import {
  DEFAULT_NOTE_STYLE,
  NOTE_STYLES,
  NOTE_STYLE_KEYS,
  getNoteStyle,
  type NoteStyleKey,
} from '@/lib/note-styles';

// プラン編集で扱う資料（key = ctx-<id> / ana-<id>。2テーブルのID衝突を回避）
interface Material {
  key: string;
  source: BundleSource;
  id: number;
  topic: string;
}

// 183: バズりパターン辞書の選択肢（プランAPIが返す。本体はパス2でサーバ側取得）
interface PatternOption {
  id: string;
  title: string;
  category: string;
  framework: string;
}

// パス1で編集する記事プラン（points はtextarea編集しやすいよう改行区切りの文字列で保持）
interface PlanDraft {
  localId: number;
  title: string;
  sources: string[]; // Material.key の配列
  pointsText: string;
  style: NoteStyleKey;
  // 183: バズりパターン辞書のID（文体=語り口とは別軸の「構成の型」。AI初期提案＋院長が変更可）
  patterns: string[];
}

interface ArticleResult {
  localId: number;
  title: string;
  style: NoteStyleKey;
  sourceKeys: string[];
  points: string[];
  patternIds: string[];
  // cancelled = 中止（⏹全体 or ✕個別）。生成済みは消さず、🔄再試行で再開できる（182）
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  content: string;
  adCheck: { status: 'ok' | 'warn'; findings: string[] } | null;
  error: string;
}

// 生成キューの上限（重複投入・連打の暴発防止。超過はトーストで明示）
const MAX_RESULT_CARDS = 20;

type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '📄 短め（1500〜2500字）' },
  { value: 'medium', label: '📑 標準（3000〜4500字）' },
  { value: 'long', label: '📚 長め（5000〜7000字）' },
];

// 既存 note記事生成の「下書き」注意文と同一文言（緩和しない）
const DRAFT_NOTICE = '⚠️ これは下書きです。あなたの独自の経験・視点を加えて編集してから投稿してください';

let localIdSeq = 1;

// 資料チップの共通表示（ソースアイコン付き。180: どちら由来か一目で分かるように）
function materialChipLabel(m: Material): string {
  const meta = BUNDLE_SOURCE_META[m.source];
  const t = m.topic.slice(0, 24) + (m.topic.length > 24 ? '…' : '');
  return `${meta.icon} ${t}`;
}

export default function NoteBundleModal({
  open,
  onClose,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  selected: BundleSelectedItem[];
}) {
  // フェーズ: plan（提案取得〜編集）→ generate（逐次生成・結果一覧）
  const [phase, setPhase] = useState<'plan' | 'generate'>('plan');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  // 183: バズりパターン辞書の選択肢と、✨AI推奨の実行中カード
  const [patternOptions, setPatternOptions] = useState<PatternOption[]>([]);
  const [suggestingId, setSuggestingId] = useState<number | null>(null);
  const [length, setLength] = useState<Length>('medium');
  const [results, setResults] = useState<ArticleResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // 展開表示中の結果カード（既定は抜粋表示）
  const [expandedResult, setExpandedResult] = useState<Record<number, boolean>>({});
  // 全画面リーダーで表示中の記事（182・FullscreenReader流用）
  // 191: アクションボタン（コピー/DL/保存）に元の ArticleResult が要るため本体を保持する
  const [readerResult, setReaderResult] = useState<ArticleResult | null>(null);
  // モーダル内トースト（重複ガード・上限超過などの通知）
  const [modalToast, setModalToast] = useState('');
  // 逐次生成のキュー（生成中に「🔁別文体」で追加されても取りこぼさない）
  const queueRef = useRef<ArticleResult[]>([]);
  const runningRef = useRef(false);
  // 進行中リクエストの中断用（⏹全体中止・モーダルを閉じた時）
  const abortRef = useRef<AbortController | null>(null);
  // モーダルを閉じたら以降の逐次生成を止める
  const cancelledRef = useRef(false);
  const [model, setModel] = useState<'claude' | 'gemini'>('claude');
  // 生成リクエストで使う長さ設定（stateはUI用、refはキュー実行中の参照用）
  const lengthRef = useRef<Length>('medium');
  lengthRef.current = length;
  const modelRef = useRef<'claude' | 'gemini'>('claude');
  modelRef.current = model;

  // 開くたびに状態をリセットしてプラン提案を取得
  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    runningRef.current = false;
    queueRef.current = [];
    setPhase('plan');
    setDrafts([]);
    setMaterials([]);
    setPatternOptions([]);
    setSuggestingId(null);
    setResults([]);
    setGenerating(false);
    setPlanError('');
    setExpandedResult({});
    setReaderResult(null);
    setModalToast('');
    setModel(getSavedModel());
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 189: モーダル表示中は背景スクロールをロック（閉じたら復元。FullscreenReaderと同方式・
  // リーダーを開いても prev='hidden' を復元するだけなので入れ子でも整合する）
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ── パス1: プラン提案の取得 ──
  const fetchPlan = async () => {
    setPlanLoading(true);
    setPlanError('');
    try {
      const res = await fetch('/api/note-bundle/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: selected.map((s) => ({ source: s.source, id: s.id })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `プラン提案に失敗しました（HTTP ${res.status}）`);
      const mats: Material[] = Array.isArray(data.materials)
        ? data.materials
        : selected.map((s) => ({ key: makeBundleKey(s.source, s.id), source: s.source, id: s.id, topic: s.topic }));
      setMaterials(mats);
      setPatternOptions(Array.isArray(data.patternOptions) ? data.patternOptions : []);
      setDrafts(
        (data.articles as Array<{ title: string; sources: string[]; points: string[]; style: NoteStyleKey; patterns?: string[] }>).map(
          (a) => ({
            localId: localIdSeq++,
            title: a.title,
            sources: a.sources,
            pointsText: (a.points || []).join('\n'),
            style: getNoteStyle(a.style).key,
            patterns: Array.isArray(a.patterns) ? a.patterns : [],
          }),
        ),
      );
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanLoading(false);
    }
  };

  const updateDraft = (localId: number, patch: Partial<PlanDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  };

  const toggleSource = (localId: number, key: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.localId !== localId) return d;
        const has = d.sources.includes(key);
        return { ...d, sources: has ? d.sources.filter((s) => s !== key) : [...d.sources, key] };
      }),
    );
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        localId: localIdSeq++,
        title: '',
        sources: materials.map((m) => m.key),
        pointsText: '',
        style: DEFAULT_NOTE_STYLE,
        patterns: [],
      },
    ]);
  };

  const removeDraft = (localId: number) => {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  };

  // 183: バズりパターンのトグル（複数選択可・上限5）
  const togglePattern = (localId: number, pid: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.localId !== localId) return d;
        if (d.patterns.includes(pid)) return { ...d, patterns: d.patterns.filter((p) => p !== pid) };
        if (d.patterns.length >= 5) {
          flashModalToast('⚠️ パターンは1記事につき最大5件です');
          return d;
        }
        return { ...d, patterns: [...d.patterns, pid] };
      }),
    );
  };

  // 183: ✨AIに推奨（既存 /api/note-pattern-suggest を流用。記事タイトル＋要点から適合パターンを選ぶ）
  const suggestPatterns = async (d: PlanDraft) => {
    if (!d.title.trim()) {
      flashModalToast('⚠️ まず記事タイトルを入力してください');
      return;
    }
    setSuggestingId(d.localId);
    try {
      const res = await fetch('/api/note-pattern-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: d.title, context: d.pointsText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.patterns)) {
        throw new Error(data.message || data.error || '推奨の取得に失敗しました');
      }
      const validIds = new Set(patternOptions.map((p) => p.id));
      const suggested = (data.patterns as Array<{ id: string }>)
        .map((p) => String(p.id))
        .filter((pid) => validIds.has(pid));
      if (suggested.length === 0) {
        flashModalToast('⚠️ この記事に合うパターンが見つかりませんでした');
        return;
      }
      updateDraft(d.localId, { patterns: suggested.slice(0, 5) });
      flashModalToast(`✨ ${suggested.length}件のパターンを提案しました`);
    } catch (e) {
      flashModalToast(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSuggestingId(null);
    }
  };

  const patchResult = (localId: number, patch: Partial<ArticleResult>) => {
    setResults((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  };

  // 一時トースト（モーダル内通知）
  const flashModalToast = (msg: string, ms = 3000) => {
    setModalToast(msg);
    setTimeout(() => setModalToast(''), ms);
  };

  // ── パス2: 1記事分の生成リクエスト ──
  // AbortController を張り、⏹全体中止で進行中の1件も中断できるようにする（182）。
  const generateOne = async (r: ArticleResult): Promise<Partial<ArticleResult>> => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/note-bundle/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          title: r.title,
          points: r.points,
          sources: r.sourceKeys.map(parseBundleKey).filter(Boolean),
          style: r.style,
          patternIds: r.patternIds,
          length: lengthRef.current,
          model: modelRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `生成に失敗しました（HTTP ${res.status}）`);
      return { status: 'done', content: data.content ?? '', adCheck: data.ad_check ?? null, error: '' };
    } catch (e) {
      // 中断（⏹中止・モーダルclose）はエラーでなく「中止」としてカードに反映（固まらせない）
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { status: 'cancelled', error: '' };
      }
      return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    } finally {
      abortRef.current = null;
    }
  };

  // キューに積んで逐次実行（部分成功方針: 1記事の失敗で止めない）
  const enqueue = (items: ArticleResult[]) => {
    queueRef.current.push(...items);
    if (runningRef.current) return;
    runningRef.current = true;
    setGenerating(true);
    (async () => {
      while (queueRef.current.length > 0 && !cancelledRef.current) {
        const r = queueRef.current.shift()!;
        patchResult(r.localId, { status: 'running' });
        const patch = await generateOne(r);
        if (cancelledRef.current) break;
        patchResult(r.localId, patch);
      }
      runningRef.current = false;
      setGenerating(false);
    })();
  };

  // 「この構成で生成」→ パス2へ
  // 193: 182の重複ガードは🔁別文体にしか無く、「プラン編集に戻る→この構成で生成」経路が
  // 素通りだった（旧実装は setResults(queue) の丸ごと差し替えで既存カードと照合しない）。
  // → 画面上の全カード（pending/running/done。🗑削除済みは results に無い＝対象外）＋
  //   今回バッチ内の相互を「タイトル(trim)×文体」で照合し、重複分だけ弾いて非重複分を追加投入する。
  const startGenerate = () => {
    const valid = drafts
      .map((d) => ({
        ...d,
        title: d.title.trim(),
        points: d.pointsText.split('\n').map((p) => p.trim()).filter(Boolean),
      }))
      .filter((d) => d.title && d.sources.length > 0);
    if (valid.length === 0) {
      setPlanError('タイトルと資料割り当てのある記事が1本もありません');
      return;
    }

    // 照合キー = タイトル(trim)×文体（182と同じ判定条件。cancelled/error は再投入可）
    const dupKey = (title: string, style: NoteStyleKey) => `${title.trim()}\u0000${style}`;
    const seen = new Set(
      results
        .filter((x) => x.status === 'pending' || x.status === 'running' || x.status === 'done')
        .map((x) => dupKey(x.title, x.style)),
    );
    const fresh: typeof valid = [];
    let skipped = 0;
    for (const d of valid) {
      const key = dupKey(d.title, d.style);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key); // バッチ内の相互重複も弾く
      fresh.push(d);
    }

    // カード上限（既存挙動と同じ20件。超過分は投入せず明示）
    const room = Math.max(0, MAX_RESULT_CARDS - results.length);
    const capped = fresh.length > room;
    const toEnqueue = capped ? fresh.slice(0, room) : fresh;

    if (skipped > 0) {
      flashModalToast(
        toEnqueue.length === 0 && !capped
          ? '⚠️ 同じタイトル×文体の記事は既にあります'
          : `⚠️ ${skipped}記事は同じタイトル×文体の記事が既にあります（残りのみ生成します）`,
      );
    } else if (capped) {
      flashModalToast(`⚠️ 生成できる記事は最大${MAX_RESULT_CARDS}件です（🗑削除で減らせます）`);
    }

    // localId は新規採番（既存カードを保持して追加するため、draft の localId を流用すると
    // 再生成時に既存カードとキー衝突し patchResult が両方に当たる）
    const queue: ArticleResult[] = toEnqueue.map((d) => ({
      localId: localIdSeq++,
      title: d.title,
      style: d.style,
      sourceKeys: d.sources,
      points: d.points,
      patternIds: d.patterns,
      status: 'pending',
      content: '',
      adCheck: null,
      error: '',
    }));
    setResults((prev) => [...prev, ...queue]);
    setPhase('generate');
    if (queue.length > 0) enqueue(queue);
  };

  // 「🔁 別文体で再生成」= 同じ資料・要点のまま文体だけ変えて新カードを追加（元の記事は残す）。
  // 182: 連打ガード＝同一タイトル×同一文体が既にキュー/生成済みにあれば弾く（中止・失敗カードは再投入可）。
  const regenerateWithStyle = (src: ArticleResult, style: NoteStyleKey) => {
    const dup = results.some(
      (x) =>
        x.title === src.title &&
        x.style === style &&
        (x.status === 'pending' || x.status === 'running' || x.status === 'done'),
    );
    if (dup) {
      flashModalToast(`⚠️ 「${NOTE_STYLES[style].emoji} ${NOTE_STYLES[style].label}」の同じ記事は既にあります`);
      return;
    }
    if (results.length >= MAX_RESULT_CARDS) {
      flashModalToast(`⚠️ 生成できる記事は最大${MAX_RESULT_CARDS}件です（🗑削除で減らせます）`);
      return;
    }
    const card: ArticleResult = {
      ...src,
      localId: localIdSeq++,
      style,
      status: 'pending',
      content: '',
      adCheck: null,
      error: '',
    };
    setResults((prev) => [...prev, card]);
    enqueue([card]);
  };

  // 失敗・中止カードの再試行（やり直しの道を残す）
  const retryOne = (r: ArticleResult) => {
    patchResult(r.localId, { status: 'pending', error: '' });
    enqueue([{ ...r, status: 'pending', error: '' }]);
  };

  // ⏹ 全体中止: 待機中はすべてキャンセル、進行中の1件は AbortController で中断。
  // 生成済みの記事は消さない（中止＝これから作る分を止める）。
  const stopAll = () => {
    const pendingIds = new Set(queueRef.current.map((q) => q.localId));
    queueRef.current = [];
    setResults((prev) =>
      prev.map((it) =>
        pendingIds.has(it.localId) && it.status === 'pending' ? { ...it, status: 'cancelled' } : it,
      ),
    );
    // 進行中の1件を中断（generateOne が AbortError を 'cancelled' としてカードに反映する）
    abortRef.current?.abort();
  };

  // ✕ 個別の中止: 待機中カードをキューから除外（🔄再試行で再開できる）
  const cancelPending = (localId: number) => {
    queueRef.current = queueRef.current.filter((q) => q.localId !== localId);
    patchResult(localId, { status: 'cancelled' });
  };

  // 🗑 記事の削除: そのカードだけ消す（生成済み・失敗・中止すべて対象。confirmで簡易確認）
  const deleteResult = (r: ArticleResult) => {
    if (!confirm(`「${r.title}」を削除しますか？`)) return;
    queueRef.current = queueRef.current.filter((q) => q.localId !== r.localId);
    setResults((prev) => prev.filter((it) => it.localId !== r.localId));
  };

  const handleClose = () => {
    cancelledRef.current = true;
    queueRef.current = [];
    abortRef.current?.abort();
    onClose();
  };

  const handleCopy = async (r: ArticleResult) => {
    await copyToClipboard(sanitizeLatex(r.content));
    setCopiedId(r.localId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadMd = (r: ArticleResult) => {
    const st = NOTE_STYLES[r.style];
    const md = `# note記事下書き: ${r.title}\n\n> 文体: ${st.emoji} ${st.label}\n> 生成AI: ${getModelIcon(model)} ${getModelLabel(model)}\n\n---\n\n${r.content}`;
    triggerDownload(`${sanitizeFilename(`note記事下書き_${r.title.slice(0, 40)}`)}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
  };

  const downloadDocx = async (r: ArticleResult) => {
    const st = NOTE_STYLES[r.style];
    const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
    await downloadMarkdownAsDocx({
      title: `note記事下書き: ${r.title}`,
      metaLines: [`文体: ${st.emoji} ${st.label}`, `生成AI: ${getModelLabel(model)}`],
      markdown: sanitizeLatex(r.content),
      fileName: `${sanitizeFilename(`note記事下書き_${r.title.slice(0, 40)}`)}_${yyyymmdd()}.docx`,
    });
  };

  if (!open) return null;

  const doneCount = results.filter((r) => r.status === 'done').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const cancelledCount = results.filter((r) => r.status === 'cancelled').length;
  const finishedCount = doneCount + errorCount + cancelledCount;
  const ctxCount = selected.filter((s) => s.source === 'context').length;
  const anaCount = selected.filter((s) => s.source === 'analysis').length;

  const styleBadge = (key: NoteStyleKey) => {
    const st = NOTE_STYLES[key];
    return (
      <span
        title={st.description}
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 10px',
          borderRadius: 10,
          background: 'var(--accent-soft)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-accent)',
        }}
      >
        {st.emoji} {st.label}
      </span>
    );
  };

  const smallBtn = (extra?: CSSProperties): CSSProperties => ({
    padding: '6px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    ...extra,
  });

  return (
    <>
    {/* 189: オーバーレイは document.body 直下に portal で描画（祖先の transform の影響を
        受けず常にビューポート中央）。FullscreenReader は 182 の構造どおり portal の外に置く
        ＝リーダー内クリックが overlay の handleClose にバブルしない関係を維持。
        open=true はクライアント操作後のみ＝ここで document は常に存在する。 */}
    {createPortal(
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 960,
          maxHeight: '88vh',
          overflowY: 'auto',
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>
            📝 選択した資料から note 記事群を生成
          </h2>
          <button type="button" onClick={handleClose} style={smallBtn()}>✕ 閉じる</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 16px' }}>
          資料 {selected.length} 件（🧠{ctxCount}・🗂{anaCount}）→ AIが記事プランを提案 → 確認・編集してから各記事を生成します（使用モデル: {getModelIcon(model)} {getModelLabel(model)}）
        </p>

        {/* ── パス1: プラン提案〜編集 ── */}
        {phase === 'plan' && (
          <div>
            {planLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ width: 36, height: 36, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                🤖 選択した資料から記事プランを提案中...（この段階では記事は作りません）
              </div>
            )}

            {planError && !planLoading && (
              <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                ⚠️ {planError}
                <button type="button" onClick={fetchPlan} style={smallBtn()}>🔄 再試行</button>
              </div>
            )}

            {!planLoading && drafts.length > 0 && (
              <div>
                <div style={{ padding: '10px 14px', background: 'rgba(108,99,255,0.06)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                  💡 AIの提案です。<strong>記事の追加/削除・タイトル・要点・使う資料・文体</strong>を自由に編集してから「この構成で生成」を押してください。文体はAIが内容に合わせて初期提案しています。
                </div>

                {drafts.map((d, i) => (
                  <div key={d.localId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>記事 {i + 1}</span>
                      {styleBadge(d.style)}
                      <button
                        type="button"
                        onClick={() => removeDraft(d.localId)}
                        style={smallBtn({ color: '#ef4444', marginLeft: 'auto' })}
                      >
                        🗑 この記事を外す
                      </button>
                    </div>

                    <input
                      value={d.title}
                      onChange={(e) => updateDraft(d.localId, { title: e.target.value })}
                      placeholder="記事タイトル"
                      style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: 8, marginBottom: 8, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6 }}
                    />

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>盛り込む要点（1行=1要点）</div>
                    <textarea
                      value={d.pointsText}
                      onChange={(e) => updateDraft(d.localId, { pointsText: e.target.value })}
                      placeholder={'要点1\n要点2'}
                      style={{ width: '100%', minHeight: 70, fontSize: 13, lineHeight: 1.6, padding: 8, marginBottom: 8, boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', resize: 'vertical' }}
                    />

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>使う資料（この記事に渡すものだけON。全資料を毎記事に渡さない）</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {materials.map((m) => {
                        const on = d.sources.includes(m.key);
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => toggleSource(d.localId, m.key)}
                            style={{
                              padding: '4px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                              border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: on ? 'rgba(108,99,255,0.12)' : 'var(--bg-primary)',
                              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontWeight: on ? 600 : 400,
                            }}
                            title={`${BUNDLE_SOURCE_META[m.source].label}: ${m.topic}`}
                          >
                            {on ? '☑' : '☐'} {materialChipLabel(m)}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文体（語り口）:</span>
                      <select
                        value={d.style}
                        onChange={(e) => updateDraft(d.localId, { style: e.target.value as NoteStyleKey })}
                        style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                      >
                        {NOTE_STYLE_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {NOTE_STYLES[k].emoji} {NOTE_STYLES[k].label} — {NOTE_STYLES[k].description}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 183: バズりパターン選択（構成の型・文体とは別軸で掛け合わせ可・複数選択可） */}
                    {patternOptions.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            📖 バズりパターン（構成の型・複数選択可）
                            {d.patterns.length > 0 && <span style={{ color: 'var(--accent)' }}>（{d.patterns.length}件選択中）</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => suggestPatterns(d)}
                            disabled={suggestingId !== null}
                            title="記事タイトル・要点に合うパターンをAIが辞書から選びます"
                            style={{
                              padding: '4px 12px',
                              borderRadius: 12,
                              border: 'none',
                              background: suggestingId !== null ? 'var(--bg-primary)' : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                              color: suggestingId !== null ? 'var(--text-muted)' : '#fff',
                              cursor: suggestingId !== null ? 'not-allowed' : 'pointer',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {suggestingId === d.localId ? '🔄 推奨中...' : '✨ AIに推奨してもらう'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {patternOptions.map((p) => {
                            const on = d.patterns.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePattern(d.localId, p.id)}
                                title={`${p.title}${p.category ? `（${p.category}）` : ''}${p.framework ? ` / ${p.framework}` : ''}`}
                                style={{
                                  padding: '4px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                                  border: on ? '1px solid #8b5cf6' : '1px solid var(--border)',
                                  background: on ? 'rgba(139,92,246,0.14)' : 'var(--bg-primary)',
                                  color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                                  fontWeight: on ? 600 : 400,
                                }}
                              >
                                {on ? '☑' : '☐'} 📖 {p.title.slice(0, 22)}{p.title.length > 22 ? '…' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <button type="button" onClick={addDraft} style={smallBtn({ marginBottom: 16 })}>
                  ＋ 記事を追加
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>記事の長さ（全記事共通）:</span>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value as Length)}
                    style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                  >
                    {LENGTH_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={startGenerate}
                    disabled={drafts.length === 0}
                    style={{
                      marginLeft: 'auto',
                      padding: '10px 24px',
                      background: drafts.length === 0 ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                      color: drafts.length === 0 ? 'var(--text-muted)' : '#fff',
                      border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                      cursor: drafts.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🚀 この構成で生成（{drafts.length}記事）
                  </button>
                </div>
              </div>
            )}

            {!planLoading && !planError && drafts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                プランが空です。「＋ 記事を追加」で手動作成するか、再試行してください。
                <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button type="button" onClick={fetchPlan} style={smallBtn()}>🔄 再試行</button>
                  {materials.length > 0 && (
                    <button type="button" onClick={addDraft} style={smallBtn()}>＋ 記事を追加</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── パス2: 逐次生成・結果一覧 ── */}
        {phase === 'generate' && (
          <div>
            {/* 既存 note生成と同じ「下書き」注意文（必須表示・緩和しない） */}
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
              {DRAFT_NOTICE}
            </div>

            {/* 188: 進捗＋中止をスティッキー化（長い記事群でもスクロールせず常に見える固定領域）。
                中止は警告色の塗り・大きめ＝「✕この記事をやめる」（個別）より上位に見せる。処理は無変更 */}
            <div
              style={{
                position: 'sticky',
                top: -24,
                zIndex: 5,
                background: 'var(--bg-primary)',
                margin: '0 -24px 14px',
                padding: '12px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {generating
                  ? `✍️ 生成中... ${Math.min(finishedCount + 1, results.length)}/${results.length}`
                  : `✅ 完了 ${doneCount}/${results.length}${errorCount > 0 ? `（失敗 ${errorCount}件）` : ''}${cancelledCount > 0 ? `（中止 ${cancelledCount}件）` : ''}`}
              </span>
              {generating && (
                <button
                  type="button"
                  onClick={stopAll}
                  title="待機中はすべてキャンセルし、進行中の1件も中断します（生成済みの記事は残ります）"
                  style={{
                    marginLeft: 'auto',
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(239,68,68,0.35)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⏹ すべての生成を中止
                </button>
              )}
              {!generating && (
                <button type="button" onClick={() => setPhase('plan')} style={smallBtn()}>
                  ← プラン編集に戻る
                </button>
              )}
            </div>

            {results.map((r) => (
              <div key={r.localId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {styleBadge(r.style)}
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    資料{r.sourceKeys.length}件
                    {r.patternIds.length > 0 && ` ・ 📖パターン${r.patternIds.length}件`}
                    {r.status === 'done' && ` ・ ${r.content.length.toLocaleString()}字`}
                  </span>
                </div>

                {r.status === 'pending' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ 待機中...</span>
                    <button
                      type="button"
                      onClick={() => cancelPending(r.localId)}
                      title="この記事をキューから外します（🔄再試行で再開できます）"
                      style={smallBtn()}
                    >
                      ✕ この記事をやめる
                    </button>
                  </div>
                )}
                {r.status === 'running' && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', padding: '8px 0' }}>✍️ 執筆中...（30〜120秒）</div>
                )}
                {r.status === 'cancelled' && (
                  <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    ⏹ 中止しました
                    <button type="button" onClick={() => retryOne(r)} style={smallBtn()}>🔄 再試行</button>
                    <button type="button" onClick={() => deleteResult(r)} style={smallBtn({ color: '#ef4444' })}>🗑 削除</button>
                  </div>
                )}
                {r.status === 'error' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    ⚠️ この記事の生成に失敗しました: {r.error}
                    <button type="button" onClick={() => retryOne(r)} style={smallBtn()}>🔄 再試行</button>
                    <button type="button" onClick={() => deleteResult(r)} style={smallBtn({ color: '#ef4444' })}>🗑 削除</button>
                  </div>
                )}

                {r.status === 'done' && (
                  <div>
                    {/* 医療広告チェック結果（seo/article と同方式で併記） */}
                    {r.adCheck && r.adCheck.status === 'warn' && r.adCheck.findings.length > 0 && (
                      <div style={{ marginBottom: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
                        🚨 医療広告チェック: 要確認
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {r.adCheck.findings.map((f, fi) => <li key={fi}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {r.adCheck && r.adCheck.status === 'ok' && (
                      <div style={{ marginBottom: 8, fontSize: 11, color: '#10b981' }}>✅ 医療広告チェック: 問題なし</div>
                    )}

                    <div
                      className="markdown-body"
                      style={{
                        maxHeight: expandedResult[r.localId] ? undefined : 260,
                        overflowY: expandedResult[r.localId] ? undefined : 'auto',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 12,
                        color: 'var(--text-primary)',
                        lineHeight: 1.75,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        marginBottom: 10,
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content) }}
                    />

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* 🧠AI参照素材カードと同じ作法・同じ文言（▼全文表示 / ▲閉じる / ⛶全画面） */}
                      <button type="button" onClick={() => setExpandedResult((p) => ({ ...p, [r.localId]: !p[r.localId] }))} style={smallBtn()}>
                        {expandedResult[r.localId] ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderResult(r)}
                        title="全画面のリーダー表示で読む"
                        style={smallBtn()}
                      >
                        ⛶ 全画面
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(r)}
                        style={smallBtn(copiedId === r.localId ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' } : undefined)}
                      >
                        {copiedId === r.localId ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button type="button" onClick={() => downloadMd(r)} style={smallBtn()}>📥 MD</button>
                      <button type="button" onClick={() => downloadDocx(r)} style={smallBtn()}>📄 Word</button>
                      <SaveToLibraryButton
                        title={`note記事下書き: ${r.title.slice(0, 60)}`}
                        content={r.content}
                        type="note-article"
                        groupName="note記事"
                        tags="note記事,下書き,資料まとめ"
                        metadata={{
                          theme: r.title,
                          style: r.style,
                          sourceKeys: r.sourceKeys,
                          length,
                          from: 'note-bundle',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => deleteResult(r)}
                        title="この記事カードを削除します"
                        style={smallBtn({ color: '#ef4444', marginLeft: 'auto' })}
                      >
                        🗑 削除
                      </button>
                    </div>

                    {/* 🔁 別文体で再生成（同じ資料・要点のまま文体だけ変えて追加。元の記事は残す） */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🔁 別文体でもう1本:</span>
                      {NOTE_STYLE_KEYS.filter((k) => k !== r.style).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => regenerateWithStyle(r, k)}
                          title={`${NOTE_STYLES[k].label}（${NOTE_STYLES[k].description}）で同じ資料・要点から追加生成`}
                          style={smallBtn()}
                        >
                          {NOTE_STYLES[k].emoji} {NOTE_STYLES[k].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* モーダル内トースト（重複ガード・上限超過の通知） */}
        {modalToast && (
          <div style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1f2937',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 1002,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            maxWidth: 'calc(100vw - 40px)',
          }}>
            {modalToast}
          </div>
        )}
      </div>
    </div>,
    document.body,
    )}

    {/* 全画面リーダー（151のFullscreenReader流用。zIndex 10000＝本モーダルより上）。
        オーバーレイの外に置く＝リーダー内クリックが overlay の handleClose にバブルしない。
        191: カードと同じアクション（同じハンドラを共有・二重実装しない）をヘッダーに追従表示。
        🗑削除は一覧の状態を変える操作のため誤操作防止で入れない。 */}
    <FullscreenReader
      open={readerResult !== null}
      title={readerResult?.title ?? '無題'}
      content={readerResult?.content ?? ''}
      onClose={() => setReaderResult(null)}
      actions={
        readerResult && (
          <>
            <button
              type="button"
              onClick={() => handleCopy(readerResult)}
              style={smallBtn(copiedId === readerResult.localId ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' } : undefined)}
            >
              {copiedId === readerResult.localId ? '✅ コピー済み' : '📋 コピー'}
            </button>
            <button type="button" onClick={() => downloadMd(readerResult)} style={smallBtn()}>📥 MD</button>
            <button type="button" onClick={() => downloadDocx(readerResult)} style={smallBtn()}>📄 Word</button>
            <SaveToLibraryButton
              title={`note記事下書き: ${readerResult.title.slice(0, 60)}`}
              content={readerResult.content}
              type="note-article"
              groupName="note記事"
              tags="note記事,下書き,資料まとめ"
              metadata={{
                theme: readerResult.title,
                style: readerResult.style,
                sourceKeys: readerResult.sourceKeys,
                length,
                from: 'note-bundle',
              }}
            />
          </>
        )
      }
    />
    </>
  );
}
