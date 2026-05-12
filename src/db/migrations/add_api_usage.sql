-- API使用量ログテーブル
-- 各機能のClaude API呼び出しごとにトークン消費とコストを記録する
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  feature_key TEXT NOT NULL,
  step_label TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  cost_jpy INTEGER DEFAULT 0,
  model TEXT DEFAULT 'claude-sonnet-4-6',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage_logs(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_feature ON api_usage_logs(user_id, feature_key);
