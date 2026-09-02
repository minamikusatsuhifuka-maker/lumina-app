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
  COMPARE_SIDES,
  COMPARE_SIDE_ICON,
  COMPARE_SIDE_LABEL,
  COMPARE_SIDE_MODEL_ID,
  COMPARE_STATUS_LABEL,
  type CompareRun,
  type CompareSide,
  compareSaveMetadata,
  compareSaveTags,
  compareSaveTitle,
  compareUsageLabel,
  formatElapsed,
} from '@/lib/model-compare';
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
  runs: Record<CompareSide, CompareRun>;
  /** 実行開始時刻（実行中の経過秒表示に使う） */
  startedAt: number | null;
  /** 自動下書きから復元したとき（R-20）はその日時。新規実行は null */
  restoredAt?: string | null;
  onClose: () => void;
};

export default function ModelCompareView({ topic, runs, startedAt, restoredAt = null, onClose }: Props) {
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

  // 実行中の列だけ経過秒を進める（両方終わったら止める）
  const anyRunning = COMPARE_SIDES.some((s) => runs[s].status === 'running');
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  const cols = resolveCompareColumns(COMPARE_SIDES.length, mounted ? fine : true);
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
  };

  return (
    <div
      ref={rootRef}
      data-model-compare
      style={{ marginBottom: 20, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          ⚖ {COMPARE_SIDE_LABEL.gemini} と {COMPARE_SIDE_LABEL.opus} の結果を横並びで比較
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
        {COMPARE_SIDES.map((side, i) => {
          const run = runs[side];
          const label = COMPARE_SIDE_LABEL[side];
          const elapsedLive = run.status === 'running' && startedAt ? formatElapsed(now - startedAt) : null;
          const savable = run.status === 'done' && hasSavableContent(run.text);
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
                      title={compareSaveTitle(topic, side)}
                      content={run.text}
                      type="deepresearch"
                      groupName="ディープリサーチ"
                      tags={compareSaveTags(side)}
                      metadata={compareSaveMetadata(side, run.stats)}
                    />
                  </div>
                )}
              </>}
            >
              {run.status === 'error' ? (
                // §3-2: 失敗は空欄にせず理由を出す。Gemini で代替しない
                <div data-compare-error={side} style={{ margin: 12, padding: 12, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.35)', borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: '#B45309' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>❌ {label} の生成に失敗しました</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{run.error || '理由不明のエラーです'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>この列は保存されていません。もう一方の結果には影響しません。</div>
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
