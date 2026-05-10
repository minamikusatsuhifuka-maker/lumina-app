CREATE TABLE IF NOT EXISTS progress_metrics (
  id SERIAL PRIMARY KEY,
  metric_type TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  user_id TEXT,
  recorded_at DATE DEFAULT CURRENT_DATE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_metrics_unique
  ON progress_metrics(user_id, metric_type, recorded_at);
