-- AI背景情報コンテキスト保存テーブル
CREATE TABLE IF NOT EXISTS context_saves (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  context_text TEXT NOT NULL,
  research_text TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_saves_user_id ON context_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_context_saves_created_at ON context_saves(created_at DESC);
