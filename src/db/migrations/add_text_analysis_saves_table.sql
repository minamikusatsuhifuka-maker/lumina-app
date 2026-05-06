-- テキスト分析の保存・カテゴライズ専用テーブル
-- DermaPDF Proから移植した「テキスト分析・保存・カテゴライズ機能」用
-- 既存の analysis_saves（page_type/title/data 構造のページ別保存）とは別用途
CREATE TABLE IF NOT EXISTS text_analysis_saves (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  file_name     TEXT,
  auto_title    TEXT,
  analysis_type TEXT NOT NULL DEFAULT 'summary',
  analysis_label TEXT NOT NULL DEFAULT '概要・要約',
  content       TEXT NOT NULL,
  tags          TEXT[] DEFAULT '{}',
  folder        TEXT DEFAULT '',
  favorite      BOOLEAN DEFAULT FALSE,
  locked        BOOLEAN DEFAULT FALSE,
  char_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_text_analysis_saves_user ON text_analysis_saves(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_text_analysis_saves_folder ON text_analysis_saves(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_text_analysis_saves_type ON text_analysis_saves(user_id, analysis_type);
