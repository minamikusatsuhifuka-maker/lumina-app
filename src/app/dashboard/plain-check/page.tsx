'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 279: 🔍 分かりやすさ診断 — 分かりにくい箇所を指摘し、箇所ごとに「あるあるネタ」で言い換え候補を出す。
//  - 診断は**機械検出（決定的・AI不使用）**。同じ文章なら必ず同じ結果（R-74）
//  - AI判定は「参考」として別枠に表示（機械検出と混ぜない・§2-2）
//  - 言い換えは**1箇所=1リクエストの提案**。本文は自動で書き換えない・一括変換ボタンは置かない（§3・R-26）
//  - 元の文 ↔ 言い換え後を並べ、文字単位の差分を色分け（236の text-diff を流用・§3-3）
//  - 入力の3ボタン=270、読者/分野/ガード=276の資産を流用（§1-3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useRef, useState } from 'react';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { PasteButton } from '@/components/TouchPaste';
import { useToast } from '@/components/ui/Toast';
import { CLEAR_PASTE_MESSAGE, clearAndPaste } from '@/lib/clear-and-paste';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { clearFeatureDraft, loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { inlineDiff, type InlinePart } from '@/lib/text-diff';
import { DEFAULT_METAPHOR_FIELD, METAPHOR_FIELDS, type MetaphorField } from '@/lib/metaphor';
import {
  AI_ISSUE_KIND_DEFS,
  DEFAULT_PLAIN_AUDIENCE,
  ISSUE_KIND_DEFS,
  PLAIN_AUDIENCES,
  PLAIN_INPUT_MAX,
  diagnose,
  plainSaveTitle,
  reportToMarkdown,
  splitSentences,
  type AiIssueKind,
  type PlainAudienceKey,
  type PlainIssue,
  type RephraseCandidate,
} from '@/lib/plain-check';

interface AiIssue { kind: AiIssueKind; excerpt: string; note: string }
interface RephraseState {
  status: 'idle' | 'running' | 'done' | 'failed';
  candidates: RephraseCandidate[];
  reason: string;
  adCheck: { status: string; findings: string[] } | null;
  error: string;
}
interface DraftPayload {
  sourceText: string;
  field: MetaphorField;
  audience: PlainAudienceKey;
  issues: PlainIssue[];
  aiIssues: AiIssue[];
  rephrases: Record<string, RephraseState>;
}

const DRAFT_KEY = 'plain-check';
const ACCENT = '#6c63ff';

export default function PlainCheckPage() {
  const { showToast } = useToast();
  const [sourceText, setSourceText] = useState('');
  const [field, setField] = useState<MetaphorField>(DEFAULT_METAPHOR_FIELD);
  const [audience, setAudience] = useState<PlainAudienceKey>(DEFAULT_PLAIN_AUDIENCE);
  const [diagnosedText, setDiagnosedText] = useState('');
  const [issues, setIssues] = useState<PlainIssue[] | null>(null);
  const [aiIssues, setAiIssues] = useState<AiIssue[] | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [aiError, setAiError] = useState('');
  const [rephrases, setRephrases] = useState<Record<string, RephraseState>>({});
  const [copied, setCopied] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [save, setSave] = useState<{ saving: boolean; savedId: string; error: string }>({ saving: false, savedId: '', error: '' });
  const [clearedText, setClearedText] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const undoTimerRef = useRef<number | null>(null);
  const aiLockRef = useRef(false); // R-87
  const rephraseLockRef = useRef<Set<string>>(new Set());

  const stopUndoTimer = () => { if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current); undoTimerRef.current = null; };
  useEffect(() => stopUndoTimer, []);

  // R-20: 復元
  const guardRef = useRef(false);
  guardRef.current = !!sourceText.trim() || issues !== null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DraftPayload>(DRAFT_KEY);
      if (cancelled || !draft?.payload?.issues || guardRef.current) return;
      const p = draft.payload;
      setSourceText(p.sourceText ?? '');
      setDiagnosedText(p.sourceText ?? '');
      setField(p.field === 'general' ? 'general' : 'medical');
      setAudience(PLAIN_AUDIENCES.some((a) => a.key === p.audience) ? p.audience : DEFAULT_PLAIN_AUDIENCE);
      setIssues(p.issues);
      setAiIssues(p.aiIssues ?? null);
      if (p.aiIssues) setAiStatus('done');
      setRephrases(p.rephrases ?? {});
      setRestoredAt(draft.updated_at);
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = (over: Partial<DraftPayload> = {}) => {
    saveFeatureDraft(DRAFT_KEY, {
      sourceText: diagnosedText, field, audience, issues: issues ?? [], aiIssues: aiIssues ?? [], rephrases, ...over,
    } satisfies DraftPayload);
  };

  const sentences = useMemo(() => splitSentences(diagnosedText), [diagnosedText]);
  const overLimit = sourceText.trim().length > PLAIN_INPUT_MAX;
  const stale = issues !== null && diagnosedText !== sourceText; // 本文を編集したら再診断を促す

  // ── 270の3ボタン ──
  const handleClearInput = () => {
    if (!sourceText) return;
    setClearedText(sourceText); setSourceText(''); stopUndoTimer();
    undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
  };
  const handleClearAndPaste = async () => {
    if (pasting) return;
    setPasting(true);
    try {
      const result = await clearAndPaste({
        current: sourceText, setText: setSourceText, textareaRef: inputRef,
        backup: (t) => { setClearedText(t); stopUndoTimer(); undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000); },
      });
      const msg = CLEAR_PASTE_MESSAGE[result];
      showToast(msg.text, msg.kind === 'success' ? 'success' : 'warning');
    } finally { setPasting(false); }
  };

  // ── 診断（機械検出・AI不使用・即時）──
  const runDiagnose = () => {
    const text = sourceText.trim();
    if (!text || overLimit) return;
    const found = diagnose(text);
    setDiagnosedText(text);
    setIssues(found);
    setAiIssues(null); setAiStatus('idle'); setAiError('');
    setRephrases({});
    setRestoredAt(null);
    setSave({ saving: false, savedId: '', error: '' });
    saveFeatureDraft(DRAFT_KEY, { sourceText: text, field, audience, issues: found, aiIssues: [], rephrases: {} } satisfies DraftPayload);
  };

  // ── AI判定（参考・別ボタン）──
  const runAiReview = async () => {
    if (aiLockRef.current || !diagnosedText) return;
    aiLockRef.current = true;
    setAiStatus('running'); setAiError('');
    try {
      const res = await fetch('/api/plain-check/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: diagnosedText, audience }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `AI判定に失敗しました（${res.status}）`);
      const items: AiIssue[] = Array.isArray(data.items) ? data.items : [];
      setAiIssues(items); setAiStatus('done');
      persist({ aiIssues: items });
    } catch (e) {
      setAiStatus('failed'); setAiError(e instanceof Error ? e.message : '失敗');
    } finally { aiLockRef.current = false; }
  };

  // ── 言い換え（1箇所=1リクエスト・提案のみ）──
  const runRephrase = async (issue: PlainIssue) => {
    if (rephraseLockRef.current.has(issue.id)) return;
    rephraseLockRef.current.add(issue.id);
    let next = { ...rephrases, [issue.id]: { status: 'running' as const, candidates: [], reason: '', adCheck: null, error: '' } };
    setRephrases(next);
    try {
      const res = await fetch('/api/plain-check/rephrase', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field, audience, kind: issue.kind, sentence: issue.sentence, excerpt: issue.excerpt, detail: issue.detail,
          before: sentences[issue.sentenceIndex - 1] ?? '', after: sentences[issue.sentenceIndex + 1] ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `言い換えに失敗しました（${res.status}）`);
      next = { ...next, [issue.id]: { status: 'done', candidates: Array.isArray(data.candidates) ? data.candidates : [], reason: String(data.reason ?? ''), adCheck: data.adCheck ?? null, error: '' } };
    } catch (e) {
      // この箇所だけ失敗にする（R-39）
      next = { ...next, [issue.id]: { status: 'failed', candidates: [], reason: '', adCheck: null, error: e instanceof Error ? e.message : '失敗' } };
    } finally {
      rephraseLockRef.current.delete(issue.id);
      setRephrases(next);
      persist({ rephrases: next });
    }
  };

  const copy = async (key: string, fn: () => Promise<boolean | void> | boolean | void) => {
    try { await fn(); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { /* 表記を変えない */ }
  };
  const reportMarkdown = () => reportToMarkdown({
    sourceText: diagnosedText, field, audienceKey: audience, issues: issues ?? [], aiIssues: aiIssues ?? [],
    rephrases: Object.fromEntries(Object.entries(rephrases).map(([k, v]) => [k, v.candidates])),
  });
  const saveToList = async () => {
    if (!issues || save.saving) return;
    setSave({ saving: true, savedId: '', error: '' });
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: plainSaveTitle(diagnosedText), content: reportMarkdown(), analysisType: 'plain_check', analysisLabel: '分かりやすさ診断', tags: ['分かりやすさ診断'], inputText: diagnosedText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setSave({ saving: false, savedId: String(data.id ?? data.save?.id ?? 'saved'), error: '' });
    } catch (e) { setSave({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' }); }
  };
  const clearDraft = () => {
    setRestoredAt(null); setIssues(null); setAiIssues(null); setAiStatus('idle'); setRephrases({});
    setSourceText(''); setDiagnosedText(''); clearFeatureDraft(DRAFT_KEY);
  };

  const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 };
  const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
  const input: React.CSSProperties = { padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔍 分かりやすさ診断</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        文章の中で一般の方や中学生に分かりにくい箇所を指摘し、箇所ごとに「あるあるネタ」で言い換え候補を出します。
        診断は機械的な検出なので<strong>同じ文章なら毎回同じ結果</strong>です。<br />
        <strong style={{ color: '#f59e0b' }}>⚠️ 言い換えは提案です。本文は自動で書き換えません。元の文と読み比べて、意味が変わっていないか確認してから使ってください。</strong>
      </p>
      {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={clearDraft} />}

      {/* ① 文章 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>① 診断したい文章</span>
          <span style={{ fontSize: 11, color: overLimit ? '#ef4444' : 'var(--text-muted)' }}>{sourceText.length.toLocaleString()} / {PLAIN_INPUT_MAX.toLocaleString()}字</span>
          <span style={{ flex: 1 }} />
          {clearedText !== null && (
            <button type="button" onClick={() => { setSourceText(clearedText); setClearedText(null); stopUndoTimer(); }} style={{ ...smallBtn, color: ACCENT, borderColor: ACCENT }}>↩ 元に戻す</button>
          )}
          <button type="button" data-plain-clear onClick={handleClearInput} disabled={!sourceText} style={{ ...smallBtn, opacity: sourceText ? 1 : 0.5 }}>✕ クリア</button>
          <PasteButton value={sourceText} setValue={setSourceText} targetRef={inputRef} notify={(t, k) => showToast(t, k)} showOnFinePointer />
          <button type="button" data-clear-paste onClick={() => void handleClearAndPaste()} disabled={pasting} style={{ ...smallBtn, opacity: pasting ? 0.5 : 1 }}>{pasting ? '⏳ 貼付中...' : '📋 クリアして貼付'}</button>
        </div>
        <textarea
          ref={inputRef}
          data-plain-input
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="例: 角層のバリア機能が低下すると経皮吸収が亢進し、外用薬のアドヒアランスがQOLに与えるインパクトはエビデンスベースで検討されるべきパラダイムである。"
          style={{ width: '100%', minHeight: 150, background: 'var(--bg-primary)', border: `1px solid ${overLimit ? '#ef4444' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: 12, outline: 'none', fontFamily: 'inherit', lineHeight: 1.8, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            対象読者:
            <select data-plain-audience value={audience} onChange={(e) => setAudience(e.target.value as PlainAudienceKey)} style={input}>
              {PLAIN_AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.emoji} {a.label} — {a.hint}</option>)}
            </select>
          </label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            分野:
            {METAPHOR_FIELDS.map((f) => (
              <button key={f.key} type="button" data-plain-field={f.key} aria-pressed={field === f.key} onClick={() => setField(f.key)}
                style={{ ...smallBtn, fontWeight: field === f.key ? 700 : 400, border: `1px solid ${field === f.key ? ACCENT : 'var(--border)'}`, background: field === f.key ? `${ACCENT}12` : 'transparent', color: field === f.key ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {field === f.key ? '☑' : '☐'} {f.label}
              </button>
            ))}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" data-plain-diagnose onClick={runDiagnose} disabled={!sourceText.trim() || overLimit}
            style={{ padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff', opacity: !sourceText.trim() || overLimit ? 0.5 : 1 }}>
            🔍 診断する（AIは使いません・すぐ出ます）
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
          分野が「医療・健康」のときは医療広告のガード（効果の断定・数値化・不安を煽る比喩・戦争のたとえ）を言い換えに適用します。分野は自動で判定しません。
        </div>
      </div>

      {issues !== null && (
        <>
          {stale && (
            <div data-plain-stale style={{ fontSize: 12, color: '#92400e', background: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.35)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              本文が編集されています。下の指摘は編集前の文章に対するものです。「診断する」を押し直してください。
            </div>
          )}

          {/* ② 機械検出（確定） */}
          <div style={card} data-plain-machine>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>② 機械検出</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${ACCENT}22`, color: ACCENT }}>確定・同じ文章なら同じ結果</span>
              <span data-plain-count style={{ fontSize: 12, color: 'var(--text-muted)' }}>{issues.length}件</span>
              <span style={{ flex: 1 }} />
              <button type="button" data-plain-copy-report onClick={() => copy('report', () => copyRichMarkdown(reportMarkdown()))} style={smallBtn}>{copied === 'report' ? '✅ コピーしました' : '📋 診断結果をコピー'}</button>
              <button type="button" data-plain-save onClick={saveToList} disabled={save.saving} style={smallBtn}>{save.saving ? '保存中…' : save.savedId ? '✅ 保存済み（🗃保存一覧）' : save.error ? '⚠️ 保存に失敗・再試行' : '💾 保存一覧へ保存'}</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>指摘ごとに「言い換え候補を見る」を押すと、その1文だけの候補が出ます。本文は書き換えません。</p>
            {issues.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>機械で拾える分かりにくさは見つかりませんでした。</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {issues.map((issue) => {
                const st = rephrases[issue.id];
                return (
                  <div key={issue.id} data-plain-issue={issue.id} data-plain-kind={issue.kind} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-primary)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{ISSUE_KIND_DEFS[issue.kind].label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{issue.sentenceIndex + 1}文目{issue.detail ? ` ／ ${issue.detail}` : ''}</span>
                      <span style={{ flex: 1 }} />
                      <button type="button" data-plain-rephrase={issue.id} onClick={() => runRephrase(issue)} disabled={st?.status === 'running'} style={smallBtn}>
                        {st?.status === 'running' ? '⏳ 生成中…' : st?.status === 'done' ? '🔁 もう一度' : '✨ 言い換え候補を見る'}
                      </button>
                    </div>
                    <div data-plain-sentence style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.9 }}>
                      {highlight(issue.sentence, issue.excerpt)}
                    </div>

                    {st?.status === 'failed' && <div data-plain-rephrase-error style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>⚠️ この箇所の言い換えに失敗しました（{st.error}）。他の箇所はそのまま使えます。</div>}
                    {st?.status === 'done' && st.candidates.length === 0 && (
                      <div data-plain-rephrase-none style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>同じ意味を保った言い換えが作れませんでした{st.reason ? `（${st.reason}）` : ''}。</div>
                    )}
                    {st?.status === 'done' && st.candidates.map((c, ci) => {
                      const { leftParts, rightParts } = inlineDiff(issue.sentence, c.text);
                      return (
                        <div key={ci} data-plain-candidate={`${issue.id}-${ci}`} style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>候補{ci + 1}{c.note ? `（${c.note}）` : ''}</span>
                            <span style={{ flex: 1 }} />
                            <button type="button" data-plain-copy-candidate={`${issue.id}-${ci}`} onClick={() => copy(`c-${issue.id}-${ci}`, () => copyToClipboard(c.text))} style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}>{copied === `c-${issue.id}-${ci}` ? '✅' : '📋 コピー'}</button>
                          </div>
                          {/* §3-3: 元の文 ↔ 言い換え後（文字単位の差分・236の text-diff） */}
                          <div className="grid gap-2 grid-cols-1 md:grid-cols-2" data-plain-diff>
                            <div data-plain-diff-left style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-primary)' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>元の文</div>
                              {renderParts(leftParts, 'removed')}
                            </div>
                            <div data-plain-diff-right style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-primary)' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>言い換え後</div>
                              {renderParts(rightParts, 'added')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {st?.status === 'done' && st.adCheck?.status === 'warn' && st.adCheck.findings.length > 0 && (
                      <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>⚠️ 医療広告の観点で確認したい点: {st.adCheck.findings.join(' / ')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ③ AI判定（参考） */}
          <div data-plain-ai style={{ ...card, borderStyle: 'dashed', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>③ AI判定</span>
              <span data-plain-ai-label style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(100,116,139,0.18)', color: '#64748b' }}>参考・毎回同じとは限りません</span>
              <span style={{ flex: 1 }} />
              <button type="button" data-plain-ai-run onClick={runAiReview} disabled={aiStatus === 'running' || stale} style={smallBtn}>
                {aiStatus === 'running' ? '⏳ 判定中…' : aiStatus === 'done' ? '🔁 もう一度AIに聞く' : '🤖 AIにも聞いてみる（文脈・論理の飛躍・前提の省略）'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>機械では拾えない分かりにくさをAIが指摘します。確定ではなく参考です。上の機械検出とは別枠です。</p>
            {aiStatus === 'failed' && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ AI判定に失敗しました（{aiError}）。機械検出の結果はそのまま使えます。</div>}
            {aiStatus === 'done' && aiIssues && aiIssues.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AIからの指摘はありませんでした。</div>}
            {aiIssues?.map((a, i) => (
              <div key={i} data-plain-ai-issue style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, padding: '6px 0', borderTop: i > 0 ? '1px dashed var(--border)' : 'none' }}>
                <span style={{ fontWeight: 700, color: '#64748b' }}>参考 ／ {AI_ISSUE_KIND_DEFS[a.kind]}</span>「{a.excerpt}」 — {a.note}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function highlight(sentence: string, excerpt: string) {
  if (!excerpt || !sentence.includes(excerpt) || excerpt === sentence) return sentence;
  const idx = sentence.indexOf(excerpt);
  return (
    <>
      {sentence.slice(0, idx)}
      <mark style={{ background: 'rgba(239,159,39,0.35)', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>{excerpt}</mark>
      {sentence.slice(idx + excerpt.length)}
    </>
  );
}

function renderParts(parts: InlinePart[], emphasize: 'removed' | 'added') {
  return parts.map((p, i) =>
    p.op === emphasize ? (
      <mark key={i} style={{ background: emphasize === 'removed' ? 'rgba(239,68,68,0.22)' : 'rgba(29,158,117,0.25)', color: 'inherit', borderRadius: 3, padding: '0 1px', textDecoration: emphasize === 'removed' ? 'line-through' : 'none' }}>{p.text}</mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}
