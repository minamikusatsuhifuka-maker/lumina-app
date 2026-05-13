'use client';

import { useEffect, useRef, useState } from 'react';
import { createJob, fetchJobStatus, type CreateJobInput, type JobResponse } from '@/lib/computeruse/client';

interface Props {
  /** ボタンに表示するラベル */
  label: string;
  /** ジョブの内容 */
  buildJob: () => CreateJobInput | Promise<CreateJobInput>;
  /** ジョブ完了時に呼ばれるコールバック */
  onCompleted?: (job: JobResponse) => void;
  /** ジョブ失敗時に呼ばれるコールバック */
  onFailed?: (job: JobResponse) => void;
  /** 投入前の確認メッセージ */
  confirmMessage?: string;
  /** ボタンのスタイル拡張 */
  buttonStyle?: React.CSSProperties;
}

export default function ComputerUseTriggerButton({
  label,
  buildJob,
  onCompleted,
  onFailed,
  confirmMessage,
  buttonStyle,
}: Props) {
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<JobResponse['status'] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ポーリング
  useEffect(() => {
    if (!jobId || status === 'completed' || status === 'failed' || status === 'cancelled') {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    pollTimer.current = setInterval(async () => {
      try {
        const job = await fetchJobStatus(jobId);
        setStatus(job.status);
        if (job.status === 'completed') {
          onCompleted?.(job);
        } else if (job.status === 'failed') {
          setErrorMsg(job.errorMessage || '処理に失敗しました');
          onFailed?.(job);
        }
      } catch (e: any) {
        // ポーリング失敗は黙って continue（次の周期で再試行）
        console.warn('Job poll failed:', e.message);
      }
    }, 3000);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [jobId, status, onCompleted, onFailed]);

  const handleClick = async () => {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setErrorMsg(null);
    try {
      const input = await buildJob();
      const result = await createJob(input);
      setJobId(result.id);
      setStatus('queued');
    } catch (e: any) {
      setErrorMsg(e.message || 'ジョブの作成に失敗しました');
    }
  };

  const isRunning = status === 'queued' || status === 'running';
  const isDone = status === 'completed';
  const isFailed = status === 'failed';

  let displayLabel = label;
  let bg = 'var(--bg-primary)';
  let color = '#2563eb';
  let border = '#93c5fd';

  if (isRunning) {
    displayLabel = status === 'queued' ? '⏳ 待機中...' : '🤖 実行中...';
    color = '#6b7280';
    border = '#d1d5db';
  } else if (isDone) {
    displayLabel = '✅ 投稿完了';
    bg = '#d1fae5';
    color = '#065f46';
    border = '#6ee7b7';
  } else if (isFailed) {
    displayLabel = '⚠️ 失敗（再試行）';
    bg = '#fee2e2';
    color = '#991b1b';
    border = '#fca5a5';
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        title={errorMsg || (jobId ? `Job #${jobId}` : 'クリックで自動投稿開始')}
        style={{
          fontSize: 12,
          padding: '5px 10px',
          border: `1px solid ${border}`,
          borderRadius: 6,
          background: bg,
          color,
          cursor: isRunning ? 'wait' : 'pointer',
          opacity: isRunning ? 0.7 : 1,
          ...buttonStyle,
        }}
      >
        {displayLabel}
      </button>
      {errorMsg && (
        <span style={{ fontSize: 10, color: '#991b1b' }}>
          {errorMsg.length > 60 ? errorMsg.slice(0, 60) + '...' : errorMsg}
        </span>
      )}
    </div>
  );
}
