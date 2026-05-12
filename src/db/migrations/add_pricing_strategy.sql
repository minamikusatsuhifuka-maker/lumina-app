-- 価格戦略アナライザー：競合価格収集・AI価格提案セッション
CREATE TABLE IF NOT EXISTS pricing_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  treatment_name TEXT NOT NULL,
  treatment_category TEXT,
  region TEXT,
  bed_cost_per_hour INTEGER DEFAULT 0,
  treatment_time_minutes INTEGER DEFAULT 30,
  competitor_data JSONB DEFAULT '[]',
  famous_clinic_data JSONB DEFAULT '[]',
  analysis_result TEXT,
  recommended_price INTEGER,
  price_range_min INTEGER,
  price_range_max INTEGER,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_sessions_user ON pricing_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_sessions_updated ON pricing_sessions(user_id, updated_at DESC);

-- クリニックプロファイルに経営コスト関連カラムを追加（任意設定）
ALTER TABLE clinic_profiles
  ADD COLUMN IF NOT EXISTS bed_cost_per_hour INTEGER DEFAULT 0;
ALTER TABLE clinic_profiles
  ADD COLUMN IF NOT EXISTS num_beds INTEGER DEFAULT 1;
ALTER TABLE clinic_profiles
  ADD COLUMN IF NOT EXISTS operating_hours_per_day INTEGER DEFAULT 8;
ALTER TABLE clinic_profiles
  ADD COLUMN IF NOT EXISTS operating_days_per_month INTEGER DEFAULT 22;
