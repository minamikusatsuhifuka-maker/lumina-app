'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 276: 🔗 喩え話・比喩表現の生成（汎用・中学生に伝わる水準）
// 文章＋分野＋ターゲット層（最大3つ）→ 層ごとに3軸の比喩を生成し、横並びで読み比べる。
//
// 既存資産の流用（新規は生成部分のみ）:
//  - 入力欄の3ボタン（✕クリア／📋ペースト／📋クリアして貼付）= 270（TouchPaste + clear-and-paste）
//  - 列数の判断・グリッド・タッチ端末1列 = 271（lib/batch-compare の resolveCompareColumns / compareGridClass）
//  - 列ヘッダーsticky = 271の方式
//  - 選択カード「選択中: n/3件」= ①ペルソナ別note記事・271と同じ形式
//
// 生成は**ターゲット層1つ = 1リクエスト**。1層の失敗で他を巻き添えにしない（R-39）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useRef, useState } from 'react';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { PasteButton } from '@/components/TouchPaste';
import { useToast } from '@/components/ui/Toast';
import { CLEAR_PASTE_MESSAGE, clearAndPaste } from '@/lib/clear-and-paste';
import { compareGridClass, resolveCompareColumns } from '@/lib/batch-compare';
import { clearFeatureDraft, loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { useFinePointer } from '@/lib/pointer-device';
import { copyRichMarkdown } from '@/lib/rich-copy';
import {
  AXIS_NOT_APPLICABLE,
  DEFAULT_METAPHOR_AUDIENCE,
  DEFAULT_METAPHOR_FIELD,
  MAX_METAPHOR_TARGETS,
  METAPHOR_AXES,
  METAPHOR_FIELDS,
  METAPHOR_INPUT_MAX,
  audiencesForField,
  checkColumnPlainLanguage,
  columnToMarkdown,
  isAxisNotApplicable,
  itemToMarkdown,
  metaphorAudienceOf,
  metaphorDocumentToMarkdown,
  metaphorSaveTitle,
  sanitizeTargets,
  toggleMetaphorTarget,
  type MetaphorAudienceKey,
  type MetaphorField,
  type MetaphorItem,
} from '@/lib/metaphor';

type AdCheck = { status: string; findings: string[] } | null;

interface ColumnState {
  audienceKey: MetaphorAudienceKey;
  status: 'idle' | 'running' | 'done' | 'failed';
  items: MetaphorItem[] | null;
  adCheck: AdCheck;
  error: string;
}

const DRAFT_KEY = 'metaphor';
const ACCENT = '#6c63ff';

interface DraftPayload {
  sourceText: string;
  field: MetaphorField;
  columns: { audienceKey: MetaphorAudienceKey; items: MetaphorItem[] | null }[];
}

export default function MetaphorPage() {
  const { showToast } = useToast();
  const { fine, mounted } = useFinePointer();

  const [sourceText, setSourceText] = useState('');
  const [field, setField] = useState<MetaphorField>(DEFAULT_METAPHOR_FIELD);
  const [targets, setTargets] = useState<MetaphorAudienceKey[]>([DEFAULT_METAPHOR_AUDIENCE]);
  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [running, setRunning] = useState(false);
  const [currentKey, setCurrentKey] = useState<MetaphorAudienceKey | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [save, setSave] = useState<{ saving: boolean; savedId: string; error: string }>({
    saving: false, savedId: '', error: '',
  });
  // 270: クリアのUndo（10秒）。3ボタンの並びは📝テキスト分析と同じ
  const [clearedText, setClearedText] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const undoTimerRef = useRef<number | null>(null);

  const stopUndoTimer = () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  };
  useEffect(() => stopUndoTimer, []);

  // R-20: 前回の結果を復元（正はDB＝端末をまたいで戻る）
  const draftGuardRef = useRef(false);
  draftGuardRef.current = running || columns.length > 0 || !!sourceText.trim();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DraftPayload>(DRAFT_KEY);
      if (cancelled || !draft?.payload?.columns?.length) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setSourceText(p.sourceText ?? '');
      const nextField = p.field === 'general' ? 'general' : 'medical';
      setField(nextField);
      const keys = sanitizeTargets(p.columns.map((c) => c.audienceKey), nextField);
      setTargets(keys.length > 0 ? keys : [DEFAULT_METAPHOR_AUDIENCE]);
      setColumns(
        p.columns
          .filter((c) => keys.includes(c.audienceKey))
          .map((c) => ({
            audienceKey: c.audienceKey,
            status: c.items && c.items.length > 0 ? 'done' : 'idle',
            items: c.items,
            adCheck: null,
            error: '',
          })),
      );
      setRestoredAt(draft.updated_at);
    })();
    return () => { cancelled = true; };
  }, []);

  const available = useMemo(() => audiencesForField(field), [field]);
  const doneColumns = columns.filter((c) => c.items && c.items.length > 0);
  // §8-3: 列数は「出している列の数」で決める（失敗した列も枠として残すため doneColumns ではない）。
  // 空トラックを出さない・タッチ端末は1列——判断は271の resolveCompareColumns をそのまま使う
  const cols = resolveCompareColumns(columns.length, mounted ? fine : true);

  const fullMarkdown = useMemo(
    () => metaphorDocumentToMarkdown({
      field,
      columns: columns.map((c) => ({ audienceKey: c.audienceKey, items: c.items })),
    }),
    [columns, field],
  );

  // ── 分野の切替（一般にすると医療特化の層は外れる）──────────────
  const changeField = (next: MetaphorField) => {
    if (running) return;
    setField(next);
    setTargets((prev) => {
      const kept = sanitizeTargets(prev, next);
      return kept.length > 0 ? kept : [DEFAULT_METAPHOR_AUDIENCE];
    });
    setColumns((prev) => prev.filter((c) => sanitizeTargets([c.audienceKey], next).length > 0));
  };

  const toggleTarget = (key: MetaphorAudienceKey) => {
    if (running) return;
    setTargets((prev) => toggleMetaphorTarget(prev, key));
  };

  // ── 入力欄の3ボタン（270の流用）──────────────────────────────
  const handleClearInput = () => {
    if (!sourceText) return;
    setClearedText(sourceText);
    setSourceText('');
    stopUndoTimer();
    undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
  };

  const handleClearAndPaste = async () => {
    if (pasting || running) return;
    setPasting(true);
    try {
      const result = await clearAndPaste({
        current: sourceText,
        setText: (next) => setSourceText(next),
        textareaRef: inputRef,
        backup: (text) => {
          setClearedText(text);
          stopUndoTimer();
          undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
        },
      });
      const msg = CLEAR_PASTE_MESSAGE[result];
      showToast(msg.text, msg.kind === 'success' ? 'success' : 'warning');
    } finally {
      setPasting(false);
    }
  };

  // ── 生成（1ターゲット層 = 1リクエスト・§8-2）───────────────────
  const generateOne = async (
    audienceKey: MetaphorAudienceKey,
  ): Promise<{ items: MetaphorItem[]; adCheck: AdCheck }> => {
    const res = await fetch('/api/metaphor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sourceText.trim(), field, audience: audienceKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `生成に失敗しました（${res.status}）`);
    return { items: Array.isArray(data.items) ? data.items : [], adCheck: data.adCheck ?? null };
  };

  const runAll = async () => {
    if (running || !sourceText.trim() || targets.length === 0) return;
    if (sourceText.trim().length > METAPHOR_INPUT_MAX) {
      setError(`文章は${METAPHOR_INPUT_MAX.toLocaleString()}字までです`);
      return;
    }
    setRunning(true);
    setError('');
    setSave({ saving: false, savedId: '', error: '' });
    let list: ColumnState[] = targets.map((key) => ({
      audienceKey: key, status: 'idle', items: null, adCheck: null, error: '',
    }));
    setColumns(list);

    for (const key of targets) {
      setCurrentKey(key);
      list = list.map((c) => (c.audienceKey === key ? { ...c, status: 'running' } : c));
      setColumns(list);
      try {
        const { items, adCheck } = await generateOne(key);
        list = list.map((c) => (c.audienceKey === key ? { ...c, status: 'done', items, adCheck, error: '' } : c));
      } catch (e) {
        // 失敗した層だけ failed にして次の層へ進む（他を巻き添えにしない＝R-39）
        const message = e instanceof Error ? e.message : '生成に失敗しました';
        list = list.map((c) => (c.audienceKey === key ? { ...c, status: 'failed', error: message } : c));
      }
      setColumns(list);
    }
    setCurrentKey(null);
    setRunning(false);
    saveFeatureDraft(DRAFT_KEY, {
      sourceText,
      field,
      columns: list.map((c) => ({ audienceKey: c.audienceKey, items: c.items })),
    } satisfies DraftPayload);
  };

  // ── 列ごとの再生成（気に入らない1列だけ作り直す・§8-4）──────────
  const regenerateColumn = async (audienceKey: MetaphorAudienceKey) => {
    if (running || !sourceText.trim()) return;
    setRunning(true);
    setCurrentKey(audienceKey);
    let list = columns.map((c) => (c.audienceKey === audienceKey ? { ...c, status: 'running' as const, error: '' } : c));
    setColumns(list);
    try {
      const { items, adCheck } = await generateOne(audienceKey);
      list = list.map((c) => (c.audienceKey === audienceKey ? { ...c, status: 'done' as const, items, adCheck, error: '' } : c));
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成に失敗しました';
      list = list.map((c) => (c.audienceKey === audienceKey ? { ...c, status: 'failed' as const, error: message } : c));
    }
    setColumns(list);
    setCurrentKey(null);
    setRunning(false);
    saveFeatureDraft(DRAFT_KEY, {
      sourceText,
      field,
      columns: list.map((c) => ({ audienceKey: c.audienceKey, items: c.items })),
    } satisfies DraftPayload);
  };

  // ── コピー・保存 ──────────────────────────────────────────────
  // R-71: 貼り付け先を限定しない汎用コピーなので共通の copyRichMarkdown を使う
  const copyMarkdown = async (markdown: string, key: string) => {
    try {
      await copyRichMarkdown(markdown);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* 失敗時はボタン表記を変えない */
    }
  };

  const saveToList = async () => {
    if (doneColumns.length === 0 || save.saving) return;
    setSave({ saving: true, savedId: '', error: '' });
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metaphorSaveTitle(sourceText),
          content: fullMarkdown,
          analysisType: 'metaphor',
          analysisLabel: '喩え話・比喩',
          tags: ['喩え話', METAPHOR_FIELDS.find((f) => f.key === field)?.label ?? ''],
          inputText: sourceText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setSave({ saving: false, savedId: String(data.id ?? data.save?.id ?? 'saved'), error: '' });
    } catch (e) {
      setSave({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' });
    }
  };

  const clearDraft = () => {
    setRestoredAt(null);
    setColumns([]);
    setSourceText('');
    setField(DEFAULT_METAPHOR_FIELD);
    setTargets([DEFAULT_METAPHOR_AUDIENCE]);
    clearFeatureDraft(DRAFT_KEY);
  };

  const card: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 20, marginBottom: 20,
  };
  const smallBtn: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent',
    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
  };

  const overLimit = sourceText.trim().length > METAPHOR_INPUT_MAX;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        🔗 喩え話・比喩表現
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        むずかしい内容を、聞き手に合わせた喩え話にします。ターゲット層は最大{MAX_METAPHOR_TARGETS}つまで選べ、層ごとに
        「構造・モノ」「動作・プロセス」「数量・スケール」の3つの比喩が出ます。<br />
        <strong style={{ color: '#f59e0b' }}>
          ⚠️ 比喩は理解の助けであって根拠ではありません。「当てはまらない点」まで一緒に伝えてください。
        </strong>
      </p>

      {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={clearDraft} />}

      {/* ① 説明したい文章 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            ① 説明したい文章
          </span>
          <span style={{ fontSize: 11, color: overLimit ? '#ef4444' : 'var(--text-muted)' }}>
            {sourceText.length.toLocaleString()} / {METAPHOR_INPUT_MAX.toLocaleString()}字
          </span>
          <span style={{ flex: 1 }} />
          {/* 270の3ボタン（✕クリア／📋ペースト／📋クリアして貼付）を同じ並びで置く */}
          {clearedText !== null && (
            <button
              type="button"
              onClick={() => {
                setSourceText(clearedText);
                setClearedText(null);
                stopUndoTimer();
              }}
              style={{ ...smallBtn, color: ACCENT, borderColor: ACCENT }}
            >
              ↩ 元に戻す
            </button>
          )}
          <button
            type="button"
            data-metaphor-clear
            onClick={handleClearInput}
            disabled={!sourceText}
            title="入力をクリア（直後に「↩ 元に戻す」で戻せます）"
            style={{ ...smallBtn, opacity: sourceText ? 1 : 0.5, cursor: sourceText ? 'pointer' : 'not-allowed' }}
          >
            ✕ クリア
          </button>
          <PasteButton
            value={sourceText}
            setValue={setSourceText}
            targetRef={inputRef}
            disabled={running}
            notify={(text, kind) => showToast(text, kind)}
            showOnFinePointer
          />
          <button
            type="button"
            data-clear-paste
            onClick={() => void handleClearAndPaste()}
            disabled={pasting || running}
            title="入力をクリアしてクリップボードを貼り付け（読み取れなかったときは入力をそのままにします）"
            style={{ ...smallBtn, opacity: pasting || running ? 0.5 : 1 }}
          >
            {pasting ? '⏳ 貼付中...' : '📋 クリアして貼付'}
          </button>
        </div>
        <textarea
          ref={inputRef}
          data-metaphor-input
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder={'例: ミトコンドリアは細胞の中にある小器官で、栄養と酸素からATPというエネルギーの通貨を作り出しています。'}
          disabled={running}
          style={{
            width: '100%', minHeight: 150, background: 'var(--bg-primary)',
            border: `1px solid ${overLimit ? '#ef4444' : 'var(--border)'}`, borderRadius: 8,
            color: 'var(--text-primary)', fontSize: 13, padding: 12, outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.8, resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ② 分野 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          ② 分野
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {METAPHOR_FIELDS.map((f) => {
            const on = field === f.key;
            return (
              <button
                key={f.key}
                type="button"
                data-metaphor-field={f.key}
                aria-pressed={on}
                onClick={() => changeField(f.key)}
                disabled={running}
                style={{
                  padding: '8px 18px', borderRadius: 99, fontSize: 13, cursor: 'pointer',
                  fontWeight: on ? 700 : 400,
                  background: on ? `${ACCENT}12` : 'var(--bg-primary)',
                  border: `1px solid ${on ? ACCENT : 'var(--border)'}`,
                  color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {on ? '☑' : '☐'} {f.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {field === 'medical'
            ? '医療広告のガード（効果の断定・数値化・不安を煽る比喩・戦争のたとえ）を適用します。医療特化のターゲット層も選べます。'
            : '経済・IT・歴史など医療以外の話題向けです。医療広告のガードは外れるので、体や病気の話には使わないでください。'}
          <br />
          分野は自動で判定しません（取り違えると医療の話がガードなしで出るため、必ずご自身で選んでください）。
        </div>
      </div>

      {/* ③ ターゲット層 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          ③ ターゲット層（最大{MAX_METAPHOR_TARGETS}つ）
        </div>
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ marginBottom: 8 }}>
          {available.map((a) => {
            const checked = targets.includes(a.key);
            const full = !checked && targets.length >= MAX_METAPHOR_TARGETS;
            return (
              <button
                key={a.key}
                type="button"
                data-metaphor-target={a.key}
                aria-pressed={checked}
                disabled={full || running}
                onClick={() => toggleTarget(a.key)}
                title={full ? `選べるのは${MAX_METAPHOR_TARGETS}つまでです（どれかを外してください）` : a.hint}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  cursor: full || running ? 'not-allowed' : 'pointer',
                  opacity: full ? 0.45 : 1,
                  border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                  background: checked ? `${ACCENT}12` : 'var(--bg-primary)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {checked ? '☑' : '☐'} {a.emoji} {a.label}
                  {a.medicalOnly && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}> ／ 医療</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{a.hint}</div>
              </button>
            );
          })}
        </div>
        <div data-metaphor-count style={{ fontSize: 12, color: targets.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          選択中: {targets.length}/{MAX_METAPHOR_TARGETS}件
          {mounted && !fine && '（この端末では1列ずつ表示します）'}
        </div>
      </div>

      {/* ④ 実行 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          data-metaphor-run
          type="button"
          onClick={runAll}
          disabled={running || !sourceText.trim() || targets.length === 0 || overLimit}
          style={{
            padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            background: ACCENT, border: `1px solid ${ACCENT}`, color: '#ffffff',
            opacity: running || !sourceText.trim() || targets.length === 0 || overLimit ? 0.5 : 1,
          }}
        >
          {running ? '生成中...' : `▶ 喩え話をつくる（${targets.length}層）`}
        </button>
        {running && currentKey && (
          <span data-metaphor-progress style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            生成中: {metaphorAudienceOf(currentKey).label}（{doneColumns.length}/{targets.length}層 完了）
          </span>
        )}
        {targets.length > 0 && !running && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ターゲット層ごとに1回ずつ、順番に生成します
          </span>
        )}
        {error && <span style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</span>}
      </div>

      {/* 結果（271の横並び。列ヘッダーsticky・タッチ端末は1列） */}
      {columns.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              ⑤ 読み比べ
            </span>
            <span style={{ flex: 1 }} />
            <button data-metaphor-copy-all type="button" onClick={() => copyMarkdown(fullMarkdown, 'all')} style={smallBtn}>
              {copied === 'all' ? '✅ コピーしました' : '📋 全部コピー'}
            </button>
            <button data-metaphor-save type="button" onClick={saveToList} disabled={save.saving} style={smallBtn}>
              {save.saving ? '保存中…' : save.savedId ? '✅ 保存済み（🗃保存一覧）' : save.error ? '⚠️ 保存に失敗・再試行' : '💾 保存一覧へ保存'}
            </button>
          </div>

          <div className={compareGridClass(cols)} data-metaphor-cols={cols}>
            {columns.map((col) => {
              const audience = metaphorAudienceOf(col.audienceKey);
              const plain = col.items ? checkColumnPlainLanguage(col.items) : { abstractWords: [], longSentences: [] };
              return (
                <div
                  key={col.audienceKey}
                  data-metaphor-col={col.audienceKey}
                  style={{
                    maxHeight: '68vh', overflowY: 'auto', background: 'var(--bg-primary)',
                    border: '1px solid var(--border)', borderRadius: 10, minWidth: 0,
                  }}
                >
                  {/* 271§3-2: 列ヘッダーはsticky固定（スクロールしてもどの層か分かる） */}
                  <div
                    data-metaphor-header={col.audienceKey}
                    style={{
                      position: 'sticky', top: 0, zIndex: 1, padding: '10px 12px',
                      background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {audience.emoji} {audience.label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{audience.hint}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          data-metaphor-regenerate={col.audienceKey}
                          onClick={() => regenerateColumn(col.audienceKey)}
                          disabled={running}
                          title="この層だけ作り直す"
                          style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}
                        >
                          🔁
                        </button>
                        {col.items && (
                          <button
                            type="button"
                            data-metaphor-copy-col={col.audienceKey}
                            onClick={() => copyMarkdown(columnToMarkdown(col.audienceKey, col.items!), `col-${col.audienceKey}`)}
                            title="この層をまとめてコピー"
                            style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}
                          >
                            {copied === `col-${col.audienceKey}` ? '✓' : '📋'}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {col.status === 'running' && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⏳ 生成中...</div>
                    )}
                    {col.status === 'failed' && (
                      <div data-metaphor-col-error style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.7 }}>
                        ⚠️ この層の生成に失敗しました（{col.error}）。他の層はそのまま使えます。
                        「🔁」でこの層だけ作り直せます。
                      </div>
                    )}

                    {/* §3-4: 機械検証（表示のみ・自動修正はしない） */}
                    {(plain.abstractWords.length > 0 || plain.longSentences.length > 0) && (
                      <div
                        data-metaphor-plain-warn
                        style={{
                          fontSize: 11, color: '#92400e', background: 'rgba(239,159,39,0.12)',
                          border: '1px solid rgba(239,159,39,0.35)', borderRadius: 8, padding: '6px 10px', lineHeight: 1.7,
                        }}
                      >
                        {plain.abstractWords.length > 0 && (
                          <div>⚠️ むずかしい言葉が入っています: {plain.abstractWords.join('・')}</div>
                        )}
                        {plain.longSentences.length > 0 && (
                          <div>⚠️ 長すぎる文が{plain.longSentences.length}か所あります（1文は40〜60字が目安）</div>
                        )}
                      </div>
                    )}

                    {col.items?.map((item) => {
                      const axis = METAPHOR_AXES.find((a) => a.key === item.axis);
                      const na = isAxisNotApplicable(item);
                      return (
                        <div
                          key={item.axis}
                          data-metaphor-item={item.axis}
                          style={{
                            border: '1px solid var(--border)', borderRadius: 8, padding: 10,
                            background: 'var(--bg-secondary)', opacity: na ? 0.7 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>
                              {axis?.label ?? item.axis}
                            </span>
                            {!na && (
                              <button
                                type="button"
                                data-metaphor-copy-item={item.axis}
                                onClick={() => copyMarkdown(itemToMarkdown(item), `item-${col.audienceKey}-${item.axis}`)}
                                style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}
                              >
                                {copied === `item-${col.audienceKey}-${item.axis}` ? '✓' : '📋'}
                              </button>
                            )}
                          </div>
                          {na ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {AXIS_NOT_APPLICABLE}
                              {item.appliesTo ? `（${item.appliesTo}）` : ''}
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.9, marginBottom: 6 }}>
                                {item.metaphor}
                              </div>
                              <div data-metaphor-applies style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                <strong>当てはまる範囲</strong>: {item.appliesTo || '（未記入）'}
                              </div>
                              <div data-metaphor-not-applies style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                <strong>当てはまらない点</strong>: {item.doesNotApply || '（未記入）'}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {col.adCheck && col.adCheck.status === 'warn' && col.adCheck.findings.length > 0 && (
                      <div style={{ fontSize: 11, color: '#f59e0b', lineHeight: 1.7 }}>
                        ⚠️ 医療広告の観点で確認したい点: {col.adCheck.findings.join(' / ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
