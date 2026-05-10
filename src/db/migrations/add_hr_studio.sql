CREATE TABLE IF NOT EXISTS hr_members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  department TEXT,
  join_date DATE,
  current_level TEXT,
  target_level TEXT,
  strengths JSONB DEFAULT '[]',
  challenges JSONB DEFAULT '[]',
  goals JSONB DEFAULT '[]',
  notes TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_records (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES hr_members(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  user_id TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_members_user ON hr_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_records_member ON hr_records(member_id);
CREATE INDEX IF NOT EXISTS idx_hr_records_type ON hr_records(record_type);
