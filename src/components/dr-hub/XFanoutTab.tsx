'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 278: 📆 記事→X時間差展開 — note記事1本から型の異なるX投稿を最大5件作り、日程に割り当てる。
//
// 配置: 発信ハブの新規タブ（③X投稿連動の単発生成はそのまま残す）。
// 生成: **③の /api/dr-hub/x-post を型ごとに1リクエスト**呼ぶ（新規エンジンなし・§1-3）。
//       1型の失敗は1型に閉じる（R-39）。二重発火は ref で同期的に閉じる（R-87）。
// 選抜: 「生成は多く、公開は選抜」。日程に載せるのは院長が選んだものだけ（既定は未選択・§3-2②）。
// 判断（類似度・URL既定・時間帯・日程）はすべて lib/x-fanout.ts の純関数（R-74）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownBody } from '@/components/MarkdownBody';
import { loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { X_POST_TYPES, type XPostType } from '@/lib/x-post-rules';
import {
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_TYPE_SLOT,
  DEFAULT_URL_COUNT,
  FANOUT_REQUEST_TIMEOUT_MS,
  FANOUT_SIMILARITY_DEFAULT,
  FANOUT_SIMILARITY_MAX,
  FANOUT_SIMILARITY_MIN,
  INTERVAL_DAYS_MAX,
  INTERVAL_DAYS_MIN,
  X_FANOUT_TYPES,
  X_SLOTS,
  buildFanoutSchedule,
  defaultUrlFlags,
  fanoutScheduleToMarkdown,
  findSimilarPairs,
  normalizeInterval,
  normalizeSelectedTypes,
  normalizeThreshold,
  type XSlot,
} from '@/lib/x-fanout';

interface NoteItem {
  id: string;
  title: string;
}

interface WarningItem {
  code: string;
  message: string;
}

interface TypeResult {
  status: 'idle' | 'running' | 'done' | 'na' | 'failed';
  text: string;
  urlReplyLeadin: string;
  warnings: WarningItem[];
  reason: string;
  error: string;
}

const EMPTY: TypeResult = { status: 'idle', text: '', urlReplyLeadin: '', warnings: [], reason: '', error: '' };
const DRAFT_KEY = 'dr-hub-xfanout';
const ACCENT = '#e0684b';

interface DraftPayload {
  articleId: string;
  articleUrl: string;
  selectedTypes: XPostType[];
  threshold: number;
  urlCount: number;
  intervalDays: number;
  results: Partial<Record<XPostType, TypeResult>>;
  picked: Partial<Record<XPostType, boolean>>;
  urlFlags: Partial<Record<XPostType, boolean>>;
  slots: Partial<Record<XPostType, XSlot>>;
}

function tomorrowLocal(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export default function XFanoutTab({ noteItems, noteItemsLoaded }: { noteItems: NoteItem[]; noteItemsLoaded: boolean }) {
  const [articleId, setArticleId] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<XPostType[]>([...X_FANOUT_TYPES]);
  const [threshold, setThreshold] = useState(FANOUT_SIMILARITY_DEFAULT);
  const [urlCount, setUrlCount] = useState(DEFAULT_URL_COUNT);
  const [startDate, setStartDate] = useState('');
  const [intervalDays, setIntervalDays] = useState(DEFAULT_INTERVAL_DAYS);
  const [results, setResults] = useState<Partial<Record<XPostType, TypeResult>>>({});
  const [picked, setPicked] = useState<Partial<Record<XPostType, boolean>>>({});
  const [urlFlags, setUrlFlags] = useState<Partial<Record<XPostType, boolean>>>({});
  const [slots, setSlots] = useState<Partial<Record<XPostType, XSlot>>>({});
  const [running, setRunning] = useState(false);
  const [currentType, setCurrentType] = useState<XPostType | null>(null);
  const [copied, setCopied] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const lockRef = useRef(false); // R-87

  // 開始日の既定は「明日」（266と同じ・クライアントで一度だけ）
  useEffect(() => {
    if (!startDate) setStartDate(tomorrowLocal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // R-20: 前回の結果を復元
  const guardRef = useRef(false);
  guardRef.current = running || Object.keys(results).length > 0;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DraftPayload>(DRAFT_KEY);
      if (cancelled || !draft?.payload || guardRef.current) return;
      const p = draft.payload;
      setArticleId(p.articleId ?? '');
      setArticleUrl(p.articleUrl ?? '');
      setSelectedTypes(normalizeSelectedTypes(p.selectedTypes));
      setThreshold(normalizeThreshold(p.threshold));
      setUrlCount(Math.max(0, Math.min(5, Number(p.urlCount ?? DEFAULT_URL_COUNT) || 0)));
      setIntervalDays(normalizeInterval(p.intervalDays));
      setResults(p.results ?? {});
      setPicked(p.picked ?? {});
      setUrlFlags(p.urlFlags ?? {});
      setSlots(p.slots ?? {});
      if (Object.keys(p.results ?? {}).length > 0) setRestoredAt(draft.updated_at);
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = (over: Partial<DraftPayload> = {}) => {
    saveFeatureDraft(DRAFT_KEY, {
      articleId, articleUrl, selectedTypes, threshold, urlCount, intervalDays,
      results, picked, urlFlags, slots, ...over,
    } satisfies DraftPayload);
  };

  const article = noteItems.find((n) => n.id === articleId) ?? null;
  const articleTitle = article?.title || '(無題)';

  const toggleType = (t: XPostType) => {
    if (running) return;
    setSelectedTypes((prev) => normalizeSelectedTypesKeepEmpty(prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  // ── 生成: 1型 = 1リクエスト（§2-4）───────────────────────────────
  const generateOne = async (type: XPostType): Promise<TypeResult> => {
    const res = await fetch('/api/dr-hub/x-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, threadCount: 2, xLength: 'mini', postType: type, fanout: true }),
      // R-73: ルートの maxDuration（300秒）と同じ見切り。超えたらこの型だけ失敗にして次へ
      signal: AbortSignal.timeout(FANOUT_REQUEST_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `生成に失敗しました（${res.status}）`);
    if (data.notApplicable) {
      return { ...EMPTY, status: 'na', reason: String(data.reason ?? '') };
    }
    const text = String(data.single ?? '').trim();
    if (!text) throw new Error('投稿文が空で返りました');
    return {
      status: 'done',
      text,
      urlReplyLeadin: String(data.urlReplyLeadin ?? ''),
      warnings: Array.isArray(data.warnings?.single) ? data.warnings.single : [],
      reason: '',
      error: '',
    };
  };

  const runAll = async () => {
    if (lockRef.current || running || !articleId || selectedTypes.length === 0) return;
    lockRef.current = true;
    setRunning(true);
    setRestoredAt(null);
    let next: Partial<Record<XPostType, TypeResult>> = {};
    for (const t of selectedTypes) next[t] = { ...EMPTY };
    setResults(next);
    // 選抜は毎回やり直し（既定は未選択＝全件を載せない・§3-2②）。URLと時間帯は既定を引き直す
    const nextUrl = defaultUrlFlags(selectedTypes, urlCount);
    const nextSlots: Partial<Record<XPostType, XSlot>> = {};
    for (const t of selectedTypes) nextSlots[t] = DEFAULT_TYPE_SLOT[t];
    setPicked({});
    setUrlFlags(nextUrl);
    setSlots(nextSlots);
    try {
      for (const t of selectedTypes) {
        setCurrentType(t);
        next = { ...next, [t]: { ...EMPTY, status: 'running' } };
        setResults(next);
        try {
          next = { ...next, [t]: await generateOne(t) };
        } catch (e) {
          // この型だけ失敗にして次へ（R-39）
          next = { ...next, [t]: { ...EMPTY, status: 'failed', error: e instanceof Error ? e.message : '失敗' } };
        }
        setResults(next);
      }
    } finally {
      setCurrentType(null);
      setRunning(false);
      lockRef.current = false;
      persist({ results: next, picked: {}, urlFlags: nextUrl, slots: nextSlots });
    }
  };

  const regenerateOne = async (t: XPostType) => {
    if (lockRef.current || running || !articleId) return;
    lockRef.current = true;
    setRunning(true);
    setCurrentType(t);
    let next = { ...results, [t]: { ...EMPTY, status: 'running' as const } };
    setResults(next);
    try {
      next = { ...next, [t]: await generateOne(t) };
    } catch (e) {
      next = { ...next, [t]: { ...EMPTY, status: 'failed', error: e instanceof Error ? e.message : '失敗' } };
    } finally {
      setResults(next);
      setCurrentType(null);
      setRunning(false);
      lockRef.current = false;
      persist({ results: next });
    }
  };

  // ── 類似度（§3-2①）・日程（§4）────────────────────────────────────
  const donePosts = useMemo(
    () => selectedTypes
      .filter((t) => results[t]?.status === 'done')
      .map((t) => ({ type: t, text: results[t]!.text })),
    [selectedTypes, results],
  );
  const similarPairs = useMemo(() => findSimilarPairs(donePosts, threshold), [donePosts, threshold]);
  const similarOf = (t: XPostType) => similarPairs.filter((p) => p.a === t || p.b === t);

  const pickedTypes = selectedTypes.filter((t) => picked[t] && results[t]?.status === 'done');
  const scheduleRows = useMemo(
    () => buildFanoutSchedule(
      pickedTypes.map((t) => ({ type: t, slot: slots[t], withUrl: !!urlFlags[t] })),
      startDate,
      intervalDays,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedTypes.join(','), slots, urlFlags, startDate, intervalDays],
  );
  const urlOnCount = selectedTypes.filter((t) => urlFlags[t] && results[t]?.status === 'done').length;

  const copy = async (key: string, fn: () => Promise<boolean | void> | boolean | void) => {
    try {
      await fn();
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* ボタン表記を変えない */ }
  };
  const urlReply = (t: XPostType) =>
    `${results[t]?.urlReplyLeadin || '本文で触れた記事の全文はこちらです'}\n👉 ${articleUrl.trim() || '（記事URLをここに貼ってください）'}`;

  const doneCount = selectedTypes.filter((t) => ['done', 'na', 'failed'].includes(results[t]?.status ?? '')).length;
  const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const small: React.CSSProperties = { padding: '4px 10px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer' };
  const input: React.CSSProperties = { padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' };

  return (
    <div data-fanout-root>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          📆 記事1本 → 型の異なるX投稿を時間差で
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          note記事1本から5型（保存・共感・議論・引用・滞在）の投稿を作り、間隔を空けて日程に割り当てます。
          生成はまとめて、<strong>日程に載せるのは選んだものだけ</strong>。内容が被った投稿には警告が出ます。<br />
          {restoredAt && <span style={{ color: 'var(--text-secondary)' }}>🕘 前回の結果を復元しています</span>}
        </p>

        {/* 素材（保存一覧のnote記事1本） */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>元になるnote記事（1本）</div>
        {noteItems.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {noteItemsLoaded ? '保存済みのnote記事がありません。①や②で記事を作って保存するとここに出ます。' : '読み込み中…'}
          </div>
        ) : (
          <select
            data-fanout-article
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            disabled={running}
            style={{ ...input, width: '100%', padding: '10px 12px', fontSize: 13, marginBottom: 12 }}
          >
            <option value="">— note記事を選ぶ —</option>
            {noteItems.map((n) => (
              <option key={n.id} value={n.id}>{n.title || '(無題)'}</option>
            ))}
          </select>
        )}

        {/* 型の選択（既定=全5型・§2-3） */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>生成する型（{selectedTypes.length}/5）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {X_FANOUT_TYPES.map((t) => {
            const on = selectedTypes.includes(t);
            const def = X_POST_TYPES[t];
            return (
              <button
                key={t}
                type="button"
                data-fanout-type={t}
                aria-pressed={on}
                onClick={() => toggleType(t)}
                disabled={running}
                title={`狙うシグナル: ${def.signal}`}
                style={{ padding: '6px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', border: on ? `2px solid ${ACCENT}` : '1px solid var(--border)', background: on ? `${ACCENT}12` : 'var(--bg-primary)', color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {on ? '☑' : '☐'} {def.emoji} {def.label}
              </button>
            );
          })}
        </div>

        {/* 仮説として置いている既定値（実運用で調整できる） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            被り警告のしきい値:
            <input data-fanout-threshold type="number" step={0.05} min={FANOUT_SIMILARITY_MIN} max={FANOUT_SIMILARITY_MAX} value={threshold} onChange={(e) => setThreshold(normalizeThreshold(e.target.value))} style={{ ...input, width: 70 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            URLを付ける件数（既定）:
            <input data-fanout-url-count type="number" min={0} max={5} value={urlCount} onChange={(e) => setUrlCount(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} disabled={running} style={{ ...input, width: 60 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 240 }}>
            記事URL（2通目用）:
            <input value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://note.com/…" style={{ ...input, flex: 1 }} />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          {running && currentType && (
            <span data-fanout-progress style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              生成中: {X_POST_TYPES[currentType].emoji} {X_POST_TYPES[currentType].label}（{doneCount}/{selectedTypes.length}型 完了）
            </span>
          )}
          <button
            type="button"
            data-fanout-run
            onClick={runAll}
            disabled={running || !articleId || selectedTypes.length === 0}
            style={{ padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: running || !articleId ? 'not-allowed' : 'pointer', opacity: running || !articleId || selectedTypes.length === 0 ? 0.5 : 1 }}
          >
            {running ? '生成中…' : `🐦 ${selectedTypes.length}型を順に生成する`}
          </button>
        </div>
      </div>

      {/* 結果 */}
      {Object.keys(results).length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>生成結果（読んで選ぶ）</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
            気に入った投稿だけ「日程に載せる」を付けてください。URLは既定で{urlCount}件（③議論型・④常識破壊型は既定なし）。いまURLあり: {urlOnCount}件。
          </p>
          {similarPairs.length > 0 && (
            <div data-fanout-similar style={{ fontSize: 12, color: '#92400e', background: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.35)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, lineHeight: 1.7 }}>
              ⚠️ 内容が被っている組があります（同じ話の焼き直しは共有されにくくなります）:
              {similarPairs.map((p) => (
                <div key={`${p.a}-${p.b}`}>・{X_POST_TYPES[p.a].label} × {X_POST_TYPES[p.b].label}（一致度 {Math.round(p.score * 100)}%）— どちらか一方だけ載せるか、作り直しを</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedTypes.map((t) => {
              const r = results[t] ?? EMPTY;
              const def = X_POST_TYPES[t];
              const sim = similarOf(t);
              return (
                <div key={t} data-fanout-card={t} data-fanout-status={r.status} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg-primary)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{def.emoji} {def.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>狙い: {def.signal}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" data-fanout-regenerate={t} onClick={() => regenerateOne(t)} disabled={running} style={small}>🔁 この型だけ作り直す</button>
                    {r.status === 'done' && (
                      <>
                        <button type="button" data-fanout-copy={t} onClick={() => copy(`p-${t}`, () => copyToClipboard(r.text))} style={small}>{copied === `p-${t}` ? '✅ コピー済み' : '📋 本文をコピー'}</button>
                        {urlFlags[t] && (
                          <button type="button" data-fanout-copy-url={t} onClick={() => copy(`u-${t}`, () => copyToClipboard(urlReply(t)))} style={small}>{copied === `u-${t}` ? '✅' : '📋 2通目（URL）'}</button>
                        )}
                      </>
                    )}
                  </div>

                  {r.status === 'running' && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⏳ 生成中…</div>}
                  {r.status === 'failed' && <div data-fanout-error style={{ fontSize: 12, color: '#ef4444' }}>⚠️ この型の生成に失敗しました（{r.error}）。他の型はそのまま使えます。</div>}
                  {r.status === 'na' && <div data-fanout-na style={{ fontSize: 12, color: 'var(--text-muted)' }}>該当なし — この記事からはこの型を無理なく作れません{r.reason ? `（${r.reason}）` : ''}</div>}
                  {r.status === 'done' && (
                    <>
                      {/* 288/R-45: 読む画面は整形表示（コピーは従来どおり原文） */}
                      <MarkdownBody data-fanout-body text={r.text} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.9, marginBottom: 8 }} />
                      {r.warnings.length > 0 && (
                        <div data-fanout-warnings style={{ fontSize: 11, color: '#B45309', marginBottom: 8, lineHeight: 1.7 }}>
                          {r.warnings.map((w, i) => <div key={i}>⚠️ {w.message}</div>)}
                        </div>
                      )}
                      {sim.length > 0 && (
                        <div data-fanout-card-similar style={{ fontSize: 11, color: '#92400e', marginBottom: 8 }}>
                          ⚠️ {sim.map((p) => X_POST_TYPES[p.a === t ? p.b : p.a].label).join('・')} と内容が被っています
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>
                          <input type="checkbox" data-fanout-pick={t} checked={!!picked[t]} onChange={(e) => { const nv = { ...picked, [t]: e.target.checked }; setPicked(nv); persist({ picked: nv }); }} />
                          日程に載せる
                        </label>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" data-fanout-url={t} checked={!!urlFlags[t]} onChange={(e) => { const nv = { ...urlFlags, [t]: e.target.checked }; setUrlFlags(nv); persist({ urlFlags: nv }); }} />
                          記事URLを2通目に付ける
                        </label>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          時間帯:
                          <select data-fanout-slot={t} value={slots[t] ?? DEFAULT_TYPE_SLOT[t]} onChange={(e) => { const nv = { ...slots, [t]: e.target.value as XSlot }; setSlots(nv); persist({ slots: nv }); }} style={input}>
                            {(Object.keys(X_SLOTS) as XSlot[]).map((s) => (
                              <option key={s} value={s}>{X_SLOTS[s].label} {X_SLOTS[s].time}（{X_SLOTS[s].window}）</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 日程（§4）。同一記事由来の投稿は同じ日に入らない（§3-2③） */}
      {Object.keys(results).length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>🗓 日程（選んだ{pickedTypes.length}件）</span>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              開始日:
              <input data-fanout-start type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={input} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              間隔（日）:
              <input data-fanout-interval type="number" min={INTERVAL_DAYS_MIN} max={INTERVAL_DAYS_MAX} value={intervalDays} onChange={(e) => setIntervalDays(normalizeInterval(e.target.value))} style={{ ...input, width: 60 }} />
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" data-fanout-copy-schedule onClick={() => copy('sched', () => copyRichMarkdown(fanoutScheduleToMarkdown(articleTitle, scheduleRows)))} disabled={scheduleRows.length === 0} style={small}>
              {copied === 'sched' ? '✅ コピー済み' : '📋 日程表をコピー'}
            </button>
          </div>
          {scheduleRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>「日程に載せる」を付けた投稿がここに並びます。土日は次の平日へ送ります（🗓予約投稿カレンダーと同じ）。</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>投稿日</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>曜日</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>時間帯</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>型</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((r) => (
                    <tr key={r.type} data-fanout-row={r.type} data-fanout-row-date={r.date} style={{ color: 'var(--text-primary)' }}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{r.date}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{r.weekday}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{X_SLOTS[r.slot].label} {r.time}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{r.typeLabel}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{r.withUrl ? '2通目に付ける' : 'なし'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                投稿はXのアプリから手動で。URLは本文ではなく1つ目のリプライへ（X-03）。🗓予約投稿カレンダー（note用）とは時間帯が異なります。
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 型の並びは固定順（表示・日程の順序を型の順に揃える）。空選択は空のまま返す（実行ボタンが無効になる） */
function normalizeSelectedTypesKeepEmpty(list: XPostType[]): XPostType[] {
  return X_FANOUT_TYPES.filter((t) => list.includes(t));
}
