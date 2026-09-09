'use client';

// 290: ディープリサーチの「Gemini と Claude Opus 5 を並列実行して横並び比較」の表示。
//
// 271〜289 の比較UI（同期スクロール・sticky列ヘッダー・高さプリセット）を CompareGrid の共通部品で再利用し、
// 列数は resolveCompareColumns / compareGridClass（lib/batch-compare.ts）に委ねる。
// 2列固定（COMPARE_SIDES）のため列数の選択UIは置かない（289の列数UIは「何件を何列に」の問題で、
// 2件では自動＝md以上2列／タッチ端末1列が唯一の答え。選択肢を出しても選ぶものがない）。
//
// 表示の型（R-45/R-97）: 生成中は raw（MarkdownBody raw）、完了後に整形（MarkdownBody）。
// 失敗した列は空欄にせず理由を出す（§3-2）。Gemini で代替した表示は**存在しない**（比較経路はフォールバック無効）。

import { useEffect, useRef, useState } from 'react';
import { MarkdownBody } from '@/components/MarkdownBody';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { hasSavableContent } from '@/lib/merge-report';
import {
  type CompareHeightPreset,
  compareGridClass,
  loadHeightPreset,
  resolveCompareColumns,
  saveHeightPreset,
} from '@/lib/batch-compare';
import {
  COMPARE_SIDE_ICON,
  COMPARE_SIDE_LABEL,
  COMPARE_SIDE_MODEL_ID,
  COMPARE_STATUS_LABEL,
  type CompareRun,
  type CompareRuns,
  type CompareSide,
  compareRunSides,
  compareSaveMetadata,
  compareSaveTags,
  compareSaveTitle,
  compareUsageLabel,
  formatElapsed,
  isCompareRerunnable,
} from '@/lib/model-compare';
// 314 §3-4: 実際のトークン数から費用の実績（usage が取れた列だけ）・完了時刻は JST（R-86）
import { costOf, formatUsd } from '@/lib/model-pricing';
import { formatJst, jstDateString } from '@/lib/jst';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { triggerDownload } from '@/lib/download';
import { useFinePointer } from '@/lib/pointer-device';
import {
  COMPARE_ACCENT,
  CompareColumnShell,
  CompareHeightPicker,
  CompareSyncToggle,
  compareCompactBtnStyle,
  useSyncedScroll,
} from '@/components/deepresearch/CompareGrid';

type Props = {
  topic: string;
  /** 314: 選んだ列だけ（2〜3列） */
  runs: CompareRuns;
  /** 実行開始時刻（実行中の経過秒表示に使う） */
  startedAt: number | null;
  /** 自動下書きから復元したとき（R-20）はその日時。新規実行は null */
  restoredAt?: string | null;
  onClose: () => void;
  /** 314 §3-2: 失敗・中断した列だけをやり直す（そのモデルだけ）。省略時はボタンを出さない */
  onRerun?: (side: CompareSide) => void;
  /** 319: 保存タイトルの元（追加リサーチは「<プロンプト先頭30字> — <元資料>」）。未指定＝お題 */
  saveTitleBase?: string;
  /** 319: 各列の保存 metadata に足す（followUp）。未指定＝従来どおり */
  extraMetadata?: Record<string, unknown> | null;
};

export default function ModelCompareView({ topic, runs, startedAt, restoredAt = null, onClose, onRerun, saveTitleBase, extraMetadata = null }: Props) {
  const sides = compareRunSides(runs);
  const { fine, mounted } = useFinePointer();
  const [syncScroll, setSyncScroll] = useState(true);
  const [heightPreset, setHeightPreset] = useState<CompareHeightPreset>('high');
  const [copied, setCopied] = useState<CompareSide | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { setColRef, handleScroll } = useSyncedScroll(syncScroll);

  useEffect(() => {
    // 289 の高さプリセットは localStorage 共有（バッチ比較と同じ値を使う＝画面ごとに覚え直させない）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeightPreset(loadHeightPreset());
  }, []);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // 実行中の列だけ経過秒を進める（全部終わったら止める）
  const anyRunning = sides.some((s) => runs[s]!.status === 'running');
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  const cols = resolveCompareColumns(sides.length, mounted ? fine : true);
  const applyHeight = (h: CompareHeightPreset) => {
    setHeightPreset(h);
    saveHeightPreset(h);
  };

  const handleCopy = async (text: string, side: CompareSide) => {
    if (!text) return;
    // R-71: 貼り付け先を決め打ちしない一般コピー（原文のまま）
    await copyRichMarkdown(text);
    setCopied(side);
    setTimeout(() => setCopied(null), 1500);
  };
  const handleDownload = (text: string, side: CompareSide) => {
    if (!text) return;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeTopic = (topic || 'untitled').replace(/[/\\:*?"<>|]/g, '').slice(0, 30);
    triggerDownload(`${safeTopic}_${COMPARE_SIDE_LABEL[side]}_${date}.md`, text, 'text/markdown;charset=utf-8');
  };

  const statusColor: Record<CompareRun['status'], string> = {
    running: 'var(--text-muted)',
    done: '#0d9973',
    // R-43: 警告色はコントラスト 4.5:1 以上（#B45309）
    error: '#B45309',
    timeout: '#B45309',
  };

  return (
    <div
      ref={rootRef}
      data-model-compare
      style={{ marginBottom: 20, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          ⚖ {sides.map((s) => COMPARE_SIDE_LABEL[s]).join('／')} の結果を横並びで比較
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CompareHeightPicker value={heightPreset} onChange={applyHeight} />
          <CompareSyncToggle checked={syncScroll} onChange={setSyncScroll} />
          <button
            type="button"
            data-compare-close
            onClick={onClose}
            disabled={anyRunning}
            title={anyRunning ? '実行が終わるまで閉じられません' : '比較を閉じます（保存していない結果は消えます）'}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: 11, cursor: anyRunning ? 'not-allowed' : 'pointer', opacity: anyRunning ? 0.5 : 1 }}
          >
            ✕ 閉じる
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        お題: <strong style={{ color: 'var(--text-secondary)' }}>{topic}</strong>
        {restoredAt && <span data-compare-restored style={{ marginLeft: 8 }}>（前回の比較結果を復元: {new Date(restoredAt).toLocaleString('ja-JP')}）</span>}
        {mounted && !fine && '（この端末では1列ずつ表示します）'}
        <span style={{ marginLeft: 8 }}>※ この比較では上限・障害時の Gemini への自動切替を行いません。失敗した側は失敗として表示します。</span>
      </div>

      <div className={compareGridClass(cols)} data-compare-cols={cols} data-compare-cols-mode="auto" data-compare-height={heightPreset}>
        {sides.map((side, i) => {
          const run = runs[side]!;
          const label = COMPARE_SIDE_LABEL[side];
          const runStart = run.startedAt ?? startedAt;
          const elapsedLive = run.status === 'running' && runStart ? formatElapsed(now - runStart) : null;
          const savable = run.status === 'done' && hasSavableContent(run.text);
          // 314 §3-4: usage が取れた列だけ費用の実績（推定値を実績として出さない）。単価は完了日（JST）のもの
          const actualUsd = run.status === 'done' && run.stats && run.stats.inputTokens !== undefined && run.stats.outputTokens !== undefined
            ? costOf(COMPARE_SIDE_MODEL_ID[side], run.stats.inputTokens, run.stats.outputTokens, run.stats.finishedAt ? jstDateString(run.stats.finishedAt) : undefined)
            : null;
          const finishedLabel = run.stats?.finishedAt ? formatJst(run.stats.finishedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
          return (
            <CompareColumnShell
              key={side}
              index={i}
              heightPreset={heightPreset}
              colRef={setColRef(i)}
              onScroll={() => handleScroll(i)}
              extraAttrs={{ 'data-compare-model': side, 'data-compare-status': run.status }}
              header={<>
                {/* §5-3: 列ヘッダーにモデル名を明示（どちらが Gemini でどちらが Opus 5 か） */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span data-compare-model-label={side} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {COMPARE_SIDE_ICON[side]} {label}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontFamily: 'monospace' }}>{COMPARE_SIDE_MODEL_ID[side]}</span>
                  </span>
                  <span data-compare-status-label={side} style={{ fontSize: 11, fontWeight: 700, color: statusColor[run.status] }}>
                    {COMPARE_STATUS_LABEL[run.status]}
                    {elapsedLive ? ` ${elapsedLive}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {/* §6-3: 使用量（所要時間・文字数・トークン） */}
                  <span data-compare-usage={side} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {run.status === 'running'
                      ? `${run.text.length.toLocaleString()}字（生成中）`
                      : compareUsageLabel(run.stats) || `${run.text.length.toLocaleString()}字`}
                    {finishedLabel && <span data-compare-finished={side}>{` ／ 完了 ${finishedLabel}`}</span>}
                    {actualUsd !== null && <span data-compare-cost={side} data-compare-cost-usd={actualUsd.toFixed(4)} title="実際のトークン数×単価（目安・上限ではありません）">{` ／ 費用 ${formatUsd(actualUsd)}`}</span>}
                  </span>
                  {run.status === 'done' && run.text && (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" data-compare-copy={i} onClick={() => handleCopy(run.text, side)} style={compareCompactBtnStyle}>
                        {copied === side ? '✓' : '📋'}
                      </button>
                      <button type="button" data-compare-dl={i} onClick={() => handleDownload(run.text, side)} style={compareCompactBtnStyle}>
                        📥
                      </button>
                    </span>
                  )}
                </div>
                {/* §5-5: 保存は列ごと（両方でも片方でも）。空本文は保存ボタンを出さない（hasSavableContent・R-95） */}
                {savable && (
                  <div data-compare-save={side} style={{ marginTop: 8 }}>
                    <SaveToLibraryButton
                      title={compareSaveTitle(saveTitleBase ?? topic, side)}
                      content={run.text}
                      type="deepresearch"
                      groupName="ディープリサーチ"
                      tags={compareSaveTags(side)}
                      metadata={{ ...compareSaveMetadata(side, run.stats), ...(extraMetadata ?? {}) }}
                    />
                  </div>
                )}
              </>}
            >
              {run.status === 'error' || run.status === 'timeout' ? (
                // §3-2: 失敗・中断は空欄にせず理由を出す。Gemini で代替しない。314: その列だけ再実行できる
                <div data-compare-error={side} data-compare-timeout={run.status === 'timeout' ? '1' : undefined} style={{ margin: 12, padding: 12, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.35)', borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: '#B45309' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{run.status === 'timeout' ? `⏸ ${label} は時間切れで中断しました` : `❌ ${label} の生成に失敗しました`}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{run.error || '理由不明のエラーです'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>この列は保存されていません。他の列の結果には影響しません。</div>
                  {onRerun && isCompareRerunnable(run) && (
                    <button type="button" data-compare-rerun={side} onClick={() => onRerun(side)} style={{ ...compareCompactBtnStyle, marginTop: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
                      🔁 {label} だけ再実行
                    </button>
                  )}
                  {run.text && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>途中までの出力（{run.text.length.toLocaleString()}字・保存されません）</summary>
                      <MarkdownBody text={run.text} raw style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }} />
                    </details>
                  )}
                </div>
              ) : run.status === 'running' ? (
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid var(--border-accent)', borderTopColor: COMPARE_ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    {label} で調査中…
                  </div>
                  {/* 生成中は生（R-97「生成中は生・完了後に整形」） */}
                  <MarkdownBody text={run.text} raw style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }} />
                </div>
              ) : run.text ? (
                // R-45/R-97: 完了後は MarkdownBody で整形（生MD記法を出さない）
                <MarkdownBody text={run.text} style={{ padding: 12, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }} />
              ) : (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>（本文がありません）</div>
              )}
            </CompareColumnShell>
          );
        })}
      </div>
    </div>
  );
}
