-- バッチリサーチジョブの進捗管理を強化（途中停止からの再開対応）
ALTER TABLE batch_research_jobs
  ADD COLUMN IF NOT EXISTS completed_indices INTEGER[] DEFAULT '{}';
ALTER TABLE batch_research_jobs
  ADD COLUMN IF NOT EXISTS failed_indices INTEGER[] DEFAULT '{}';
ALTER TABLE batch_research_jobs
  ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_status
  ON batch_research_jobs(user_id, status);
