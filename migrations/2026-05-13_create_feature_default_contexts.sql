-- 機能別デフォルト背景情報テーブル
-- ハイブリッド型: context_saves への参照 + スナップショット保存
CREATE TABLE IF NOT EXISTS feature_default_contexts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  context_save_id INTEGER REFERENCES context_saves(id) ON DELETE SET NULL,
  topic_snapshot TEXT NOT NULL,
  context_text_snapshot TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feature_key, context_save_id)
);

CREATE INDEX IF NOT EXISTS idx_fdc_user_feature ON feature_default_contexts(user_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_fdc_active ON feature_default_contexts(is_active) WHERE is_active = TRUE;
