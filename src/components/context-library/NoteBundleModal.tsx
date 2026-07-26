'use client';

// 179: 🧠AI参照素材の複数選択 → 記事プラン提案（パス1・編集可）→ note記事群の生成（パス2・逐次/部分成功）
// - パス1: /api/note-bundle/plan にIDのみ送信（本文はサーバ側で取得＝175の本文非返却を温存）
// - 人間確認型: プランを院長が編集（本数・タイトル・要点・資料割り当て・文体）してから生成へ
// - パス2: 1記事=1リクエストを逐次実行（キュー方式）。進捗N/M・部分失敗は該当記事のみエラー（成功分は使える）
// - 文体プリセットは lib/note-styles.ts に一元管理。各記事に文体バッジ＋「🔁別文体で再生成」

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { getSavedModel, getModelIcon, getModelLabel } from '@/lib/model-preference';
import {
  DEFAULT_NOTE_STYLE,
  NOTE_STYLES,
  NOTE_STYLE_KEYS,
  getNoteStyle,
  type NoteStyleKey,
} from '@/lib/note-styles';

interface Material {
  id: number;
  topic: string;
}

// パス1で編集する記事プラン（points はtextarea編集しやすいよう改行区切りの文字列で保持）
interface PlanDraft {
  localId: number;
  title: string;
  sources: number[];
  pointsText: string;
  style: NoteStyleKey;
}

interface ArticleResult {
  localId: number;
  title: string;
  style: NoteStyleKey;
  sourceIds: number[];
  points: string[];
  status: 'pending' | 'running' | 'done' | 'error';
  content: string;
  adCheck: { status: 'ok' | 'warn'; findings: string[] } | null;
  error: string;
}

type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '📄 短め（1500〜2500字）' },
  { value: 'medium', label: '📑 標準（3000〜4500字）' },
  { value: 'long', label: '📚 長め（5000〜7000字）' },
];

// 既存 note記事生成の「下書き」注意文と同一文言（緩和しない）
const DRAFT_NOTICE = '⚠️ これは下書きです。あなたの独自の経験・視点を加えて編集してから投稿してください';

let localIdSeq = 1;

export default function NoteBundleModal({
  open,
  onClose,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  selected: Material[];
}) {
  // フェーズ: plan（提案取得〜編集）→ generate（逐次生成・結果一覧）
  const [phase, setPhase] = useState<'plan' | 'generate'>('plan');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [length, setLength] = useState<Length>('medium');
  const [results, setResults] = useState<ArticleResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // 展開表示中の結果カード（既定は抜粋表示）
  const [expandedResult, setExpandedResult] = useState<Record<number, boolean>>({});
  // 逐次生成のキュー（生成中に「🔁別文体」で追加されても取りこぼさない）
  const queueRef = useRef<ArticleResult[]>([]);
  const runningRef = useRef(false);
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
    setResults([]);
    setGenerating(false);
    setPlanError('');
    setExpandedResult({});
    setModel(getSavedModel());
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── パス1: プラン提案の取得 ──
  const fetchPlan = async () => {
    setPlanLoading(true);
    setPlanError('');
    try {
      const res = await fetch('/api/note-bundle/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected.map((s) => s.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `プラン提案に失敗しました（HTTP ${res.status}）`);
      const mats: Material[] = Array.isArray(data.materials) ? data.materials : selected;
      setMaterials(mats);
      setDrafts(
        (data.articles as Array<{ title: string; sources: number[]; points: string[]; style: NoteStyleKey }>).map(
          (a) => ({
            localId: localIdSeq++,
            title: a.title,
            sources: a.sources,
            pointsText: (a.points || []).join('\n'),
            style: getNoteStyle(a.style).key,
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

  const toggleSource = (localId: number, id: number) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.localId !== localId) return d;
        const has = d.sources.includes(id);
        return { ...d, sources: has ? d.sources.filter((s) => s !== id) : [...d.sources, id] };
      }),
    );
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        localId: localIdSeq++,
        title: '',
        sources: materials.map((m) => m.id),
        pointsText: '',
        style: DEFAULT_NOTE_STYLE,
      },
    ]);
  };

  const removeDraft = (localId: number) => {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  };

  const patchResult = (localId: number, patch: Partial<ArticleResult>) => {
    setResults((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  };

  // ── パス2: 1記事分の生成リクエスト ──
  const generateOne = async (r: ArticleResult): Promise<Partial<ArticleResult>> => {
    try {
      const res = await fetch('/api/note-bundle/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: r.title,
          points: r.points,
          sourceIds: r.sourceIds,
          style: r.style,
          length: lengthRef.current,
          model: modelRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `生成に失敗しました（HTTP ${res.status}）`);
      return { status: 'done', content: data.content ?? '', adCheck: data.ad_check ?? null, error: '' };
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) };
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
    const queue: ArticleResult[] = valid.map((d) => ({
      localId: d.localId,
      title: d.title,
      style: d.style,
      sourceIds: d.sources,
      points: d.points,
      status: 'pending',
      content: '',
      adCheck: null,
      error: '',
    }));
    setResults(queue);
    setPhase('generate');
    enqueue(queue);
  };

  // 「🔁 別文体で再生成」= 同じ資料・要点のまま文体だけ変えて新カードを追加（元の記事は残す）
  const regenerateWithStyle = (src: ArticleResult, style: NoteStyleKey) => {
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

  // 失敗カードの再試行
  const retryOne = (r: ArticleResult) => {
    patchResult(r.localId, { status: 'pending', error: '' });
    enqueue([{ ...r, status: 'pending', error: '' }]);
  };

  const handleClose = () => {
    cancelledRef.current = true;
    queueRef.current = [];
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
  const finishedCount = doneCount + errorCount;

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
          資料 {selected.length} 件 → AIが記事プランを提案 → 確認・編集してから各記事を生成します（使用モデル: {getModelIcon(model)} {getModelLabel(model)}）
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
                        const on = d.sources.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleSource(d.localId, m.id)}
                            style={{
                              padding: '4px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                              border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: on ? 'rgba(108,99,255,0.12)' : 'var(--bg-primary)',
                              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontWeight: on ? 600 : 400,
                            }}
                            title={m.topic}
                          >
                            {on ? '☑' : '☐'} {m.topic.slice(0, 24)}{m.topic.length > 24 ? '…' : ''}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文体:</span>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {generating
                  ? `✍️ 生成中... ${Math.min(finishedCount + 1, results.length)}/${results.length}`
                  : `✅ 完了 ${doneCount}/${results.length}${errorCount > 0 ? `（失敗 ${errorCount}件）` : ''}`}
              </span>
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
                    資料{r.sourceIds.length}件
                    {r.status === 'done' && ` ・ ${r.content.length.toLocaleString()}字`}
                  </span>
                </div>

                {r.status === 'pending' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>⏳ 待機中...</div>
                )}
                {r.status === 'running' && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', padding: '8px 0' }}>✍️ 執筆中...（30〜120秒）</div>
                )}
                {r.status === 'error' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    ⚠️ この記事の生成に失敗しました: {r.error}
                    <button type="button" onClick={() => retryOne(r)} style={smallBtn()}>🔄 再試行</button>
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
                      <button type="button" onClick={() => setExpandedResult((p) => ({ ...p, [r.localId]: !p[r.localId] }))} style={smallBtn()}>
                        {expandedResult[r.localId] ? '▲ 折りたたむ' : '▼ 全文表示'}
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
                          sourceIds: r.sourceIds,
                          length,
                          from: 'note-bundle',
                        }}
                      />
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
      </div>
    </div>
  );
}
