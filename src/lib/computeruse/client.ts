// Computer Use ジョブ投入クライアント
// xLUMINA の UI コンポーネントから利用する

export type TaskType =
  | 'wordpress_publish'
  | 'kindle_publish'
  | 'gbp_post'
  | 'indeed_post'
  | 'competitor_research';

export type TargetService =
  | 'wordpress'
  | 'kdp'
  | 'gbp'
  | 'indeed'
  | 'google_search';

export interface CreateJobInput {
  taskType: TaskType;
  targetService: TargetService;
  sourceId?: string;
  params: Record<string, any>;
  prompt: string;
}

export interface JobResponse {
  id: number;
  taskType: TaskType;
  targetService: TargetService;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  sourceId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** 新規ジョブを作成 */
export async function createJob(input: CreateJobInput): Promise<{ id: number }> {
  const res = await fetch('/api/computeruse/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'ジョブの作成に失敗しました');
  }
  return res.json();
}

/** 指定ジョブの状態を取得（ポーリング用） */
export async function fetchJobStatus(jobId: number): Promise<JobResponse> {
  const res = await fetch(`/api/computeruse/jobs/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'ジョブの取得に失敗しました');
  }
  const data = await res.json();
  return data.job;
}

/** ジョブ一覧を取得 */
export async function listJobs(status?: string): Promise<JobResponse[]> {
  const url = status
    ? `/api/computeruse/jobs?status=${encodeURIComponent(status)}`
    : '/api/computeruse/jobs';
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'ジョブ一覧の取得に失敗しました');
  }
  const data = await res.json();
  return data.items;
}
