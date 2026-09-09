'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 311: 🔍 マスからのリサーチ／分析の発注（1件／まとめ）
//
// - 発注文は lib/mandala-research.ts の純関数の出力が既定（決定的・R-74）。送る前に院長が直せる（1件ずつ）
// - 経路: 🔭ディープリサーチ＝**既存のバッチ経路**（POST /api/batch-research → POST /api/batch-research/[id]/run の SSE を
//   この画面で読み切る＝⚡タブと同じブラウザ主導）。1マス＝1トピック。付帯情報 mandala はトピック行にオプトインで載る
//   （発注の印はサーバが付ける・完了時の紐づけはサーバ側の run ルート）
//   📝テキスト分析＝本文があるマスだけ。発注の印（PATCH research）を付けてから、既存の handoff（sessionStorage）で
//   テキスト分析画面を新しいタブで開く。保存時に保存APIがマスへ紐づける
// - まとめて発注は DR 固定・上限 8 件（R-101）。チェックで外せる。二重発火は ref（R-87）
// - 費用の目安は既存に無いので出さない（推定値を捏造しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  MANDALA_RESEARCH_BULK_MAX,
  MANDALA_RESEARCH_DR_MODES,
  MANDALA_RESEARCH_DR_MODE_DEFAULT,
  MANDALA_RESEARCH_KIND_LABELS,
  MANDALA_RESEARCH_KINDS,
  bulkOrderState,
  researchBatchGroupName,
  researchOrderToBatchTopic,
  researchOrderToTextAnalysisHandoff,
  type MandalaResearchDrMode,
  type MandalaResearchKind,
  type MandalaResearchOrder,
  type MandalaResearchOrderResult,
} from '@/lib/mandala-research';

const ACCENT = '#6c63ff';
const Z = 10500;
const btn: CSSProperties = { padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' };
const primaryBtn: CSSProperties = { ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff' };

export const MANDALA_RESEARCH_HANDOFF_KEYS = { text: 'textAnalysisInput', topic: 'textAnalysisTopic', mandala: 'textAnalysisMandala' } as const;

const DR_MODE_LABELS: Record<MandalaResearchDrMode, string> = { quick: '短め（1500字）', standard: '標準（3000字）', deep: '詳しく（5000字）' };

type Progress = { index: number; status: 'pending' | 'running' | 'done' | 'error' | 'linked' | 'link_failed'; message?: string };

export default function MandalaResearchDialog({
  theme,
  orders,
  bulk,
  bodyByCell,
  onClose,
  onDone,
}: {
  theme: string;
  /** 純関数の出力（1件＝単発、複数＝まとめ）。ok:false は理由つきで一覧に出す（発注対象外） */
  orders: MandalaResearchOrderResult[];
  bulk: boolean;
  /** 経路の選択肢の判定用（テキスト分析は本文があるマスだけ） */
  bodyByCell: ReadonlyMap<string, string>;
  onClose: () => void;
  /** 発注が完了（DR: ジョブ完了／分析: 画面を開いた）したら親がチャートを再取得する */
  onDone: (result: { kind: MandalaResearchKind; ordered: number; failed: number; linked: number }) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const single = !bulk && orders.length === 1 && orders[0].ok ? (orders[0] as MandalaResearchOrder) : null;
  const [kind, setKind] = useState<MandalaResearchKind>('deepresearch');
  const [mode, setMode] = useState<MandalaResearchDrMode>(MANDALA_RESEARCH_DR_MODE_DEFAULT);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(() => new Set(orders.filter((o): o is MandalaResearchOrder => o.ok).map((o) => o.cellId)));
  const [openText, setOpenText] = useState<string | null>(single?.cellId ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // R-87
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Record<number, Progress>>({});
  const [summary, setSummary] = useState<{ done: number; failed: number; linked: number; total: number } | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const okOrders = orders.filter((o): o is MandalaResearchOrder => o.ok);
  const selected = okOrders.filter((o) => checked.has(o.cellId));
  // 311是正: 単発で発注文が組めなかった（未記入・テーマ無し等）ときは、その理由をそのまま出す
  const firstReject = orders.find((o): o is { ok: false; cellId: string; reason: string } => !o.ok) ?? null;
  const bulkState = bulk ? bulkOrderState(selected.length) : { enabled: selected.length === 1, reason: selected.length === 1 ? null : firstReject?.reason ?? '発注するマスがありません' };
  const singleHasBody = single ? (bodyByCell.get(single.cellId) ?? '').trim().length > 0 : false;
  const textOf = (o: MandalaResearchOrder) => texts[o.cellId] ?? o.text;

  const runDeepResearch = async () => {
    const topics = selected.map((o) => researchOrderToBatchTopic(o, mode, textOf(o)));
    const created = await fetch('/api/batch-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: researchBatchGroupName(theme, topics.length), topics, scheduleType: 'browser', autoSave: true }),
    });
    const createdJson = (await created.json().catch(() => ({}))) as { job?: { id: number }; error?: string; runningCellIds?: string[] };
    if (!created.ok || !createdJson.job?.id) throw new Error(createdJson.error || `発注に失敗しました（${created.status}）`);
    const jobId = createdJson.job.id;
    setProgress(Object.fromEntries(topics.map((_, i) => [i, { index: i, status: 'pending' as const }])));
    const res = await fetch(`/api/batch-research/${jobId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gemini' }) });
    if (!res.ok || !res.body) throw new Error(`実行に失敗しました（${res.status}）`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = 0;
    let failed = 0;
    let linked = 0;
    while (true) {
      const { done: end, value } = await reader.read();
      if (end) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev: { type?: string; index?: number; ok?: boolean; reason?: string; error?: string; message?: string };
        try {
          ev = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        const idx = typeof ev.index === 'number' ? ev.index : -1;
        if (ev.type === 'topic_start' && idx >= 0) setProgress((p) => ({ ...p, [idx]: { index: idx, status: 'running' } }));
        else if (ev.type === 'topic_done' && idx >= 0) { done += 1; setProgress((p) => ({ ...p, [idx]: { index: idx, status: 'done' } })); }
        else if (ev.type === 'topic_error' && idx >= 0) { failed += 1; setProgress((p) => ({ ...p, [idx]: { index: idx, status: 'error', message: ev.error } })); }
        else if (ev.type === 'mandala_linked' && idx >= 0) {
          if (ev.ok) linked += 1;
          setProgress((p) => ({ ...p, [idx]: { index: idx, status: ev.ok ? 'linked' : 'link_failed', message: ev.reason } }));
        } else if (ev.type === 'error') throw new Error(ev.message || '実行中にエラーが発生しました');
      }
    }
    setSummary({ done, failed, linked, total: topics.length });
    onDone({ kind: 'deepresearch', ordered: topics.length, failed, linked });
  };

  const runTextAnalysis = async () => {
    if (!single) return;
    // 発注の印（サーバが進行中を遮断・R-87）→ handoff → 新しいタブで分析画面
    const res = await fetch('/api/mandala/cells', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellId: single.cellId, research: { kind: 'text_analysis' } }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error || `発注に失敗しました（${res.status}）`);
    const handoff = researchOrderToTextAnalysisHandoff(single, textOf(single));
    try {
      sessionStorage.setItem(MANDALA_RESEARCH_HANDOFF_KEYS.text, handoff.text);
      sessionStorage.setItem(MANDALA_RESEARCH_HANDOFF_KEYS.topic, handoff.topic);
      sessionStorage.setItem(MANDALA_RESEARCH_HANDOFF_KEYS.mandala, JSON.stringify(handoff.mandala));
    } catch {
      throw new Error('この端末では引き継ぎ用の保存ができません（プライベートモード等）');
    }
    // sessionStorage の handoff は「同一オリジンで開いた補助ブラウジングコンテキスト」に複製される＝noopener を付けない（付けると複製されない）
    window.open('/dashboard/text-analysis?from=mandala', '_blank');
    setSummary({ done: 1, failed: 0, linked: 0, total: 1 });
    onDone({ kind: 'text_analysis', ordered: 1, failed: 0, linked: 0 });
  };

  const submit = async () => {
    if (busyRef.current || !bulkState.enabled) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (kind === 'text_analysis' && !bulk) await runTextAnalysis();
      else await runDeepResearch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '発注に失敗しました');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!mounted) return null;
  const title = bulk ? `🔍 未調査マスをまとめて発注（${selected.length}/${MANDALA_RESEARCH_BULK_MAX}件）` : single ? `🔍 リサーチを発注: ${single.label} ${single.title}` : '🔍 リサーチを発注';

  return createPortal(
    <div data-mandala-research-dialog data-mandala-research-bulk={bulk ? '1' : '0'} role="dialog" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: Z, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.35)' }} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0 }}>{title}</div>
          <button type="button" data-mandala-research-close onClick={onClose} disabled={busy} style={{ ...btn, padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          発注文は決定的に組み立てています（テーマ・このマス・隣接の文脈・経路の指示）。送る前に直せます。結果は完了時にこのマスへ自動で紐づきます（🔗）。費用の目安は出せません（既存の見積もりがないため）。
        </div>

        {/* 経路・モード */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!bulk && (
            <span role="group" aria-label="経路" style={{ display: 'inline-flex', gap: 4 }}>
              {MANDALA_RESEARCH_KINDS.map((k) => {
                const disabled = k === 'text_analysis' && !singleHasBody;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    data-mandala-research-kind={k}
                    aria-pressed={active}
                    disabled={disabled || busy}
                    title={disabled ? 'テキスト分析は本文があるマスだけ発注できます' : undefined}
                    onClick={() => setKind(k)}
                    style={{ ...btn, borderColor: active ? ACCENT : 'var(--border)', background: active ? `${ACCENT}15` : 'transparent', color: active ? ACCENT : 'var(--text-muted)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                  >
                    {MANDALA_RESEARCH_KIND_LABELS[k]}
                  </button>
                );
              })}
            </span>
          )}
          {bulk && <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{MANDALA_RESEARCH_KIND_LABELS.deepresearch}（まとめて発注は固定）</span>}
          {(bulk || kind === 'deepresearch') && (
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              分量
              <select data-mandala-research-mode value={mode} onChange={(e) => setMode(e.target.value as MandalaResearchDrMode)} disabled={busy} style={{ ...btn, padding: '4px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                {MANDALA_RESEARCH_DR_MODES.map((m) => <option key={m} value={m}>{DR_MODE_LABELS[m]}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* 対象と発注文 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orders.map((o, i) => {
            if (!o.ok) {
              return (
                <div key={o.cellId} data-mandala-research-row={o.cellId} data-mandala-research-row-ok="0" style={{ padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                  ⚠️ 発注できません: {o.reason}
                </div>
              );
            }
            const isOpen = openText === o.cellId;
            const pg = progress[selected.findIndex((s) => s.cellId === o.cellId)];
            return (
              <div key={o.cellId} data-mandala-research-row={o.cellId} data-mandala-research-row-ok="1" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {bulk && (
                    <input type="checkbox" data-mandala-research-check={o.cellId} checked={checked.has(o.cellId)} disabled={busy} onChange={(e) => setChecked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(o.cellId); else next.delete(o.cellId); return next; })} />
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{o.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
                  {pg && (
                    <span data-mandala-research-progress={pg.status} style={{ fontSize: 11, color: pg.status === 'error' || pg.status === 'link_failed' ? '#B91C1C' : pg.status === 'linked' ? '#1D9E75' : 'var(--text-muted)' }}>
                      {pg.status === 'pending' ? '待機' : pg.status === 'running' ? '調査中…' : pg.status === 'done' ? '保存済み' : pg.status === 'linked' ? '🔗 紐づけ済み' : pg.status === 'link_failed' ? `⚠️ 紐づけ失敗: ${pg.message ?? ''}` : `❌ ${pg.message ?? '失敗'}`}
                    </span>
                  )}
                  <button type="button" data-mandala-research-edit={o.cellId} onClick={() => setOpenText(isOpen ? null : o.cellId)} disabled={busy} style={{ ...btn, padding: '2px 8px', fontSize: 11 }}>
                    {isOpen ? '▲ 閉じる' : '✏️ 発注文'}
                  </button>
                </div>
                {isOpen && (
                  <textarea
                    data-mandala-research-text={o.cellId}
                    value={textOf(o)}
                    disabled={busy}
                    onChange={(e) => setTexts((t) => ({ ...t, [o.cellId]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 180, fontSize: 12, lineHeight: 1.6, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  />
                )}
                {i === 0 && !isOpen && !bulk && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>「✏️ 発注文」で内容を確認・修正できます</div>}
              </div>
            );
          })}
        </div>

        {error && <div data-mandala-research-error style={{ fontSize: 12, color: '#B91C1C', padding: '6px 10px', border: '1px solid rgba(185,28,28,0.3)', borderRadius: 8 }}>⚠️ {error}</div>}
        {summary && (
          <div data-mandala-research-summary style={{ fontSize: 12, color: 'var(--text-primary)', padding: '6px 10px', border: '1px solid rgba(29,158,117,0.35)', background: 'rgba(29,158,117,0.08)', borderRadius: 8 }}>
            {kind === 'text_analysis' && !bulk
              ? '📝 テキスト分析の画面を新しいタブで開きました。分析して保存すると、このマスに自動で紐づきます'
              : `完了 ${summary.done}/${summary.total}件・失敗 ${summary.failed}件・紐づけ ${summary.linked}件`}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span data-mandala-research-reason style={{ fontSize: 11, color: bulkState.enabled ? 'var(--text-muted)' : '#B45309', flex: 1, minWidth: 0 }}>
            {bulkState.reason ?? (bulk ? `${selected.length}件を1つのジョブとして発注します（結果は1件ずつマスに紐づきます）` : '')}
          </span>
          {summary ? (
            <button type="button" data-mandala-research-finish onClick={onClose} style={primaryBtn}>閉じる</button>
          ) : (
            <button type="button" data-mandala-research-submit onClick={() => void submit()} disabled={busy || !bulkState.enabled} title={bulkState.reason ?? undefined} style={{ ...primaryBtn, opacity: busy || !bulkState.enabled ? 0.5 : 1, cursor: busy || !bulkState.enabled ? 'not-allowed' : 'pointer' }}>
              {busy ? '⏳ 発注中…' : bulk ? `🔍 ${selected.length}件を発注` : kind === 'text_analysis' ? '📝 分析画面へ送る' : '🔍 発注'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
