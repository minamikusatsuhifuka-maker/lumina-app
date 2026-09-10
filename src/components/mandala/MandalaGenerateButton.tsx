'use client';

// 316 §3-1: 📚🗂の行から「🔲 マンダラにする」。ダイアログ（9／81・既定は 3,000 字で分岐・費用の目安・確認は1回 R-56）→ 二段階の実行（進行表示）
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/components/ModalSheet';
import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import { formatUsd, pricingNote } from '@/lib/model-pricing';
import { defaultGenerateMode, estimateGenerateCost, type MandalaGenerateMode } from '@/lib/mandala-generate';
import { runMandalaGeneration, type GenerateOutcome, type GenerateProgress } from '@/lib/mandala-generate-client';

export default function MandalaGenerateButton({ scope, itemKey, title, charCount, style, label }: { scope: string; itemKey: string; title: string; charCount: number; style?: React.CSSProperties; label?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<MandalaGenerateMode>(defaultGenerateMode(charCount));
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [outcome, setOutcome] = useState<GenerateOutcome | null>(null);
  const [error, setError] = useState('');
  const busyRef = useRef(false); // R-87
  useEffect(() => setMounted(true), []);
  useBodyScrollLock(mounted && open); // 326: 開いている間だけ背面をスクロールさせない（この部品は閉じていても常に居る）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const cost = estimateGenerateCost(charCount, mode);
  const start = async () => {
    if (busyRef.current) return; // R-87
    busyRef.current = true;
    setError('');
    setOutcome(null);
    try {
      const o = await runMandalaGeneration({ scope, itemKey, mode }, setProgress);
      setOutcome(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
      setProgress(null);
    } finally {
      busyRef.current = false;
    }
  };
  const busy = !!progress && progress.stage !== 'done';
  const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };
  return (
    <>
      <button type="button" data-mandala-gen-open={itemKey} onClick={(e) => { e.stopPropagation(); setMode(defaultGenerateMode(charCount)); setProgress(null); setOutcome(null); setError(''); setOpen(true); }} title="この記事の要点と関連性を 9／81 マスのマンダラに展開する（AI・記事の範囲だけ）" style={style}>
        {label ?? '🔲 マンダラ'}
      </button>
      {mounted && open && createPortal(
        <div data-mandala-gen-dialog role="dialog" aria-label="記事からマンダラを生成" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.35)' }}>
          <div style={{ width: 'min(520px, 100%)', background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-primary)' }}>
            <div style={{ fontWeight: 700 }}>🔲 記事からマンダラを生成</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div>記事: <strong>{title}</strong>（{charCount.toLocaleString()} 字）</div>
              <div>記事にある内容だけで要点と関連性をまとめます（引用が記事に無い項目は捨てます）。生成したマスには「AI」の印が付きます。</div>
            </div>
            {!outcome && !progress && (
              <>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['9', '81'] as MandalaGenerateMode[]).map((m) => (
                    <label key={m} data-mandala-gen-mode={m} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: `1px solid ${mode === m ? '#6c63ff' : 'var(--border)'}`, cursor: 'pointer' }}>
                      <input type="radio" name="mandala-gen-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                      {m === '9' ? '9マス（要点8）' : '81マス（要点8＋各8の小項目）'}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  費用の目安: <strong data-mandala-gen-cost data-mandala-gen-cost-usd={cost !== null ? cost.toFixed(4) : ''}>{cost !== null ? formatUsd(cost) : '—'}</strong>（{GEMINI_TEXT_MODEL_LABEL}・{mode === '81' ? '1＋8回' : '1回'}の呼び出し・{pricingNote()}）
                </div>
              </>
            )}
            {progress && (
              <div data-mandala-gen-progress={progress.stage} data-mandala-gen-items-done={progress.itemsDone} style={{ fontSize: 12, color: progress.stage === 'done' ? '#0d9973' : 'var(--text-secondary)', fontWeight: 700 }}>
                {progress.stage === 'done' ? '✅ ' : '⏳ '}{progress.message}
                {progress.failed.length > 0 && <div style={{ color: '#B45309', fontWeight: 400 }}>未展開: {progress.failed.join('／')}（要点は残っています。チャートで再展開できます）</div>}
              </div>
            )}
            {outcome && (
              <div data-mandala-gen-done={outcome.chartId} data-mandala-gen-failed={outcome.failedPoints.length} style={{ fontSize: 12, lineHeight: 1.7 }}>
                <div>要点 {outcome.points.length}件{outcome.dropped.points > 0 ? `（引用が無い等で ${outcome.dropped.points}件を捨てました）` : ''}{outcome.mode === '81' ? `・小項目 ${outcome.createdItems}件${outcome.dropped.items > 0 ? `（${outcome.dropped.items}件を捨てました）` : ''}` : ''}</div>
                <a data-mandala-gen-link href={`/dashboard/mandala/${outcome.chartId}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6c63ff', fontWeight: 700 }}>🔲 マンダラを開く（新しいタブ）</a>
              </div>
            )}
            {error && <div data-mandala-gen-error style={{ fontSize: 12, color: '#B91C1C' }}>❌ {error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" data-mandala-gen-cancel onClick={() => setOpen(false)} disabled={busy} style={btn}>{outcome ? '閉じる' : 'やめる'}</button>
              {!outcome && (
                <button type="button" data-mandala-gen-start onClick={() => void start()} disabled={busy} style={{ ...btn, background: '#6c63ff', color: '#fff', border: 'none', fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
                  {busy ? '⏳ 生成中…' : '🔲 生成する'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
