CREATE TABLE IF NOT EXISTS business_projects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新しい事業プロジェクト',
  description TEXT,
  phase TEXT DEFAULT 'ideation',
  business_model JSONB DEFAULT '{}',
  target_market JSONB DEFAULT '{}',
  marketing_strategy JSONB DEFAULT '{}',
  messages JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_assets (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES business_projects(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_projects_user ON business_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_business_assets_project ON business_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_business_assets_type ON business_assets(asset_type);
