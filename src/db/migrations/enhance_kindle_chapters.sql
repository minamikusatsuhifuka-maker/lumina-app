-- kindle_chapters テーブルに評価・改善関連の列を追加
-- evaluation, status は既に存在するのでスキップ
ALTER TABLE kindle_chapters
  ADD COLUMN IF NOT EXISTS evaluation_score INTEGER,
  ADD COLUMN IF NOT EXISTS advice TEXT,
  ADD COLUMN IF NOT EXISTS improved_content TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- kindle_books テーブルに書籍コンセプト関連の列を追加
-- 既存の phase は INTEGER なので新規TEXT列は追加しない（IF NOT EXISTSでスキップ）
ALTER TABLE kindle_books
  ADD COLUMN IF NOT EXISTS book_outline JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_reader TEXT,
  ADD COLUMN IF NOT EXISTS book_concept TEXT;
