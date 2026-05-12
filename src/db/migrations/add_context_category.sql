-- context_savesにカテゴリ・ソース・機能タグ・有効フラグを追加
-- 既存テーブル (topic/context_text/research_text/tags) を拡張する
ALTER TABLE context_saves
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE context_saves
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE context_saves
  ADD COLUMN IF NOT EXISTS feature_tags TEXT[] DEFAULT '{}';
ALTER TABLE context_saves
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_context_saves_category ON context_saves(user_id, category);
CREATE INDEX IF NOT EXISTS idx_context_saves_active ON context_saves(user_id, is_active);
