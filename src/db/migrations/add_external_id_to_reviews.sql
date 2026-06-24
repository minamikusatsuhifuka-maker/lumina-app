-- 提案2 / v51: 口コミ Places 同期の重複防止キー
-- external_id = sha256(source + time + author_name)。旧Places APIは安定IDを返さないため擬似キー。
-- 実行時は src/lib/places-reviews.ts の ensureReviewSyncSchema() が冪等に同等処理を行う。
ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS external_id TEXT;

-- UNIQUE(source, external_id)。既存行は external_id=NULL（NULL は重複扱いされず非破壊）。
-- ON CONFLICT (source, external_id) の推論に一致させるため通常の UNIQUE INDEX を使う。
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_reviews_source_external_id
  ON clinic_reviews (source, external_id);
