'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 314 §3-1: 並列比較の開始前の確認ダイアログ（確認は1回・R-56。開始後に追加の確認は出さない）
//
// - モデルの選択（既定 Gemini＋Opus・最少2つ・上限3・R-101）。GPT はキー未設定なら無効化＋「未設定」
// - 費用の目安（lib/model-pricing の純関数・決定的・R-74）と所要時間の目安（実測ベース・未計測は「未計測」）
// - 保存件数の予告・「完了しない見込み」の警告（既定で外す・院長が再チェックすれば走る）
// - 開始の二重発火は ref（R-87）。Esc で閉じる。使えるモデルは GET /api/deepresearch/compare（キーの有無だけ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COMPARE_GPT_UNAVAILABLE_REASON,
  COMPARE_SIDES,
  COMPARE_SIDE_ICON,
  COMPARE_SIDE_LABEL,
  COMPARE_SIDE_MODEL_ID,
  COMPARE_TIMEOUT_WARNING,
  DEEPRESEARCH_MAX_DURATION_S,
  type CompareSide,
  compareSaveCountLabel,
  compareStartState,
  defaultCompareSelection,
} from '@/lib/model-compare';
import { estimateCost, estimatedSecondsLabel, formatUsd, isLikelyToTimeout, pricingNote } from '@/lib/model-pricing';

const DEPTH_LABEL: Record<string, string> = { quick: 'クイック', standard: 'スタンダード', deep: 'ディープ' };
type Availability = Record<CompareSide, boolean>;

export default function CompareStartDialog({
  topic,
  depth,
  onClose,
  onStart,
}: {
  topic: string;
  depth: string;
  onClose: () => void;
  /** 選んだモデルで開始（親が実行する）。二重発火はここの ref と親の ref の両方で止める */
  onStart: (sides: CompareSide[]) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [maxDurationS, setMaxDurationS] = useState(DEEPRESEARCH_MAX_DURATION_S);
  const [selected, setSelected] = useState<CompareSide[]>([]);
  const [loadError, setLoadError] = useState('');
  const startedRef = useRef(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/deepresearch/compare');
        const json = (await res.json().catch(() => ({}))) as { availability?: Availability; maxDurationS?: number; error?: string };
        if (!res.ok || !json.availability) throw new Error(json.error || `使えるモデルを確認できませんでした（${res.status}）`);
        if (cancelled) return;
        const md = typeof json.maxDurationS === 'number' ? json.maxDurationS : DEEPRESEARCH_MAX_DURATION_S;
        setAvailability(json.availability);
        setMaxDurationS(md);
        setSelected(defaultCompareSelection(depth, json.availability, md));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [depth]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const startState = compareStartState(selected);
  const canStart = !!availability && startState.enabled;
  const topicChars = topic.trim().length;
  const estimates = COMPARE_SIDES.map((side) => ({ side, est: estimateCost(COMPARE_SIDE_MODEL_ID[side], depth, topicChars) }));
  const total = estimates.filter((e) => selected.includes(e.side)).reduce((sum, e) => sum + (e.est?.usd ?? 0), 0);
  const toggle = (side: CompareSide, on: boolean) =>
    setSelected((prev) => COMPARE_SIDES.filter((s) => (s === side ? on : prev.includes(s))));
  const start = () => {
    if (startedRef.current || !canStart) return; // R-87
    startedRef.current = true;
    onStart(selected);
  };

  const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };

  return createPortal(
    <div
      data-compare-dialog
      role="dialog"
      aria-label="並列比較の確認"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.35)' }}
    >
      <div style={{ width: 'min(640px, 100%)', maxHeight: '100dvh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>⚖ 並列比較を開始しますか？</div>
          <button type="button" data-compare-dialog-close onClick={onClose} style={{ ...btn, padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          お題: <strong>{topic}</strong>
          <span data-compare-dialog-depth={depth} style={{ marginLeft: 8 }}>分量: {DEPTH_LABEL[depth] ?? depth}</span>
        </div>
        {loadError && <div data-compare-dialog-error style={{ fontSize: 12, color: '#B91C1C' }}>⚠️ {loadError}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {estimates.map(({ side, est }) => {
            const modelId = COMPARE_SIDE_MODEL_ID[side];
            const available = availability ? availability[side] : false;
            const checked = selected.includes(side);
            const warn = isLikelyToTimeout(modelId, depth, maxDurationS);
            const unavailableReason = side === 'gpt' ? COMPARE_GPT_UNAVAILABLE_REASON : '未設定（API キーがありません）';
            return (
              <label
                key={side}
                data-compare-dialog-side={side}
                data-compare-dialog-unavailable={available ? undefined : '1'}
                style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'start', padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? 'var(--border-accent)' : 'var(--border)'}`, opacity: available ? 1 : 0.6, cursor: available ? 'pointer' : 'not-allowed' }}
              >
                <input type="checkbox" data-compare-dialog-check={side} checked={checked} disabled={!available || !availability} onChange={(e) => toggle(side, e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {COMPARE_SIDE_ICON[side]} {COMPARE_SIDE_LABEL[side]}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontFamily: 'monospace' }}>{modelId}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    費用 <span data-compare-dialog-cost={side} data-compare-dialog-cost-usd={est ? est.usd.toFixed(4) : ''} title={est ? `入力 約${est.inputTokens.toLocaleString()} tok × $${est.unit.inputPerM}/1M ＋ 出力 約${est.outputTokens.toLocaleString()} tok × $${est.unit.outputPerM}/1M（${est.unit.reasoningInOutput ? '思考分を2倍で見込む' : '思考分なし'}）` : undefined}>{est ? formatUsd(est.usd) : '単価未設定'}</span>
                    {' ／ 所要 '}
                    <span data-compare-dialog-time={side}>{estimatedSecondsLabel(modelId, depth)}</span>
                  </span>
                  {!available && availability && <span data-compare-dialog-unavailable-reason={side} style={{ display: 'block', fontSize: 11, color: '#B45309', marginTop: 2 }}>{unavailableReason}</span>}
                  {warn && <span data-compare-dialog-warn={side} style={{ display: 'block', fontSize: 11, color: '#B45309', marginTop: 2 }}>⚠️ {COMPARE_TIMEOUT_WARNING}</span>}
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div>合計の目安: <strong data-compare-dialog-total data-compare-dialog-total-usd={total.toFixed(4)}>{formatUsd(total)}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>（{pricingNote()}）</span></div>
          <div data-compare-dialog-saves={selected.length}>{compareSaveCountLabel(selected.length)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>時間切れ（上限 {maxDurationS}秒）の列は「中断」と表示し、その列だけ再実行できます。この比較では Gemini への自動切替を行いません。</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span data-compare-dialog-reason style={{ fontSize: 11, color: canStart ? 'var(--text-muted)' : '#B45309', flex: 1, minWidth: 0 }}>{startState.reason ?? (availability ? `${selected.length}つのモデルで同時に生成します` : '使えるモデルを確認中…')}</span>
          <button type="button" data-compare-dialog-cancel onClick={onClose} style={btn}>やめる</button>
          <button type="button" data-compare-dialog-start onClick={start} disabled={!canStart} title={startState.reason ?? undefined} style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, opacity: canStart ? 1 : 0.5, cursor: canStart ? 'pointer' : 'not-allowed' }}>
            ⚖ 比較を開始
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
