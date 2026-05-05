-- AIアーキテクチャ設計のセッション管理テーブル
CREATE TABLE IF NOT EXISTS architecture_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '新しいアーキテクチャ設計',
  description TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  architecture JSONB,
  status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_sessions_user ON architecture_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_arch_sessions_created ON architecture_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arch_sessions_updated ON architecture_sessions(updated_at DESC);
