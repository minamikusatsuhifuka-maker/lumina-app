'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 312: 🐦 マンダラ → X投稿（発信ハブ③の中に置く受け取り側）
//
// - 入口: /dashboard/dr-hub?mandala=<chartId>&cell=<cellId>&to=x（マス→投稿群）／&mode=series&to=x（チャート→シリーズ）
// - プレビュー: GET /api/mandala/[id]/x（純関数の出力）。生成: 既存の POST /api/dr-hub/x-post に mandala をオプトインで渡す
//   （素材の本文はサーバが同じ純関数で組む＝プレビューと投入が同じ関数・R-74）。シリーズは 1マス＝1投稿を1件ずつ呼ぶ
// - 二段目のガード（コード側）: 本文の URL は生成側で moveUrlsToReply → セルフリプライ欄へ。保存側でも URL・上限を検査（400）
// - 生成後は元のマス（気づき）と投稿を並べて目視確認（309 と同じ形）。保存は既存の /api/dr-hub/x-post/save（metadata.mandala）
// - シリーズの候補日: 266 の buildScheduleRows（1日1本・平日）をそのまま使い、scheduleToMarkdown でコピー（カレンダー本体は改修しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AI_ORIGIN_NOTICE } from '@/lib/mandala-generate';
import { MarkdownBody } from '@/components/MarkdownBody';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { buildScheduleRows, formatDateLocal, scheduleToMarkdown } from '@/lib/posting-schedule';
import { hasUrl, X_HARD_LIMIT, type XPostWarning } from '@/lib/x-post-rules';
import { MANDALA_X_COUNT_MAX, MANDALA_X_COUNT_MIN, mandalaXOriginLabel, moveUrlsToReply, type MandalaXMode, type MandalaXResult, type MandalaXSource } from '@/lib/mandala-x';

const ACCENT = '#e0684b';
const btn: CSSProperties = { padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' };

export interface MandalaXEntry {
  chartId: string;
  mode: MandalaXMode;
  cellId: string | null;
  count: number;
}

interface GeneratedPost {
  index: number;
  cellId: string;
  label: string;
  title: string;
  memo: string;
  /** cell モード: thread の各ポスト（本数分）、series: single */
  bodies: string[];
  replyUrls: string[];
  urlReplyLeadin: string;
  warnings: Record<string, XPostWarning[]>;
  saved: Record<number, { saving: boolean; savedId: string; error: string }>;
}

export default function MandalaXBlock({
  entry,
  xLength,
  postType,
  onClear,
}: {
  entry: MandalaXEntry;
  xLength: 'short' | 'mini' | 'long';
  postType: string;
  onClear: () => void;
}) {
  const [count, setCount] = useState(entry.count);
  const [preview, setPreview] = useState<{ result: MandalaXResult; sourceChars: number; aiOrigin?: boolean } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // R-87
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [progress, setProgress] = useState('');
  const [source, setSource] = useState<MandalaXSource | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [schedStart, setSchedStart] = useState(() => formatDateLocal(new Date()));

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setPreviewError('');
    fetch(`/api/mandala/${encodeURIComponent(entry.chartId)}/x?mode=${entry.mode}${entry.cellId ? `&cell=${encodeURIComponent(entry.cellId)}` : ''}&count=${count}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || !data?.result) {
          setPreviewError(data?.error || `マンダラの読み込みに失敗しました（${r.status}）`);
          return;
        }
        setPreview({ result: data.result as MandalaXResult, sourceChars: Number(data.sourceChars ?? 0), aiOrigin: data.aiOrigin === true });
      })
      .catch((e: unknown) => {
        if (alive) setPreviewError(e instanceof Error ? e.message : 'マンダラの読み込みに失敗しました');
      });
    return () => {
      alive = false;
    };
  }, [entry.chartId, entry.mode, entry.cellId, count]);

  const copy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const generate = async () => {
    if (busyRef.current || !preview || !preview.result.ok) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setPosts([]);
    try {
      const res = preview.result;
      const total = res.mode === 'series' ? res.posts.length : 1;
      const out: GeneratedPost[] = [];
      for (let i = 0; i < total; i++) {
        setProgress(res.mode === 'series' ? `シリーズ ${i + 1}/${total} 本目を生成中…` : `${count}本の投稿を生成中…`);
        const r = await fetch('/api/dr-hub/x-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mandala: { chartId: entry.chartId, mode: entry.mode, cellId: entry.cellId ?? undefined, count, index: i },
            threadCount: Math.max(2, count),
            xLength,
            postType,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `X投稿の生成に失敗しました（${r.status}）`);
        const src = res.mode === 'cell' ? res.post : res.posts[i];
        const thread: string[] = Array.isArray(data.thread) ? data.thread : [];
        // cell: 本数分の投稿群（thread の各ポスト。1本なら single）。series: single が1マス1投稿
        const bodies = res.mode === 'cell' ? (count === 1 ? [String(data.single ?? '')] : thread.slice(0, count)) : [String(data.single ?? '')];
        // 二段目（コード側・冪等）: 画面側でも URL を本文からリプライ欄へ
        const replyUrls = new Set<string>([...(Array.isArray(data.replyUrls) ? data.replyUrls : []), ...src.replyUrls]);
        const cleaned = bodies.map((b) => {
          const m = moveUrlsToReply(b);
          for (const u of m.urls) replyUrls.add(u);
          return m.body;
        });
        out.push({
          index: i,
          cellId: src.cellId,
          label: src.label,
          title: src.title,
          memo: src.memo,
          bodies: cleaned,
          replyUrls: [...replyUrls],
          urlReplyLeadin: String(data.urlReplyLeadin ?? ''),
          warnings: (data.warnings ?? {}) as Record<string, XPostWarning[]>,
          saved: {},
        });
        setPosts([...out]);
        if (data.mandala) setSource(data.mandala as MandalaXSource);
      }
      setProgress('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'X投稿の生成に失敗しました');
      setProgress('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const replySection = (p: GeneratedPost) =>
    `\n\n---\n\n[1つ目のリプライ（URL用）]\n${p.urlReplyLeadin || '関連リンクはこちらです'}${p.replyUrls.length > 0 ? `\n${p.replyUrls.map((u) => `👉 ${u}`).join('\n')}` : '\n👉 （URLがあればここに）'}`;

  const save = async (p: GeneratedPost, bi: number) => {
    const body = p.bodies[bi] ?? '';
    const setSaved = (v: { saving: boolean; savedId: string; error: string }) => setPosts((prev) => prev.map((q) => (q.index === p.index ? { ...q, saved: { ...q.saved, [bi]: v } } : q)));
    if (hasUrl(body)) {
      setSaved({ saving: false, savedId: '', error: '本文に URL が残っています。リプライ欄へ移してください' });
      return;
    }
    if (body.length > X_HARD_LIMIT) {
      setSaved({ saving: false, savedId: '', error: `本文が上限（${X_HARD_LIMIT.toLocaleString()}字）を超えています` });
      return;
    }
    setSaved({ saving: true, savedId: '', error: '' });
    try {
      const res = await fetch('/api/dr-hub/x-post/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: body + replySection(p),
          mode: 'single',
          title: `X投稿: ${p.title}${entry.mode === 'cell' && p.bodies.length > 1 ? `（${bi + 1}/${p.bodies.length}）` : entry.mode === 'series' ? `（シリーズ ${p.index + 1}）` : ''}`,
          mandala: { ...(source ?? { source: 'mandala', chartId: entry.chartId, mode: entry.mode, cellId: entry.cellId, cellIds: [p.cellId], chartTitle: '', cellLabel: p.label, cellTitle: p.title, count }), cellId: p.cellId, index: entry.mode === 'series' ? p.index : bi },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setSaved({ saving: false, savedId: data.id ?? 'saved', error: '' });
    } catch (e: unknown) {
      setSaved({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' });
    }
  };

  const res = preview?.result ?? null;
  const schedRows = res && res.ok && res.mode === 'series' ? buildScheduleRows(res.posts.map((p) => ({ id: p.cellId, title: p.title })), schedStart) : [];

  return (
    <div data-hub-mandala-x data-hub-mandala-x-mode={entry.mode} data-hub-mandala-x-ok={res?.ok ? '1' : '0'} style={{ padding: 12, borderRadius: 10, border: '1px solid #6c63ff', background: 'rgba(108,99,255,0.08)', marginBottom: 12, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span data-hub-mandala-x-label style={{ fontWeight: 700 }}>
          🔲 {res?.ok ? `${mandalaXOriginLabel({ ...res.source })}${entry.mode === 'series' ? '（1マス＝1投稿）' : `（投稿群 ${count}本）`}` : previewError ? 'マンダラの素材を読み込めませんでした' : 'マンダラの素材を読み込み中…'}
        </span>
        <a data-hub-mandala-x-back href={`/dashboard/mandala/${entry.chartId}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6c63ff', textDecoration: 'none', fontWeight: 600 }}>チャートを開く ↗</a>
        <span style={{ flex: 1 }} />
        <button type="button" data-hub-mandala-x-clear onClick={onClear} disabled={busy} style={{ ...btn, fontSize: 11, padding: '4px 10px' }}>✕ 記事から選び直す</button>
      </div>
      {/* 316 §3-5: origin='ai' のマスを含むとき、読み込み直後から「体験ではありません」を出す（並べて表示にも同じ1文） */}
      {preview?.aiOrigin && <div data-hub-mandala-ai-origin style={{ color: '#B45309', marginTop: 4, fontSize: 12, fontWeight: 700 }}>🤖 {AI_ORIGIN_NOTICE}</div>}
      {previewError && <div data-hub-mandala-x-error style={{ color: '#B91C1C', marginTop: 4 }}>⚠️ {previewError}</div>}
      {res && !res.ok && <div data-hub-mandala-x-reject style={{ color: '#B91C1C', marginTop: 4 }}>起こせません: {res.reason}</div>}
      {res?.ok && (
        <div data-hub-mandala-x-counts style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text-secondary)', marginTop: 4, fontSize: 11, alignItems: 'center' }}>
          {res.mode === 'cell' ? (
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              本数
              <select data-hub-mandala-x-count value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy} style={{ ...btn, padding: '2px 6px' }}>
                {Array.from({ length: MANDALA_X_COUNT_MAX - MANDALA_X_COUNT_MIN + 1 }, (_, i) => i + MANDALA_X_COUNT_MIN).map((n) => <option key={n} value={n}>{n}本</option>)}
              </select>
            </label>
          ) : (
            <span data-hub-mandala-x-posts={res.posts.length}>投稿 {res.posts.length}本（周囲マス・目次順・子マスは含めない）</span>
          )}
          <span>気づき {preview!.sourceChars.toLocaleString()}字</span>
          <span data-hub-mandala-x-materials={res.counts.materials}>素材 {res.counts.materials}件</span>
          <span data-hub-mandala-x-experiences={res.counts.experiences}>📔 体験メモ {res.counts.experiences}件</span>
          {res.counts.excludedEmpty > 0 && <span data-hub-mandala-x-excluded={res.counts.excludedEmpty}>空のため除外 {res.counts.excludedEmpty}件</span>}
          {res.counts.missingLinks > 0 && <span style={{ color: '#B45309' }}>リンク先なし {res.counts.missingLinks}件</span>}
          {res.mode === 'cell' && res.post.replyUrls.length > 0 && <span data-hub-mandala-x-replyurls={res.post.replyUrls.length}>セルフリプライ候補URL {res.post.replyUrls.length}件</span>}
          <span style={{ flex: 1 }} />
          <button type="button" data-hub-mandala-x-generate onClick={() => void generate()} disabled={busy} style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff', opacity: busy ? 0.6 : 1 }}>
            {busy ? `⏳ ${progress || '生成中…'}` : res.mode === 'series' ? `🐦 シリーズ ${res.posts.length}本を生成する` : `🐦 ${count}本の投稿を生成する`}
          </button>
        </div>
      )}
      {error && <div data-hub-mandala-x-gen-error style={{ color: '#B91C1C', marginTop: 6 }}>⚠️ {error}</div>}

      {posts.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div data-hub-mandala-x-review style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>
            👀 公開前に必ず: 気づき（マス）と投稿を並べて、気づきにない体験・実績・数字が足されていないか確認してください。URL は本文に置かず、1つ目のリプライに貼ります
            {preview?.aiOrigin && <div data-hub-mandala-ai-origin-compare style={{ marginTop: 4 }}>🤖 {AI_ORIGIN_NOTICE}</div>}
          </div>
          {posts.map((p) => (
            <div key={p.index} data-hub-mandala-x-post={p.cellId} data-hub-mandala-x-index={p.index} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                {entry.mode === 'series' ? `${p.index + 1}本目 ` : ''}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)', marginRight: 6 }}>{p.label}</span>
                {p.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                <div data-hub-mandala-x-compare-source style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>🔲 気づき（マスの本文そのまま）</div>
                  <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)' }}>
                    {p.memo.trim() ? <MarkdownBody text={p.memo} style={{ fontSize: 12, lineHeight: 1.7 }} /> : <span style={{ color: 'var(--text-muted)' }}>（本文なし・タイトルのみ）</span>}
                  </div>
                </div>
                <div data-hub-mandala-x-compare-posts style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.bodies.map((b, bi) => {
                    const st = p.saved[bi];
                    const ws = p.warnings[bi === 0 && entry.mode === 'series' ? 'single' : `thread-${bi}`] ?? [];
                    return (
                      <div key={bi} data-hub-mandala-x-body={bi} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--bg-primary)' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>🐦 投稿{p.bodies.length > 1 ? ` ${bi + 1}/${p.bodies.length}` : ''}</span>
                          <span data-hub-mandala-x-urlfree={hasUrl(b) ? '0' : '1'} style={{ fontSize: 10, color: hasUrl(b) ? '#B91C1C' : '#1D9E75' }}>{hasUrl(b) ? 'URLあり' : 'URLなし'}</span>
                          <span style={{ fontSize: 10, color: b.length > X_HARD_LIMIT ? '#B91C1C' : 'var(--text-muted)' }}>{b.length.toLocaleString()}字</span>
                          <span style={{ flex: 1 }} />
                          <button type="button" data-hub-mandala-x-copy onClick={() => copy(b, `b-${p.index}-${bi}`)} style={{ ...btn, padding: '2px 8px', fontSize: 11 }}>{copied === `b-${p.index}-${bi}` ? '✅' : '📋 コピー'}</button>
                          <button type="button" data-hub-mandala-x-save onClick={() => void save(p, bi)} disabled={!!st?.saving || !!st?.savedId} style={{ ...btn, padding: '2px 8px', fontSize: 11, borderColor: ACCENT, color: st?.savedId ? '#1D9E75' : ACCENT }}>
                            {st?.saving ? '保存中…' : st?.savedId ? '✅ 保存済み' : '💾 保存'}
                          </button>
                        </div>
                        {ws.length > 0 && (
                          <div style={{ fontSize: 10, color: '#B45309', marginBottom: 4 }}>{ws.map((w, j) => <div key={j}>⚠️ {w.message}</div>)}</div>
                        )}
                        {st?.error && <div data-hub-mandala-x-save-error style={{ fontSize: 11, color: '#B91C1C', marginBottom: 4 }}>⚠️ {st.error}</div>}
                        <MarkdownBody text={b} style={{ fontSize: 13, lineHeight: 1.8 }} />
                      </div>
                    );
                  })}
                  <div data-hub-mandala-x-reply style={{ fontSize: 11, color: 'var(--text-secondary)', padding: 8, border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>💬 1つ目のリプライ（セルフリプライ・URL用）</div>
                    <div>{p.urlReplyLeadin || '関連リンクはこちらです'}</div>
                    {p.replyUrls.length > 0 ? p.replyUrls.map((u) => <div key={u} data-hub-mandala-x-reply-url>👉 {u}</div>) : <div style={{ color: 'var(--text-muted)' }}>👉 （URLがあればここに。本文には置かない）</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {entry.mode === 'series' && schedRows.length > 0 && (
            <div data-hub-mandala-x-schedule style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>🗓 候補日（1日1本・平日・X-05）</span>
                <input type="date" data-hub-mandala-x-sched-start value={schedStart} onChange={(e) => setSchedStart(e.target.value)} style={{ ...btn, padding: '2px 6px' }} />
                <span style={{ flex: 1 }} />
                <button type="button" data-hub-mandala-x-sched-copy onClick={() => void copyRichMarkdown(scheduleToMarkdown(schedRows)).then(() => { setCopied('sched'); setTimeout(() => setCopied(null), 2000); })} style={{ ...btn, padding: '2px 8px', fontSize: 11 }}>{copied === 'sched' ? '✅' : '📋 表をコピー'}</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>予約投稿カレンダー（🗓タブ）は note 記事用のため、X のシリーズは候補日の表として渡します。予約の実行は X 側で行います（自動投稿はしません）</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead><tr>{['日付', '曜日', '投稿', 'X時間帯の目安'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {schedRows.map((r, i) => (
                      <tr key={r.id} data-hub-mandala-x-sched-row={i}><td style={{ padding: '4px 6px' }}>{r.date}</td><td style={{ padding: '4px 6px' }}>{r.weekday}</td><td style={{ padding: '4px 6px' }}>{i + 1}. {r.title}</td><td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{r.xHint}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
