-- 手動登録・インポート用の口コミテーブル
CREATE TABLE IF NOT EXISTS clinic_reviews (
  id SERIAL PRIMARY KEY,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  review_date DATE,
  source TEXT DEFAULT 'google_maps',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_reviews_created_at ON clinic_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_reviews_source ON clinic_reviews(source);
