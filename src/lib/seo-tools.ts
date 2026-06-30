import { neon } from '@neondatabase/serverless';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEO/MEO フェーズB＋C（148）共通スキーマ・定数
// - 記事生成 / 順位トラッカー / 競合分析 のテーブルを冪等に用意
// - すべて owner=session.user.id でスコープ（IDOR防止）
// マイグレーションフレームワーク無し方針：CREATE TABLE/INDEX IF NOT EXISTS。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Sql = ReturnType<typeof neon<false, false>>;

// 記事タイプ（院長が選択。表示ラベル）
export const ARTICLE_TYPES = [
  { key: 'symptom', label: '症状解説' },
  { key: 'treatment', label: '施術・治療案内' },
  { key: 'column', label: '季節コラム' },
] as const;

// 順位ログの取得元（将来 serpapi 等で自動取得できるよう区別）
export type RankSource = 'gsc' | 'manual' | 'serpapi';

export async function ensureSeoMeoSchema(sql: Sql): Promise<void> {
  // 148-1 SEO記事ドラフト
  await sql`
    CREATE TABLE IF NOT EXISTS seo_articles (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      keyword TEXT NOT NULL,
      type TEXT,
      content TEXT NOT NULL,
      ad_check JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_articles_owner ON seo_articles(owner)`;

  // 148-2 追跡キーワード
  await sql`
    CREATE TABLE IF NOT EXISTS seo_keywords (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      keyword TEXT NOT NULL,
      target_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner, keyword)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_keywords_owner ON seo_keywords(owner)`;

  // 148-2 順位ログ（推移）。rank は平均掲載順位（GSC）または手入力順位
  await sql`
    CREATE TABLE IF NOT EXISTS seo_rank_logs (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      keyword TEXT NOT NULL,
      rank NUMERIC,
      impressions INTEGER,
      clicks INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      logged_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_rank_logs_owner_kw ON seo_rank_logs(owner, keyword)`;

  // 148-4 競合クリニック
  await sql`
    CREATE TABLE IF NOT EXISTS competitors (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      place_id TEXT,
      place_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitors_owner ON competitors(owner)`;

  // 148-4 競合分析結果
  await sql`
    CREATE TABLE IF NOT EXISTS competitor_analyses (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      competitor_id INTEGER,
      result TEXT NOT NULL,
      ad_check JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_competitor_analyses_owner ON competitor_analyses(owner)`;
}
