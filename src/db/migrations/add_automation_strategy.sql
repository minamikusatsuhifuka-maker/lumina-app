CREATE TABLE IF NOT EXISTS automation_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL DEFAULT '自動化戦略セッション',
  domain TEXT NOT NULL DEFAULT 'all',
  messages JSONB DEFAULT '[]',
  strategy_output TEXT,
  action_plan JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_sessions_user ON automation_sessions(user_id);
