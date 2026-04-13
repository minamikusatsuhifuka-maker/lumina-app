-- 問い合わせ・予約数の日次ログ
CREATE TABLE IF NOT EXISTS contact_logs (
  id SERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  web_bookings INTEGER NOT NULL DEFAULT 0,
  phone_bookings INTEGER NOT NULL DEFAULT 0,
  line_inquiries INTEGER NOT NULL DEFAULT 0,
  other_inquiries INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_logs_date ON contact_logs(log_date DESC);
