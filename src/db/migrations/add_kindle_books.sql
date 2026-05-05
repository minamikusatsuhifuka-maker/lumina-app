-- Kindle書籍自動生成機能用テーブル
CREATE TABLE IF NOT EXISTS kindle_books (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '新しい書籍',
  subtitle TEXT,
  language TEXT NOT NULL DEFAULT 'ja',
  genre TEXT,
  target_audience TEXT,
  target_word_count INTEGER DEFAULT 10000,
  current_word_count INTEGER DEFAULT 0,
  marketing_strategy JSONB,
  table_of_contents JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'planning',
  phase INTEGER DEFAULT 1,
  messages JSONB DEFAULT '[]'::jsonb,
  book_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kindle_chapters (
  id SERIAL PRIMARY KEY,
  book_id INTEGER REFERENCES kindle_books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  target_word_count INTEGER DEFAULT 3000,
  content TEXT,
  research_data TEXT,
  refs JSONB DEFAULT '[]'::jsonb,
  evaluation JSONB,
  improvements JSONB DEFAULT '[]'::jsonb,
  is_polished BOOLEAN DEFAULT FALSE,
  spell_checked BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kindle_books_user ON kindle_books(user_id);
CREATE INDEX IF NOT EXISTS idx_kindle_books_updated ON kindle_books(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kindle_chapters_book ON kindle_chapters(book_id, chapter_number);
