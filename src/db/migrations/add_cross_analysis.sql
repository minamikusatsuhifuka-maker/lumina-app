-- 横断分析（複数記事まとめ）用のカラム追加
ALTER TABLE text_analysis_saves
  ADD COLUMN IF NOT EXISTS is_cross_analysis BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cross_prompt TEXT;

CREATE INDEX IF NOT EXISTS idx_text_analysis_cross
  ON text_analysis_saves(is_cross_analysis)
  WHERE is_cross_analysis = TRUE;
