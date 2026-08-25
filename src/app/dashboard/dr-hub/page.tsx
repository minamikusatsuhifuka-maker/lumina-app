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
import { getSavedModel } from '@/lib/model-preference';
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
  adCheck?: AdCheck | null;
}

// ② 分割プランの1記事分（/api/dr-hub/split mode:'plan' の articles[]）
interface PlanArticle {
  title: string;
  role: string;
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

type Feature = 'persona' | 'split';
const FEATURES: Array<{ key: Feature; label: string }> = [
  { key: 'persona', label: '✍️ ペルソナ別note記事' },
  { key: 'split', label: '🧩 分割記事化（シリーズ）' },
];

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
    samplesBusy || !!fullBusyKey || !!samples || !!article || planBusy || !!splitPlan;

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
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearDraft = () => {
    setRestoredAt(null);
    setSamples(null);
    setArticle(null);
    setPersonaKeys([]);
    setSplitPlan(null);
    setSplitArticles({});
    setSeriesKey('');
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
      ...over,
    } satisfies DrHubDraftPayload);
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
    const m = article.content.match(/^#\s+(.+)$/m);
    return (m?.[1] || `${article.personaLabel}向け: ${selectedDr?.title ?? ''}`).trim();
  }, [article, selectedDr]);

  const handleCopy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
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
          <input
            value={drQuery}
            onChange={(e) => setDrQuery(e.target.value)}
            placeholder="🔍 タイトルで絞り込み"
            style={{ padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', minWidth: 220 }}
          />
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
                onClick={() => handleCopy(article.content, 'persona-article')}
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                {copied === 'persona-article' ? '✅ コピー済み' : '📋 本文をコピー'}
              </button>
            </div>
          </div>

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
                    <div
                      className="markdown-body"
                      style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content) }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
