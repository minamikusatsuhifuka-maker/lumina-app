'use client';

import { useEffect, useRef, useState } from 'react';
import { PIPELINES } from '@/lib/pipelines';
import { copyToClipboard } from '@/lib/copyToClipboard';

interface Job {
  id: number;
  intent: string;
  pipeline_type: string;
  status: string;
  progress: number;
  steps: Array<{
    id: string;
    label: string;
    status: string;
    result: string | null;
  }>;
  results: Record<string, { result: string; status: string }>;
  quality_scores?: Record<string, { score: number; attempts: number; passed: boolean; reason?: string }>;
  retry_logs?: Array<{ stepId: string; attempt: number; score: number; reason?: string; improvements?: string[] }>;
  created_at: string;
  completed_at: string | null;
}

interface StreamEvent {
  type: string;
  stepId?: string;
  label?: string;
  progress?: number;
  preview?: string;
  message?: string;
  error?: string;
  reason?: string;
  results?: Record<string, { result: string; status: string }>;
  count?: number;
  labels?: string[];
  hadErrors?: boolean;
  completedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  totalTokens?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  costJpy?: number;
  score?: number;
  attempts?: number;
  attempt?: number;
  improvements?: string[];
  bestScore?: number;
}

const QUICK_INTENTS = [
  {
    label: '🏥 ボトックス3点セット',
    value:
      'ボトックス注射の同意書・説明書・アフターケアを作成して',
  },
  {
    label: '🏥 ハイフ同意書セット',
    value:
      'ハイフ（HIFU）施術の同意書・説明書・アフターケアを作成して',
  },
  {
    label: '💰 AIコーチングローンチ',
    value: 'AIコーチングサービスの収益化ローンチセットを作成して',
  },
  {
    label: '📚 AI活用Kindle書籍',
    value: 'AI活用で個人事業を収益化するKindle書籍を書いて',
  },
  {
    label: '🌱 看護師育成パッケージ',
    value: '新人看護師の育成パッケージを作成して',
  },
];

const detectPipeline = (text: string): string | null => {
  for (const pipeline of PIPELINES) {
    if (pipeline.triggerKeywords.some((kw) => text.includes(kw))) {
      return pipeline.id;
    }
  }
  return null;
};

export default function OrchestratorPage() {
  const [intent, setIntent] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 履歴カードから「結果を見る」で開いた過去ジョブ
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<Job | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // パイプラインごとのステップ有効/無効状態 { pipelineId: { stepId: boolean } }
  const [stepEnabled, setStepEnabled] = useState<
    Record<string, Record<string, boolean>>
  >(() => {
    const initial: Record<string, Record<string, boolean>> = {};
    PIPELINES.forEach((pipeline) => {
      initial[pipeline.id] = {};
      pipeline.steps.forEach((step) => {
        initial[pipeline.id][step.id] = true;
      });
    });
    return initial;
  });
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // 履歴ジョブの結果を読み込んで表示する
  // results がすでに揃っていれば即時表示、なければ /api/orchestrator?id= で再取得
  const handleOpenHistory = async (job: Job) => {
    setIsLoadingHistory(true);
    try {
      const hasResults =
        job.results && Object.keys(job.results).length > 0;
      if (hasResults) {
        setSelectedHistoryJob(job);
      } else {
        const res = await fetch(`/api/orchestrator?id=${job.id}`);
        if (!res.ok) {
          setSelectedHistoryJob(job);
        } else {
          const data = (await res.json()) as { job: Job | null };
          setSelectedHistoryJob(data.job ?? job);
        }
      }
      // 結果表示エリアまでスクロール (DOM 反映を待つため次フレームで)
      window.setTimeout(() => {
        document
          .getElementById('history-results')
          ?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('[orchestrator] 履歴取得失敗:', err);
      setSelectedHistoryJob(job);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // ステップのON/OFFを切り替え
  const toggleStep = (pipelineId: string, stepId: string) => {
    setStepEnabled((prev) => ({
      ...prev,
      [pipelineId]: {
        ...prev[pipelineId],
        [stepId]: !(prev[pipelineId]?.[stepId] ?? true),
      },
    }));
  };

  // パイプラインの全ステップを再有効化
  const resetPipelineSteps = (pipelineId: string) => {
    const pipeline = PIPELINES.find((p) => p.id === pipelineId);
    if (!pipeline) return;
    setStepEnabled((prev) => ({
      ...prev,
      [pipelineId]: Object.fromEntries(
        pipeline.steps.map((s) => [s.id, true]),
      ),
    }));
  };

  // 有効なステップIDのリストを取得
  const getEnabledStepIds = (pipelineId: string): string[] => {
    const map = stepEnabled[pipelineId] ?? {};
    return Object.entries(map)
      .filter(([, v]) => v)
      .map(([k]) => k);
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamEvents]);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/orchestrator');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      /* skip */
    }
  };

  // 指定 jobId の execute ストリームを処理する共通関数
  // handleStart（新規実行）と handleRetry（再実行）の両方から呼ばれる
  const runExecuteStream = async (jobId: number): Promise<void> => {
    const execRes = await fetch('/api/orchestrator/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });

    if (!execRes.ok || !execRes.body) {
      setErrorMessage('実行リクエストに失敗しました');
      return;
    }

    const reader = execRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // completed を受け取らずにストリームが閉じた場合（関数killなど）の検知用
    let receivedCompleted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: StreamEvent = JSON.parse(line.slice(6));
            setStreamEvents((prev) => [...prev, event]);

            if (event.type === 'step_complete') {
              setCurrentJob((prev) =>
                prev
                  ? { ...prev, progress: event.progress ?? prev.progress }
                  : null,
              );
            }
            if (
              (event.type === 'quality_passed' ||
                event.type === 'quality_retry' ||
                event.type === 'quality_warning') &&
              event.stepId
            ) {
              setCurrentJob((prev) => {
                if (!prev) return null;
                const sid = event.stepId!;
                const existing = prev.quality_scores ?? {};
                const score =
                  event.score ?? event.bestScore ?? existing[sid]?.score ?? 0;
                const attempts =
                  event.attempts ?? event.attempt ?? existing[sid]?.attempts ?? 0;
                const passed = event.type === 'quality_passed';
                return {
                  ...prev,
                  quality_scores: {
                    ...existing,
                    [sid]: {
                      score,
                      attempts,
                      passed,
                      reason: event.message,
                    },
                  },
                };
              });
            }
            if (event.type === 'completed') {
              receivedCompleted = true;
              setShowResults(true);
              if (event.results) {
                setCurrentJob((prev) =>
                  prev
                    ? {
                        ...prev,
                        progress: 100,
                        status: 'completed',
                        results: event.results!,
                      }
                    : null,
                );
              }
              void loadJobs();
            }
            if (event.type === 'error') {
              setErrorMessage(event.message ?? '実行エラー');
            }
          } catch {
            /* skip */
          }
        }
      }
    }

    // 切断復帰: completed を受け取らずにストリームが閉じた（maxDuration kill 等）場合、
    // 実ジョブ状態を数回ポーリングして最終状態（完了/部分失敗/失敗）をUIへ反映する。
    // これにより「78%のまま無言で凍結」を根絶する。
    if (!receivedCompleted) {
      await reconcileJobState(jobId);
    }
  };

  // ジョブ状態をサーバから取得してUIへ反映（切断復帰用）。
  // 端末状態（completed / completed_with_errors / failed）になるまで数回ポーリング。
  const reconcileJobState = async (jobId: number): Promise<void> => {
    const TERMINAL = ['completed', 'completed_with_errors', 'failed'];
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await fetch(`/api/orchestrator?id=${jobId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const job = data.job as Job | null;
        if (!job) continue;

        // 取得できた最新状態を反映（進捗・ステータス・結果）
        setCurrentJob((prev) =>
          prev && prev.id === job.id ? { ...prev, ...job } : prev ?? job,
        );

        if (TERMINAL.includes(job.status)) {
          setShowResults(true);
          await loadJobs();
          if (job.status !== 'completed') {
            setErrorMessage(
              '一部のステップが未完または失敗で終了しました（時間制限の可能性）。各ステップの状態をご確認のうえ、必要なら再実行してください。',
            );
          }
          return;
        }
      } catch {
        /* 次の試行へ */
      }
    }
    // ポーリングしても端末状態にならない＝処理が中断した可能性。無言凍結にしない。
    setErrorMessage(
      '処理が中断した可能性があります。履歴から状態を確認し、「再実行」または「リセット」してください。',
    );
    await loadJobs();
  };

  const handleStart = async () => {
    if (!intent.trim()) {
      setErrorMessage('意図を入力してください');
      return;
    }
    const pipelineType = selectedPipeline ?? detectPipeline(intent);
    if (!pipelineType) {
      setErrorMessage(
        '対応するパイプラインが見つかりません。下からパイプラインを選択してください。',
      );
      return;
    }

    setErrorMessage('');
    setIsRunning(true);
    setStreamEvents([]);
    setShowResults(false);

    const enabledStepIds = getEnabledStepIds(pipelineType);
    if (enabledStepIds.length === 0) {
      setErrorMessage('実行するステップが選択されていません');
      setIsRunning(false);
      return;
    }

    try {
      // ジョブ作成
      const createRes = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, pipelineType, enabledStepIds }),
      });
      if (!createRes.ok) {
        setErrorMessage('ジョブ作成に失敗しました');
        setIsRunning(false);
        return;
      }
      const { job } = await createRes.json();
      setCurrentJob(job);

      await runExecuteStream(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  // 失敗・途中停止したジョブを再実行する
  // 既存ジョブIDをそのまま使うので、ステップ構成・意図は変わらない
  const handleRetry = async (job: Job) => {
    setErrorMessage('');
    setIsRunning(true);
    setStreamEvents([]);
    setShowResults(false);
    setCurrentJob(job);
    setSelectedHistoryJob(null);

    try {
      await runExecuteStream(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  // 「実行中」のまま固まっているジョブを失敗扱いにリセットする
  const handleReset = async (job: Job) => {
    if (!window.confirm('このジョブをリセット（失敗扱いに）しますか？\n後で再実行できます。'))
      return;
    try {
      const res = await fetch('/api/orchestrator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!res.ok) {
        setErrorMessage('リセットに失敗しました');
        return;
      }
      await loadJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`リセット通信エラー: ${msg}`);
    }
  };

  const activePipelineId = selectedPipeline ?? detectPipeline(intent);
  const pipeline = PIPELINES.find((p) => p.id === activePipelineId);

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          🤖 AIオーケストレーター
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}
        >
          意図を1行入力するだけで、AIが全工程を自動実行します（人の作業5%以下）
        </p>
      </div>

      {/* クイック選択 */}
      <div style={{ marginBottom: 16 }}>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 8,
          }}
        >
          よく使う自動化：
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK_INTENTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setIntent(q.value);
                setSelectedPipeline(detectPipeline(q.value));
              }}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* 意図入力 */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={intent}
          onChange={(e) => {
            setIntent(e.target.value);
            setSelectedPipeline(detectPipeline(e.target.value));
          }}
          placeholder={`例：ボトックス注射の同意書・説明書・アフターケアを一括作成して\n例：AIコーチングサービスのローンチセットを作って\n例：新人看護師の育成パッケージを作成して`}
          rows={3}
          disabled={isRunning}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 14,
            resize: 'none',
            fontFamily: 'inherit',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            opacity: isRunning ? 0.6 : 1,
          }}
        />
      </div>

      {/* パイプライン選択 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {PIPELINES.map((p) => {
          const active = activePipelineId === p.id;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedPipeline(p.id === selectedPipeline ? null : p.id)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPipeline(
                    p.id === selectedPipeline ? null : p.id,
                  );
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                border: `2px solid ${active ? '#4f46e5' : 'var(--border)'}`,
                background: active
                  ? 'rgba(79,70,229,0.08)'
                  : 'var(--bg-primary)',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 2,
                  color: 'var(--text-primary)',
                }}
              >
                {p.icon} {p.label}
              </div>
              <div
                style={{ fontSize: 11, color: 'var(--text-secondary)' }}
              >
                {p.description}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                {p.steps.map((step) => {
                  const isOn = stepEnabled[p.id]?.[step.id] !== false;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStep(p.id, step.id);
                      }}
                      title={isOn ? 'クリックでスキップ' : 'クリックで有効化'}
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.15s',
                        background: isOn
                          ? 'rgba(79,70,229,0.12)'
                          : 'rgba(0,0,0,0.05)',
                        color: isOn ? '#4f46e5' : '#9ca3af',
                        textDecoration: isOn ? 'none' : 'line-through',
                        opacity: isOn ? 1 : 0.6,
                      }}
                    >
                      {step.label}
                      {!isOn && (
                        <span style={{ marginLeft: 3, fontSize: 9 }}>✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* 無効化されたステップ数の表示 */}
              {(() => {
                const disabledCount = p.steps.filter(
                  (s) => stepEnabled[p.id]?.[s.id] === false,
                ).length;
                if (disabledCount === 0) return null;
                return (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: 'var(--text-muted, #9ca3af)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>⚠️ {disabledCount}件をスキップ</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetPipelineSteps(p.id);
                      }}
                      style={{
                        fontSize: 10,
                        color: 'var(--text-secondary, #6b7280)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      全て有効に戻す
                    </button>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 16,
            fontSize: 13,
            color: '#dc2626',
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* 実行ボタン */}
      <button
        type="button"
        onClick={handleStart}
        disabled={isRunning || !intent.trim()}
        style={{
          width: '100%',
          padding: '14px',
          fontSize: 16,
          fontWeight: 700,
          background: isRunning
            ? '#9ca3af'
            : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          cursor: isRunning || !intent.trim() ? 'not-allowed' : 'pointer',
          marginBottom: 24,
          opacity: !intent.trim() ? 0.4 : 1,
        }}
      >
        {isRunning ? '🤖 AIが自動実行中...' : '🚀 AIに全部お任せする'}
      </button>

      {/* 実行ログ */}
      {streamEvents.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              📊 実行ログ
              {currentJob && (
                <span
                  style={{ marginLeft: 12, fontSize: 12, color: '#4f46e5' }}
                >
                  {currentJob.progress}%
                </span>
              )}
            </span>
            {isRunning && (
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 150, 300].map((d) => (
                  <div
                    key={d}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4f46e5',
                      animation: `pulse 1s ${d}ms infinite`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* プログレスバー */}
          {currentJob && (
            <div style={{ height: 4, background: 'var(--bg-secondary)' }}>
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                  width: `${currentJob.progress}%`,
                  transition: 'width 0.5s',
                }}
              />
            </div>
          )}

          {/* ログ本体：ユーザーがドラッグでリサイズ可能 */}
          <div
            style={{
              overflow: 'auto',
              padding: 16,
              background: 'var(--bg-primary)',
              resize: 'vertical',
              minHeight: 200,
              maxHeight: 600,
              height: 300,
            }}
          >
            {streamEvents.map((event, i) => {
              // 並列実行開始は専用カード表示（青背景）
              if (event.type === 'parallel_start') {
                return (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      marginBottom: 8,
                      background: 'rgba(79,70,229,0.08)',
                      border: '1px solid rgba(79,70,229,0.3)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#4f46e5',
                        }}
                      >
                        {event.count}件を並列実行中
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {(event.labels ?? []).join(' • ')}
                      </div>
                    </div>
                  </div>
                );
              }

              // エラー行は赤背景でハイライト
              const isError = event.type === 'step_error' || event.type === 'error';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 8,
                    ...(isError
                      ? {
                          background: 'rgba(239,68,68,0.06)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }
                      : {}),
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {event.type === 'started'
                      ? '🚀'
                      : event.type === 'step_start'
                        ? '⏳'
                        : event.type === 'step_complete'
                          ? '✅'
                          : event.type === 'step_skip'
                            ? '⤵️'
                            : event.type === 'step_error'
                              ? '❌'
                              : event.type === 'quality_passed'
                                ? '📊'
                                : event.type === 'quality_retry'
                                  ? '🔄'
                                  : event.type === 'quality_warning'
                                    ? '⚠️'
                                    : event.type === 'completed'
                                      ? '🎉'
                                      : event.type === 'error'
                                        ? '⚠️'
                                        : 'ℹ️'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: event.type === 'completed' ? 700 : 400,
                        color: isError
                          ? '#dc2626'
                          : event.type === 'completed'
                            ? '#059669'
                            : 'var(--text-primary)',
                      }}
                    >
                      {event.type === 'started'
                        ? 'パイプライン開始'
                        : event.type === 'step_start'
                          ? `${event.label} を実行中...`
                          : event.type === 'step_complete'
                            ? `${event.label} 完了（${event.progress}%）`
                            : event.type === 'step_skip'
                              ? `${event.label} スキップ: ${event.reason ?? ''}`
                              : event.type === 'step_error'
                                ? `${event.label ?? ''} エラー: ${event.error ?? event.message ?? ''}`
                                : event.type === 'quality_passed'
                                  ? `${event.label} 品質OK（${event.score}点・${event.attempts}回目）`
                                  : event.type === 'quality_retry'
                                    ? `${event.label} 品質${event.score}点 → 自動改善して再試行中（${event.attempt}回目）`
                                    : event.type === 'quality_warning'
                                      ? `${event.label}: ${event.message ?? ''}`
                                      : event.type === 'completed'
                                        ? `🎉 全工程完了！（✅${event.completedCount ?? 0}件 / ❌${event.failedCount ?? 0}件${
                                            (event.skippedCount ?? 0) > 0
                                              ? ` / ⏭${event.skippedCount}件`
                                              : ''
                                          }）`
                                        : event.type === 'error'
                                          ? `エラー: ${event.message ?? ''}`
                                          : (event.message ?? '')}
                    </div>
                    {event.type === 'quality_retry' && event.improvements && event.improvements.length > 0 && (
                      <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                        改善点: {event.improvements.slice(0, 2).join(' / ')}
                      </div>
                    )}
                    {event.preview && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {event.preview}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={eventsEndRef} />
          </div>

          {/* リサイズヒント */}
          <div
            style={{
              padding: '4px 12px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border)',
              fontSize: 10,
              color: '#9ca3af',
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            ↕ 上のログ枠の下端をドラッグしてリサイズ
          </div>
        </div>
      )}

      {/* コスト・統計サマリーパネル（完了時） */}
      {(() => {
        const completedEvent = streamEvents.find(
          (e) => e.type === 'completed',
        );
        if (!completedEvent) return null;
        return (
          <div
            style={{
              padding: '14px 20px',
              background:
                'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.08))',
              border: '1px solid rgba(79,70,229,0.2)',
              borderRadius: 12,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#4f46e5',
                  marginBottom: 4,
                }}
              >
                🎉 全工程完了！
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: 'var(--text-secondary)',
                    marginLeft: 10,
                  }}
                >
                  ✅{completedEvent.completedCount ?? 0}件完了
                  {(completedEvent.failedCount ?? 0) > 0 &&
                    ` / ❌${completedEvent.failedCount}件失敗`}
                  {(completedEvent.skippedCount ?? 0) > 0 &&
                    ` / ⏭${completedEvent.skippedCount}件スキップ`}
                </span>
              </div>
            </div>

            {/* API使用料金 */}
            {completedEvent.totalTokens && (
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  padding: '8px 16px',
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    入力トークン
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {(
                      completedEvent.totalTokens.inputTokens / 1000
                    ).toFixed(1)}
                    K
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    出力トークン
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {(
                      completedEvent.totalTokens.outputTokens / 1000
                    ).toFixed(1)}
                    K
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    height: 30,
                    background: 'var(--border)',
                  }}
                />
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    API使用料
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#059669',
                    }}
                  >
                    ≈ ¥{completedEvent.costJpy?.toLocaleString() ?? '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    ${completedEvent.costUsd?.toFixed(3) ?? '—'} USD
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 品質サマリーパネル */}
      {showResults && currentJob?.quality_scores && Object.keys(currentJob.quality_scores).length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            marginBottom: 16,
            background: 'rgba(79,70,229,0.06)',
            border: '1px solid rgba(79,70,229,0.2)',
            borderRadius: 10,
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#4f46e5' }}>
            📈 品質スコアサマリー
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pipeline?.steps.map((step) => {
              const qs = currentJob.quality_scores?.[step.id];
              if (!qs) return null;
              const color = qs.score >= 80 ? '#059669' : qs.score >= 60 ? '#d97706' : '#dc2626';
              return (
                <div
                  key={step.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: `${color}10`,
                    border: `1px solid ${color}20`,
                    fontSize: 12,
                    textAlign: 'center',
                    minWidth: 80,
                  }}
                >
                  <div style={{ fontWeight: 600, color }}>{qs.score}点</div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                    {step.label.slice(0, 8)}
                  </div>
                  {qs.attempts > 1 && (
                    <div style={{ fontSize: 10, color: '#d97706' }}>{qs.attempts}回試行</div>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const scores = Object.values(currentJob.quality_scores ?? {})
              .map((q) => q.score)
              .filter((s) => typeof s === 'number' && s > 0);
            const avg = scores.length > 0
              ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
              : 0;
            return (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                平均品質スコア：
                <span style={{ fontWeight: 700, marginLeft: 4, color: avg >= 80 ? '#059669' : avg >= 60 ? '#d97706' : '#dc2626' }}>
                  {avg}点
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* 完成した結果表示 */}
      {showResults && currentJob && pipeline && (
        <div
          style={{
            border: '2px solid #059669',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(5,150,105,0.1)',
              borderBottom: '1px solid rgba(5,150,105,0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: '#065f46' }}>
              🎉 完成！全工程が自動完了しました
            </span>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-primary)' }}>
            {pipeline.steps.map((step) => {
              const result = currentJob.results[step.id];
              if (!result?.result) return null;
              const isError = result.status === 'failed';
              // 時間予算/依存失敗でスキップされたステップも「未完」として明示する
              const isSkipped = result.status === 'skipped';
              return (
                <div
                  key={step.id}
                  style={{
                    marginBottom: 16,
                    border: `1px solid ${isError ? '#fca5a5' : isSkipped ? '#fcd34d' : 'var(--border)'}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isError ? '#dc2626' : isSkipped ? '#b45309' : 'var(--text-primary)',
                      }}
                    >
                      {isError ? '❌ ' : isSkipped ? '⚠️ ' : ''}
                      {step.label}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {currentJob.quality_scores?.[step.id] && (() => {
                        const qs = currentJob.quality_scores![step.id];
                        const color = qs.score >= 80 ? '#059669' : qs.score >= 60 ? '#d97706' : '#dc2626';
                        return (
                          <span
                            title={qs.reason ?? ''}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: `${color}15`,
                              color,
                              border: `1px solid ${color}30`,
                              fontWeight: 600,
                            }}
                          >
                            📊 {qs.score}点{qs.attempts > 1 ? ` (${qs.attempts}回試行)` : ''}
                          </span>
                        );
                      })()}
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(result.result)
                      }
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        background: 'var(--bg-primary)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      📋 全文コピー
                    </button>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: 12,
                      fontSize: 12,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 240,
                      overflowY: 'auto',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {result.result.length > 800
                      ? `${result.result.slice(0, 800)}...`
                      : result.result}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 過去のジョブ履歴 */}
      {jobs.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 10,
              color: 'var(--text-secondary)',
            }}
          >
            📁 過去の実行履歴
          </h3>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {jobs.slice(0, 5).map((job) => {
              const p = PIPELINES.find((pp) => pp.id === job.pipeline_type);
              const isSelected = selectedHistoryJob?.id === job.id;
              const isLoadingThis =
                isLoadingHistory && selectedHistoryJob?.id === job.id;
              const seconds = job.completed_at
                ? Math.round(
                    (new Date(job.completed_at).getTime() -
                      new Date(job.created_at).getTime()) /
                      1000,
                  )
                : null;
              return (
                <div
                  key={job.id}
                  onClick={() => handleOpenHistory(job)}
                  style={{
                    padding: '12px 16px',
                    border: `1px solid ${isSelected ? '#4f46e5' : 'var(--border)'}`,
                    borderRadius: 10,
                    background: isSelected
                      ? 'rgba(79,70,229,0.06)'
                      : 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        '#9ca3af';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        'var(--border)';
                    }
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>
                    {p?.icon ?? '🤖'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {job.intent}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                        display: 'flex',
                        gap: 8,
                      }}
                    >
                      <span>{p?.label}</span>
                      <span>•</span>
                      <span>
                        {new Date(job.created_at).toLocaleDateString('ja-JP')}
                      </span>
                      {seconds !== null && (
                        <>
                          <span>•</span>
                          <span>{seconds}秒</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 10,
                        background:
                          job.status === 'completed'
                            ? 'rgba(5,150,105,0.15)'
                            : job.status === 'completed_with_errors'
                              ? 'rgba(245,158,11,0.15)'
                              : job.status === 'running'
                                ? 'rgba(30,64,175,0.15)'
                                : job.status === 'failed'
                                  ? 'rgba(220,38,38,0.15)'
                                  : 'var(--bg-secondary)',
                        color:
                          job.status === 'completed'
                            ? '#065f46'
                            : job.status === 'completed_with_errors'
                              ? '#92400e'
                              : job.status === 'running'
                                ? '#1e40af'
                                : job.status === 'failed'
                                  ? '#991b1b'
                                  : 'var(--text-secondary)',
                      }}
                    >
                      {job.status === 'completed'
                        ? '✅ 完了'
                        : job.status === 'completed_with_errors'
                          ? '⚠️ 一部エラー'
                          : job.status === 'running'
                            ? '⏳ 実行中'
                            : job.status === 'failed'
                              ? '❌ 失敗'
                              : '📋 計画中'}
                    </span>
                    {(job.status === 'completed' ||
                      job.status === 'completed_with_errors') && (
                      <span style={{ fontSize: 11, color: '#4f46e5' }}>
                        {isLoadingThis ? '読込中...' : '結果を見る →'}
                      </span>
                    )}
                    {/* 完了以外のジョブに再実行ボタンを表示（実行中ジョブも含む） */}
                    {job.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRetry(job);
                        }}
                        disabled={isRunning}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          background: isRunning ? '#d1d5db' : '#f59e0b',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: isRunning ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                        }}
                        title="このジョブを最初から再実行します"
                      >
                        🔄 再実行
                      </button>
                    )}
                    {/* 実行中ジョブには手動リセットボタンを表示 */}
                    {job.status === 'running' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleReset(job);
                        }}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                        title="実行中状態を強制終了して失敗扱いにします"
                      >
                        ⏹ リセット
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 履歴結果の詳細表示 */}
          {selectedHistoryJob && (
            <HistoryResultsPanel
              job={selectedHistoryJob}
              onClose={() => setSelectedHistoryJob(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 履歴結果の詳細パネル
// ============================================================

function HistoryResultsPanel({
  job,
  onClose,
}: {
  job: Job;
  onClose: () => void;
}) {
  const pipeline = PIPELINES.find((p) => p.id === job.pipeline_type);
  const steps = pipeline?.steps ?? [];
  const resultsWithData = steps.filter(
    (step) => job.results?.[step.id]?.result,
  );

  const handleCopyAll = () => {
    const allText = resultsWithData
      .map(
        (step) =>
          `## ${step.label}\n\n${job.results[step.id].result}`,
      )
      .join('\n\n---\n\n');
    void copyToClipboard(allText);
  };

  return (
    <div
      id="history-results"
      style={{
        marginTop: 20,
        border: '2px solid #4f46e5',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(79,70,229,0.08)',
          borderBottom: '1px solid rgba(79,70,229,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#4f46e5',
            }}
          >
            📋 実行結果:{job.intent}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginLeft: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {new Date(job.created_at).toLocaleString('ja-JP')}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 13,
            padding: '4px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg-primary)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          ✕ 閉じる
        </button>
      </div>

      {/* 全てコピーボタン */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={resultsWithData.length === 0}
          style={{
            fontSize: 12,
            padding: '6px 14px',
            background:
              resultsWithData.length === 0 ? '#9ca3af' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor:
              resultsWithData.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          📋 全結果をまとめてコピー
        </button>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {resultsWithData.length}ステップの結果
        </span>
      </div>

      {/* 各ステップの結果 */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {resultsWithData.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '30px',
              color: 'var(--text-secondary)',
            }}
          >
            <p>結果データが見つかりません</p>
          </div>
        ) : (
          resultsWithData.map((step) => (
            <HistoryStepCard
              key={step.id}
              label={step.label}
              rawResult={job.results[step.id].result}
            />
          ))
        )}
      </div>
    </div>
  );
}

// 1 ステップ分のカード。各カードが独立に「全て表示」状態を持つので
// useState を使うためサブコンポーネントに切り出す。
function HistoryStepCard({
  label,
  rawResult,
}: {
  label: string;
  rawResult: unknown;
}) {
  const content =
    typeof rawResult === 'string'
      ? rawResult
      : JSON.stringify(rawResult, null, 2);
  const isLong = content.length > 500;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* ステップヘッダー */}
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {isLong && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              {isExpanded ? '▲ 折りたたむ' : '▼ 全て表示'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void copyToClipboard(content);
            }}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            📋 コピー
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div
        style={{
          padding: '12px 14px',
          fontSize: 13,
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          color: 'var(--text-primary)',
          maxHeight: isExpanded || !isLong ? 'none' : 200,
          overflowY: isExpanded || !isLong ? 'visible' : 'hidden',
          position: 'relative',
        }}
      >
        {content}
        {/* 折りたたみ時のグラデーション */}
        {isLong && !isExpanded && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              background:
                'linear-gradient(to bottom, transparent, var(--bg-primary))',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
