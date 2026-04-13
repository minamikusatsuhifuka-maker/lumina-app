-- clinic_reviews に返信済みフラグ用カラムを追加
ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS reply_text TEXT;

CREATE INDEX IF NOT EXISTS idx_clinic_reviews_replied_at ON clinic_reviews(replied_at);
