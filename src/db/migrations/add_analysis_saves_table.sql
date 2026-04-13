-- AI分析結果の保存テーブル（複数ダッシュボード共通）
CREATE TABLE IF NOT EXISTS analysis_saves (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  page_type TEXT NOT NULL,
  title TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_saves_user_page ON analysis_saves(user_id, page_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_saves_created_at ON analysis_saves(created_at DESC);
