-- 専門用語サーチ・用語集（リサーチ由来用語の管理）テーブル
-- 既存の glossary_items テーブルとは別物
CREATE TABLE IF NOT EXISTS glossary_terms (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  term TEXT NOT NULL,
  reading TEXT,
  explanation TEXT NOT NULL,
  source_topic TEXT,
  category TEXT,
  tags JSONB DEFAULT '[]',
  is_bookmarked BOOLEAN DEFAULT FALSE,
  review_count INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glossary_terms_user ON glossary_terms(user_id);
CREATE INDEX IF NOT EXISTS idx_glossary_terms_term ON glossary_terms(term);
CREATE INDEX IF NOT EXISTS idx_glossary_terms_created ON glossary_terms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_glossary_terms_category ON glossary_terms(category);
