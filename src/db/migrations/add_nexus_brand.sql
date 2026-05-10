-- nexusブランド設定（ユーザーごとに1つ）
CREATE TABLE IF NOT EXISTS nexus_brand (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE,
  brand_name TEXT DEFAULT 'nexus',
  tagline TEXT,
  description TEXT,
  owner_name TEXT,
  owner_profile TEXT,
  owner_photo_url TEXT,
  services JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  testimonials JSONB DEFAULT '[]',
  sns_links JSONB DEFAULT '{}',
  color_theme TEXT DEFAULT 'dark',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ブログ記事管理
CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  slug TEXT,
  content TEXT,
  excerpt TEXT,
  category TEXT,
  tags JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  source_type TEXT,
  source_id INTEGER,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_brand_user ON nexus_brand(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled ON blog_posts(scheduled_at);
