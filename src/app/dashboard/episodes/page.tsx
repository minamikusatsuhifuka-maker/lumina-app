'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281: 📔 エピソード記録 — 自分の過去の経験（一次情報）を貯める
//
// 【最重要・§2】参考例（AIの提示物）と記録欄（自分で書く）を**分離**する。
//   - 参考例は「思い出すための引き金」として**表示のみ**。コピー・挿入・採用ボタンを置かない。
//   - 参考例を記録欄へ流し込む経路を作らない（R-90）。参考例の近くに注意書きを常時表示する。
//   - 参考例は問いかけの形（断定形はサーバ側で落とす）。5〜7件。
// 【§3】記録欄では「自分の行動の数字」を制限しない。効果を数値化した記述には**警告だけ**出す（保存は妨げない）。
//   医療広告ガードは記録段階では適用しない（下流の生成で R-69 後勝ち）。
// 【§4】項目はすべて任意。空でも保存できる。一覧・タグ絞り込み・全文検索。カードは274方式のクリック展開（R-81）。
// 【§8】各入力欄に270の3ボタン（✕クリア／📋ペースト／📋クリアして貼付）。二重発火はrefで遮断（R-87）。
//   参考例の生成失敗は記録の入力を妨げない（R-39）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useRef, useState } from 'react';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { PasteButton } from '@/components/TouchPaste';
import { useToast } from '@/components/ui/Toast';
import { CLEAR_PASTE_MESSAGE, clearAndPaste } from '@/lib/clear-and-paste';
import { clearFeatureDraft, loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { jstShortDate } from '@/lib/jst';
import {
  EFFECT_CLAIM_NOTICE,
  EPISODE_FIELDS,
  EPISODE_FIELD_MAX,
  EPISODE_TAG_MAX,
  EXAMPLE_COUNT_MAX,
  EXAMPLE_COUNT_MIN,
  EXAMPLE_NOTICE,
  EXAMPLE_THEME_MAX,
  detectEffectClaims,
  emptyEpisodeInput,
  episodeCharCount,
  episodeDisplayTitle,
  normalizeEpisodeTags,
  type EpisodeFieldDef,
  type EpisodeInput,
  type EpisodeRecord,
} from '@/lib/episodes';

const DRAFT_KEY = 'episodes';
const ACCENT = '#6c63ff';
const EXAMPLE_ACCENT = '#94a3b8';

interface DraftPayload {
  form: EpisodeInput;
  editingId: number | null;
}

const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 };
const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '10px 12px', outline: 'none', fontFamily: 'inherit', lineHeight: 1.8, boxSizing: 'border-box' };

/**
 * 記録の1欄。270の3ボタンを欄ごとに持つ（クリアのUndoは欄ごと・10秒）。
 * 参考例からの流し込み口は**持たない**（値の入口はキーボード入力とクリップボードだけ）。
 */
function EpisodeTextField({
  def,
  value,
  onChange,
  notify,
}: {
  def: EpisodeFieldDef;
  value: string;
  onChange: (next: string) => void;
  notify: (text: string, kind: 'success' | 'warning') => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [cleared, setCleared] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const undoTimer = useRef<number | null>(null);
  const stopUndo = () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); undoTimer.current = null; };
  useEffect(() => stopUndo, []);
  const backup = (t: string) => { setCleared(t); stopUndo(); undoTimer.current = window.setTimeout(() => setCleared(null), 10000); };

  const handleClear = () => {
    if (!value) return;
    backup(value);
    onChange('');
  };
  const handleClearAndPaste = async () => {
    if (pasting) return;
    setPasting(true);
    try {
      // 270: 読めて中身があったときだけクリアして貼る（R-76）
      const result = await clearAndPaste({ current: value, setText: onChange, textareaRef: ref, backup });
      const msg = CLEAR_PASTE_MESSAGE[result];
      notify(msg.text, msg.kind === 'success' ? 'success' : 'warning');
    } finally {
      setPasting(false);
    }
  };

  return (
    <div data-ep-field-row={def.key} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {def.label}
          {def.core && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: `${ACCENT}22`, color: ACCENT }}>一次情報の要</span>}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{def.hint}・任意</span>
        <span style={{ flex: 1 }} />
        {cleared !== null && (
          <button type="button" data-ep-undo={def.key} onClick={() => { onChange(cleared); setCleared(null); stopUndo(); }} style={{ ...smallBtn, color: ACCENT, borderColor: ACCENT }}>↩ 元に戻す</button>
        )}
        <button type="button" data-ep-clear={def.key} onClick={handleClear} disabled={!value} style={{ ...smallBtn, opacity: value ? 1 : 0.5 }}>✕ クリア</button>
        <PasteButton value={value} setValue={onChange} targetRef={ref} notify={notify} showOnFinePointer />
        <button type="button" data-clear-paste={def.key} onClick={() => void handleClearAndPaste()} disabled={pasting} style={{ ...smallBtn, opacity: pasting ? 0.5 : 1 }}>{pasting ? '⏳ 貼付中...' : '📋 クリアして貼付'}</button>
      </div>
      <textarea
        ref={ref}
        data-ep-field={def.key}
        value={value}
        maxLength={EPISODE_FIELD_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        rows={def.multiline ? 3 : 1}
        style={{ ...inputStyle, minHeight: def.multiline ? 84 : 40, resize: def.multiline ? 'vertical' : 'none' }}
      />
    </div>
  );
}

export default function EpisodesPage() {
  const { showToast } = useToast();
  const notify = (text: string, kind: 'success' | 'warning') => showToast(text, kind);

  // ── 記録フォーム ──
  const [form, setForm] = useState<EpisodeInput>(emptyEpisodeInput());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const saveLockRef = useRef(false); // R-87

  // ── 参考例（別枠・表示のみ）──
  const [theme, setTheme] = useState('');
  const [examples, setExamples] = useState<string[] | null>(null);
  const [exStatus, setExStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [exError, setExError] = useState('');
  const exLockRef = useRef(false); // R-87

  // ── 一覧 ──
  const [items, setItems] = useState<EpisodeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isFormEmpty = useMemo(
    () => episodeCharCount(form) === 0 && form.tags.length === 0,
    [form],
  );
  // §3: 効果の数値化の警告（決定的・保存は妨げない）
  const effectClaims = useMemo(() => detectEffectClaims(form), [form]);

  // ── 一覧の取得 ──
  const loadList = async (q = query, tag = tagFilter) => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (q.trim()) params.set('q', q.trim());
      if (tag) params.set('tag', tag);
      const res = await fetch(`/api/episodes?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: EpisodeRecord[]; total?: number; all_tags?: string[] };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
      setAllTags(Array.isArray(data.all_tags) ? data.all_tags : []);
      setListStatus('ready');
    } catch {
      setListStatus('failed');
    }
  };
  useEffect(() => {
    void loadList('', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 検索は少し待ってから（打鍵ごとに叩かない）
  const searchTimer = useRef<number | null>(null);
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void loadList(v, tagFilter), 350);
  };
  const onTagFilter = (tag: string) => {
    const next = tagFilter === tag ? '' : tag;
    setTagFilter(next);
    void loadList(query, next);
  };

  // ── R-20: 書きかけの復元（自動下書き）。フォームが空のときだけ ──
  const guardRef = useRef(false);
  guardRef.current = !isFormEmpty;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DraftPayload>(DRAFT_KEY);
      if (cancelled || !draft?.payload?.form || guardRef.current) return;
      setForm({ ...emptyEpisodeInput(), ...draft.payload.form, tags: normalizeEpisodeTags(draft.payload.form.tags) });
      setEditingId(typeof draft.payload.editingId === 'number' ? draft.payload.editingId : null);
      setRestoredAt(draft.updated_at);
    })();
    return () => { cancelled = true; };
  }, []);
  // 書きかけを自動保存（fire-and-forget・少し待ってから）
  const draftTimer = useRef<number | null>(null);
  const touchForm = (next: EpisodeInput, nextEditingId = editingId) => {
    setForm(next);
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      if (episodeCharCount(next) === 0 && next.tags.length === 0) return;
      saveFeatureDraft(DRAFT_KEY, { form: next, editingId: nextEditingId } satisfies DraftPayload);
    }, 800);
  };
  const setField = (key: EpisodeFieldDef['key'], value: string) => touchForm({ ...form, [key]: value });

  const addTag = () => {
    const tags = normalizeEpisodeTags([...form.tags, ...tagInput.split(/[,、\s]+/)]);
    setTagInput('');
    touchForm({ ...form, tags });
  };
  const removeTag = (t: string) => touchForm({ ...form, tags: form.tags.filter((v) => v !== t) });

  const resetForm = () => {
    setForm(emptyEpisodeInput());
    setEditingId(null);
    setTagInput('');
    setSaveError('');
    setRestoredAt(null);
    clearFeatureDraft(DRAFT_KEY);
  };

  // ── 保存（全項目任意・空でも保存できる・効果の数値化があっても保存できる）──
  const save = async () => {
    if (saveLockRef.current) return; // R-87
    saveLockRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const payload = { ...form, tags: normalizeEpisodeTags([...form.tags, ...tagInput.split(/[,、\s]+/)]) };
      const res = await fetch('/api/episodes', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      showToast(editingId ? '✅ 記録を更新しました' : '✅ 記録を保存しました', 'success');
      resetForm();
      await loadList();
    } catch (e) {
      // fail-closed: 失敗を成功に見せない。入力はそのまま残す（書き直しを強いない）
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const startEdit = (ep: EpisodeRecord) => {
    setEditingId(ep.id);
    touchForm({ title: ep.title, period: ep.period, situation: ep.situation, feelings: ep.feelings, details: ep.details, thoughts: ep.thoughts, reflection: ep.reflection, tags: [...ep.tags] }, ep.id);
    setSaveError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: number) => {
    try {
      const res = await fetch(`/api/episodes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
      showToast('🗑 記録を削除しました', 'success');
      await loadList();
    } catch {
      showToast('❌ 削除に失敗しました', 'warning');
    }
  };

  // ── 参考例（R-39: 失敗しても記録は書ける）──
  const runExamples = async () => {
    if (exLockRef.current) return; // R-87
    const t = theme.trim();
    if (!t || t.length > EXAMPLE_THEME_MAX) return;
    exLockRef.current = true;
    setExStatus('running');
    setExError('');
    try {
      const res = await fetch('/api/episodes/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `参考例の生成に失敗しました（${res.status}）`);
      setExamples(Array.isArray(data.items) ? data.items.map(String) : []);
      setExStatus('done');
    } catch (e) {
      setExamples(null);
      setExStatus('failed');
      setExError(e instanceof Error ? e.message : '失敗');
    } finally {
      exLockRef.current = false;
    }
  };

  // ── 274/R-81: カードのクリック展開（読む領域のみ・複数同時可）──
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const stopCardClick = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📔 エピソード記録</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        自分が過去に経験したことを、あとで note 記事や Kindle 本の「一次情報」として使えるように貯めておく場所です。
        医療・健康に限らず、受験・仕事・家族・趣味など何でも構いません。<strong>すべての欄は任意</strong>で、埋まっていなくても保存できます。<br />
        <strong style={{ color: '#f59e0b' }}>⚠️ 参考例は思い出すきっかけです。記録欄には、実際にあったことだけを自分の言葉で書いてください。</strong>
      </p>
      {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={resetForm} />}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* ── 参考例（思い出すきっかけ・記録ではない）── 視覚的に別枠: 破線・灰色・「表示のみ」 */}
        <div
          data-ep-examples-frame
          style={{ ...card, borderStyle: 'dashed', borderColor: EXAMPLE_ACCENT, background: 'var(--bg-primary)', marginBottom: 0, alignSelf: 'start' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>🧭 参考例（あるある）</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,0.2)', color: '#64748b' }}>表示のみ・記録ではありません</span>
          </div>
          {/* §2-2: 注意書きは常時表示（生成前も後も） */}
          <div data-ep-example-notice style={{ fontSize: 12, color: '#92400e', background: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.35)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.7 }}>
            {EXAMPLE_NOTICE}
          </div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            記録したいテーマ（例:「浪人時代」「手の痛み」）
            <input
              data-ep-theme
              value={theme}
              maxLength={EXAMPLE_THEME_MAX}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runExamples(); } }}
              placeholder="テーマを1つ"
              style={{ ...inputStyle, marginTop: 4, padding: '8px 10px' }}
            />
          </label>
          <button
            type="button"
            data-ep-examples-run
            onClick={() => void runExamples()}
            disabled={!theme.trim() || exStatus === 'running'}
            style={{ ...smallBtn, padding: '8px 14px', fontSize: 13, fontWeight: 700, opacity: !theme.trim() || exStatus === 'running' ? 0.5 : 1 }}
          >
            {exStatus === 'running' ? '⏳ 考え中…' : exStatus === 'done' ? '🔁 別の問いかけを出す' : '🧭 ありがちな場面を問いかけてもらう'}
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{EXAMPLE_COUNT_MIN}〜{EXAMPLE_COUNT_MAX}件・問いかけの形で出ます。コピーや挿入のボタンはありません。</div>

          {exStatus === 'failed' && (
            <div data-ep-examples-error style={{ fontSize: 12, color: '#ef4444', marginTop: 10, lineHeight: 1.7 }}>
              ⚠️ 参考例を出せませんでした（{exError}）。参考例が無くても、右の記録欄はそのまま書けます。
            </div>
          )}
          {exStatus === 'done' && examples && (
            <ul data-ep-examples style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {examples.map((q, i) => (
                // 参考例の1件。テキストだけ＝ボタン・リンク・入力欄を置かない（R-90）
                <li key={i} data-ep-example style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, padding: '6px 10px', borderLeft: `3px solid ${EXAMPLE_ACCENT}`, background: 'var(--bg-secondary)', borderRadius: 4 }}>
                  {q}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── 記録（自分で書く）── 視覚的に別枠: 実線・アクセント色 */}
        <div data-ep-record-frame className="lg:col-span-2" style={{ ...card, border: `2px solid ${ACCENT}`, marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>✍️ 記録（自分で書く）</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${ACCENT}22`, color: ACCENT }}>実際にあったことだけ</span>
            {editingId && <span data-ep-editing style={{ fontSize: 11, color: 'var(--text-muted)' }}>編集中: #{editingId}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{episodeCharCount(form).toLocaleString()}字</span>
            {(!isFormEmpty || editingId) && (
              <button type="button" data-ep-reset onClick={resetForm} style={smallBtn}>{editingId ? '編集をやめる' : '入力を空にする'}</button>
            )}
          </div>

          {EPISODE_FIELDS.map((def) => (
            <EpisodeTextField key={def.key} def={def} value={form[def.key]} onChange={(v) => setField(def.key, v)} notify={notify} />
          ))}

          {/* タグ（自由入力） */}
          <div data-ep-field-row="tags" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>タグ</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>健康・受験・仕事・家族 など自由に・任意（最大{EPISODE_TAG_MAX}件）</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {form.tags.map((t) => (
                <span key={t} data-ep-tag={t} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: `${ACCENT}18`, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  #{t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`タグ ${t} を外す`} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 12 }}>✕</button>
                </span>
              ))}
              <input
                data-ep-tag-input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                onBlur={() => { if (tagInput.trim()) addTag(); }}
                placeholder="タグを入力して Enter"
                style={{ ...inputStyle, width: 200, padding: '6px 10px' }}
              />
              {allTags.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  既存: {allTags.filter((t) => !form.tags.includes(t)).slice(0, 12).map((t) => (
                    <button key={t} type="button" data-ep-tag-suggest={t} onClick={() => touchForm({ ...form, tags: normalizeEpisodeTags([...form.tags, t]) })} style={{ ...smallBtn, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>#{t}</button>
                  ))}
                </span>
              )}
            </div>
          </div>

          {/* §3: 効果の数値化の警告（保存は妨げない・行動の数字は対象外） */}
          {effectClaims.length > 0 && (
            <div data-ep-effect-warn style={{ fontSize: 12, color: '#92400e', background: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.35)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, lineHeight: 1.7 }}>
              ⚠️ {EFFECT_CLAIM_NOTICE}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {effectClaims.map((c, i) => (
                  <li key={i} data-ep-effect-claim>「{c.sentence}」（{c.quantity}／{c.effectWord}）</li>
                ))}
              </ul>
            </div>
          )}

          {saveError && <div data-ep-save-error style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>⚠️ {saveError}（入力はそのまま残しています。もう一度お試しください）</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-ep-save
              onClick={() => void save()}
              disabled={saving}
              style={{ padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? '保存中…' : editingId ? '💾 記録を更新する' : '💾 記録を保存する'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>空の欄があっても保存できます。数字（1日10時間・毎朝5時 など）はそのまま書いて構いません。</span>
          </div>
        </div>
      </div>

      {/* ── 一覧 ── */}
      <div style={{ ...card, marginTop: 20 }} data-ep-list>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📚 記録の一覧</span>
          <span data-ep-total style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total}件</span>
          <span style={{ flex: 1 }} />
          <input
            data-ep-search
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="🔍 全文検索"
            style={{ ...inputStyle, width: 240, padding: '6px 10px' }}
          />
        </div>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>タグで絞り込み:</span>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                data-ep-tag-filter={t}
                aria-pressed={tagFilter === t}
                onClick={() => onTagFilter(t)}
                style={{ ...smallBtn, fontWeight: tagFilter === t ? 700 : 400, borderColor: tagFilter === t ? ACCENT : 'var(--border)', background: tagFilter === t ? `${ACCENT}12` : 'transparent', color: tagFilter === t ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {listStatus === 'loading' && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>読み込み中…</div>}
        {listStatus === 'failed' && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ 一覧を取得できませんでした。記録の入力・保存はできます。</div>}
        {listStatus === 'ready' && items.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{query || tagFilter ? '該当する記録がありません。' : 'まだ記録がありません。上の記録欄から書き始めてください。'}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((ep) => {
            const expanded = expandedIds.has(ep.id);
            return (
              <div key={ep.id} data-ep-card={ep.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-primary)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {/* 274/R-81: 読む領域だけがクリック展開の当たり判定 */}
                  <div
                    className="card-expand-zone"
                    data-ep-expand-zone={ep.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    title={expanded ? 'クリックで閉じる' : 'クリックで開く'}
                    onClick={() => toggleExpand(ep.id)}
                    onKeyDown={(e) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); toggleExpand(ep.id); }}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{expanded ? '▾' : '▸'} {episodeDisplayTitle(ep)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ep.period && <span>🕰 {ep.period}</span>}
                      <span>{jstShortDate(ep.created_at)}</span>
                      <span>{episodeCharCount(ep).toLocaleString()}字</span>
                      {ep.tags.map((t) => <span key={t}>#{t}</span>)}
                    </div>
                  </div>
                  {/* 操作は展開へ伝えない（二重の守り） */}
                  <div onClick={stopCardClick} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" data-ep-edit={ep.id} onClick={() => startEdit(ep)} style={smallBtn}>✏️ 編集</button>
                    {confirmDeleteId === ep.id ? (
                      <>
                        <button type="button" data-ep-delete-confirm={ep.id} onClick={() => void remove(ep.id)} style={{ ...smallBtn, color: '#ef4444', borderColor: '#ef4444' }}>削除する（戻せません）</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} style={smallBtn}>やめる</button>
                      </>
                    ) : (
                      <button type="button" data-ep-delete={ep.id} onClick={() => setConfirmDeleteId(ep.id)} style={smallBtn}>🗑</button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div data-ep-expanded-body={ep.id} onClick={stopCardClick} style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8 }}>
                    {EPISODE_FIELDS.filter((f) => f.key !== 'title' && (ep[f.key] ?? '').trim()).map((f) => (
                      <div key={f.key} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{f.label}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{ep[f.key]}</div>
                      </div>
                    ))}
                    {episodeCharCount(ep) === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>（本文は空です）</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
