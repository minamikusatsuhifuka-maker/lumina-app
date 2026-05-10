CREATE TABLE IF NOT EXISTS medical_documents (
  id SERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  procedure_name TEXT,
  content TEXT NOT NULL DEFAULT '',
  research_basis TEXT,
  refs JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  is_template BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'draft',
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_docs_user ON medical_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_docs_type ON medical_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_medical_docs_created ON medical_documents(created_at DESC);
