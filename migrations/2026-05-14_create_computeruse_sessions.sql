-- Computer Use セッション管理テーブル
-- Phase3 B-3 WordPress 自動投稿などの自律エージェントジョブを管理
-- ローカルMac の Worker がポーリング型で取得・実行する
CREATE TABLE IF NOT EXISTS computeruse_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,            -- 'wordpress_publish' | 'kindle_publish' | 'gbp_post' | ...
  target_service TEXT NOT NULL,       -- 'wordpress' | 'kdp' | 'gbp' | ...
  status TEXT NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  source_id TEXT,                     -- 元データのID（blogPostId, bookId など）
  params JSONB,                       -- 入力パラメータ（wpUrl, title, content など）
  prompt TEXT,                        -- Claude に送ったプロンプト全文
  screenshots JSONB DEFAULT '[]'::jsonb,  -- スクショURLの配列（失敗時調査用）
  result_url TEXT,                    -- 公開URL等の最終成果物URL
  result_data JSONB,                  -- その他の結果データ
  error_message TEXT,
  cost_jpy INTEGER,                   -- 推定コスト（円）
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cus_user ON computeruse_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cus_status ON computeruse_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cus_created_at ON computeruse_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cus_queued ON computeruse_sessions(created_at ASC) WHERE status = 'queued';
