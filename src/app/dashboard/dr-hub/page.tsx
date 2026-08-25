'use client';
// 261: 🚀 発信ハブ — ディープリサーチ記事を起点に note記事・X投稿・Kindle本・戦略・画像へ展開する起点画面。
// 261a: ①ペルソナ別サンプル比較 → note記事全文生成（236テイスト変換の「サンプル→選択→全文」方式を流用）。
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

type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '短め（1500〜2500字）' },
  { value: 'medium', label: '標準（3000〜4500字）' },
  { value: 'long', label: '長め（5000〜7000字）' },
];

// 自動下書き（feature_result_drafts feature_key='dr-hub'）のpayload
interface DrHubDraftPayload {
  drId?: string;
  drTitle?: string;
  personaKeys?: PersonaStyleKey[];
  samples?: Partial<Record<PersonaStyleKey, string>> | null;
  article?: PersonaArticle | null;
  length?: Length;
}

const ACCENT = '#e0684b'; // 発信ハブのアクセント（ロケットの暖色系）

export default function DrHubPage() {
  // ── DR記事の選択 ──
  const [drItems, setDrItems] = useState<DrItem[]>([]);
  const [drLoading, setDrLoading] = useState(true);
  const [drError, setDrError] = useState('');
  const [drQuery, setDrQuery] = useState('');
  const [selectedDrId, setSelectedDrId] = useState('');

  // ── ① ペルソナ別サンプル比較 → 全文生成 ──
  const [personaKeys, setPersonaKeys] = useState<PersonaStyleKey[]>([]);
  const [samples, setSamples] = useState<Partial<Record<PersonaStyleKey, string>> | null>(null);
  const [samplesBusy, setSamplesBusy] = useState(false);
  const [fullBusyKey, setFullBusyKey] = useState<PersonaStyleKey | null>(null);
  const [article, setArticle] = useState<PersonaArticle | null>(null);
  const [length, setLength] = useState<Length>('medium');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const selectedDr = useMemo(
    () => drItems.find((d) => d.id === selectedDrId) ?? null,
    [drItems, selectedDrId],
  );

  // 復元取得が返ってきた時点で既に操作が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current = samplesBusy || !!fullBusyKey || !!samples || !!article;

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
      if (!p.samples && !p.article) return;
      if (p.drId) setSelectedDrId(p.drId);
      if (Array.isArray(p.personaKeys)) {
        setPersonaKeys(p.personaKeys.filter((k) => k in PERSONA_STYLES));
      }
      setSamples(p.samples ?? null);
      setArticle(p.article ?? null);
      if (p.length) setLength(p.length);
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
    clearFeatureDraft('dr-hub');
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
      saveFeatureDraft('dr-hub', {
        drId: selectedDrId,
        drTitle: selectedDr?.title,
        personaKeys,
        samples: data.samples ?? null,
        article: null,
        length,
      } satisfies DrHubDraftPayload);
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
      saveFeatureDraft('dr-hub', {
        drId: selectedDrId,
        drTitle: selectedDr?.title,
        personaKeys,
        samples,
        article: next,
        length,
      } satisfies DrHubDraftPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '記事の生成に失敗しました');
    } finally {
      setFullBusyKey(null);
    }
  };

  const articleTitle = useMemo(() => {
    if (!article) return '';
    const m = article.content.match(/^#\s+(.+)$/m);
    return (m?.[1] || `${article.personaLabel}向け: ${selectedDr?.title ?? ''}`).trim();
  }, [article, selectedDr]);

  const handleCopy = () => {
    if (!article) return;
    copyToClipboard(article.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sampleKeys = samples
    ? PERSONA_STYLE_KEYS.filter((k) => typeof samples[k] === 'string' && samples[k])
    : [];

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

      {/* ── STEP2: ① ペルソナ別note記事 ── */}
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

      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── サンプル比較（2〜4列） ── */}
      {sampleKeys.length > 0 && (
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

      {/* ── 記事全文 ── */}
      {article && (
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
                  savedAt: new Date().toISOString(),
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                {copied ? '✅ コピー済み' : '📋 本文をコピー'}
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
    </div>
  );
}
