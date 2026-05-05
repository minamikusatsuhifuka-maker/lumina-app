-- 知識ツリーノードテーブル
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  source_type TEXT NOT NULL,
  summary TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  suggested_titles JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_user ON knowledge_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_parent ON knowledge_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_created ON knowledge_nodes(created_at DESC);
