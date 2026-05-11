-- 自動化パイプラインジョブ管理
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  intent TEXT NOT NULL,
  pipeline_type TEXT NOT NULL,
  status TEXT DEFAULT 'planning',
  steps JSONB DEFAULT '[]',
  results JSONB DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_user ON pipeline_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);
