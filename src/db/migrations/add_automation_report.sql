ALTER TABLE automation_sessions
  ADD COLUMN IF NOT EXISTS report_output TEXT,
  ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;
