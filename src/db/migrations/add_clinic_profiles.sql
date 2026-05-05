-- クリニック背景情報・理念プロファイル
CREATE TABLE IF NOT EXISTS clinic_profiles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  content TEXT NOT NULL DEFAULT '',
  sections JSONB DEFAULT '[]'::jsonb,
  applicable_features TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 機能ごとのプロファイル紐付け（user_id+feature_keyでユニーク）
CREATE TABLE IF NOT EXISTS feature_profile_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  profile_id INTEGER REFERENCES clinic_profiles(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_clinic_profiles_user ON clinic_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_clinic_profiles_default ON clinic_profiles(user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_feature_settings_user ON feature_profile_settings(user_id, feature_key);
