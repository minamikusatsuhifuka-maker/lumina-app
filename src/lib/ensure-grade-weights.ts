import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon<false, false>>;

// 評価配分（知識/スキル/マインド）をグレード別に持たせる重み列を冪等に用意する。
// grade_levels は (position=職種, level_number=等級) で 1行=1グレードのため、
// 列追加だけで職種×グレードのマトリクスになる（別テーブル不要）。
// DEFAULT 25/25/50 により既存全グレードに現行の共通配分が初期投入される（既存値喪失なし）。
// マイグレーションフレームワーク無し方針に合わせ ADD COLUMN IF NOT EXISTS で運用。
// ※ 既存 evaluation_framework.score_distribution（未使用・計算非関与）は触らない（残置）。
export async function ensureGradeWeightColumns(sql: Sql): Promise<void> {
  await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS weight_knowledge INT NOT NULL DEFAULT 25`;
  await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS weight_skill INT NOT NULL DEFAULT 25`;
  await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS weight_mind INT NOT NULL DEFAULT 50`;
}
