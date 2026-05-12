-- 外部連携設定
CREATE TABLE IF NOT EXISTS integration_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE,
  -- Notion
  notion_token TEXT,
  notion_database_id TEXT,
  notion_enabled BOOLEAN DEFAULT FALSE,
  -- X（Twitter）
  x_api_key TEXT,
  x_api_secret TEXT,
  x_access_token TEXT,
  x_access_secret TEXT,
  x_enabled BOOLEAN DEFAULT FALSE,
  -- Make/Zapier Webhook
  make_webhook_url TEXT,
  make_enabled BOOLEAN DEFAULT FALSE,
  zapier_webhook_url TEXT,
  zapier_enabled BOOLEAN DEFAULT FALSE,
  -- Google Sheets
  sheets_spreadsheet_id TEXT,
  sheets_enabled BOOLEAN DEFAULT FALSE,
  -- 連携トリガー設定
  trigger_on_pipeline_complete BOOLEAN DEFAULT TRUE,
  trigger_on_blog_published BOOLEAN DEFAULT TRUE,
  trigger_on_kindle_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 連携実行ログ
CREATE TABLE IF NOT EXISTS integration_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  integration_type TEXT NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_user ON integration_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
