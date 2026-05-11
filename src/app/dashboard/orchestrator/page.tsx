'use client';

import { useEffect, useRef, useState } from 'react';
import { PIPELINES } from '@/lib/pipelines';

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
  reason?: string;
  results?: Record<string, { result: string; status: string }>;
  count?: number;
  labels?: string[];
  hadErrors?: boolean;
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
  const eventsEndRef = useRef<HTMLDivElement>(null);

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

    try {
      // ジョブ作成
      const createRes = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, pipelineType }),
      });
      if (!createRes.ok) {
        setErrorMessage('ジョブ作成に失敗しました');
        setIsRunning(false);
        return;
      }
      const { job } = await createRes.json();
      setCurrentJob(job);

      // パイプライン実行
      const execRes = await fetch('/api/orchestrator/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (!execRes.ok || !execRes.body) {
        setErrorMessage('実行リクエストに失敗しました');
        setIsRunning(false);
        return;
      }

      const reader = execRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              if (event.type === 'completed') {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsRunning(false);
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
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setSelectedPipeline(p.id === selectedPipeline ? null : p.id)
              }
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
                  marginTop: 6,
                  flexWrap: 'wrap',
                }}
              >
                {p.steps.map((s) => (
                  <span
                    key={s.id}
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      background: 'rgba(79,70,229,0.08)',
                      color: '#4f46e5',
                      borderRadius: 4,
                    }}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </button>
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

          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
              padding: 16,
              background: 'var(--bg-primary)',
            }}
          >
            {streamEvents.map((event, i) => {
              // 並列実行開始は専用カード表示
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

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 8,
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
                        color: 'var(--text-primary)',
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
                                ? `${event.label} エラー: ${event.message ?? ''}`
                                : event.type === 'completed'
                                  ? event.hadErrors
                                    ? '⚠️ 一部エラーありで完了'
                                    : '🎉 全工程完了！結果を確認してください'
                                  : event.type === 'error'
                                    ? `エラー: ${event.message ?? ''}`
                                    : (event.message ?? '')}
                    </div>
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
              return (
                <div
                  key={step.id}
                  style={{
                    marginBottom: 16,
                    border: `1px solid ${isError ? '#fca5a5' : 'var(--border)'}`,
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
                        color: isError ? '#dc2626' : 'var(--text-primary)',
                      }}
                    >
                      {isError ? '❌ ' : ''}
                      {step.label}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(result.result)
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
              return (
                <div
                  key={job.id}
                  style={{
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{p?.icon ?? '🤖'}</span>
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
                      }}
                    >
                      {p?.label} •{' '}
                      {new Date(job.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background:
                        job.status === 'completed'
                          ? 'rgba(5,150,105,0.15)'
                          : job.status === 'running'
                            ? 'rgba(30,64,175,0.15)'
                            : job.status === 'failed'
                              ? 'rgba(220,38,38,0.15)'
                              : 'var(--bg-secondary)',
                      color:
                        job.status === 'completed'
                          ? '#065f46'
                          : job.status === 'running'
                            ? '#1e40af'
                            : job.status === 'failed'
                              ? '#991b1b'
                              : 'var(--text-secondary)',
                    }}
                  >
                    {job.status === 'completed'
                      ? '✅ 完了'
                      : job.status === 'running'
                        ? '⏳ 実行中'
                        : job.status === 'failed'
                          ? '❌ 失敗'
                          : '📋 計画中'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
