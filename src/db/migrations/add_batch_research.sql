-- バッチリサーチジョブテーブル
CREATE TABLE IF NOT EXISTS batch_research_jobs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  topics JSONB NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'immediate',
  scheduled_at TIMESTAMPTZ,
  notify_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_research_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_scheduled_at ON batch_research_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_research_jobs(created_at DESC);
