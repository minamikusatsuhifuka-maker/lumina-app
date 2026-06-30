import { neon } from '@neondatabase/serverless';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 口コミ管理（145）スキーマ：悪質口コミ検知フラグ＋Google通報記録＋返信下書き履歴
// マイグレーションフレームワーク無し方針に合わせ ADD COLUMN/CREATE TABLE IF NOT EXISTS で冪等運用。
// - clinic_reviews（既存・単一クリニックのため owner 無し）にリスク判定列を冪等追加
// - review_reports / review_reply_drafts は owner=session.user.id でスコープ（IDOR防止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Sql = ReturnType<typeof neon<false, false>>;

// 通報ステータス（院内記録の状態遷移）
export const REPORT_STATUSES = ['未通報', '通報済み', '削除確認', '却下'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// リスク種別（AI判定の分類。「単なる低評価」はポリシー違反でないため非フラグ扱い）
export const RISK_TYPES = [
  '暴言/誹謗中傷',
  '事実無根/虚偽の疑い',
  '同業者・関係者の妨害疑い',
  'スパム/無関係',
  '個人情報/プライバシー',
  '単なる低評価', // ← 実体験に基づく否定的レビュー。ポリシー違反ではない＝フラグしない
] as const;

export async function ensureReviewManagementSchema(sql: Sql): Promise<void> {
  // ① 検知：clinic_reviews にリスク判定列を冪等追加（既存行は NULL/false で非破壊）
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS risk_flag BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS risk_type TEXT`;
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS risk_reason TEXT`;
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS risk_score INTEGER`;
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS review_status TEXT`;
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ`;

  // ② 通報記録：誰が/いつ/どの口コミを/どのポリシーで通報したか・ステータス
  await sql`
    CREATE TABLE IF NOT EXISTS review_reports (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      review_id INTEGER NOT NULL,
      policy TEXT,
      report_text TEXT,
      status TEXT NOT NULL DEFAULT '未通報',
      reported_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_review_reports_owner ON review_reports(owner)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_review_reports_review_id ON review_reports(review_id)`;

  // ③ 返信下書き履歴：自動投稿はしない。下書きを保存・編集・履歴管理するのみ
  await sql`
    CREATE TABLE IF NOT EXISTS review_reply_drafts (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      review_id INTEGER,
      draft_text TEXT NOT NULL,
      tone TEXT,
      ad_check_result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_review_reply_drafts_owner ON review_reply_drafts(owner)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_review_reply_drafts_review_id ON review_reply_drafts(review_id)`;
}

// Googleの公式な口コミ報告導線（固定リンク。外部アプリからの自動送信は不可）
export const GOOGLE_REPORT_LINKS = [
  {
    label: 'Googleマップでこのクチコミを報告',
    url: 'https://support.google.com/business/answer/4596773',
    note: 'クチコミ横の「︙」→「クチコミを報告」から該当ポリシーを選択',
  },
  {
    label: 'ポリシー違反の報告フォーム（不適切なクチコミ）',
    url: 'https://support.google.com/business/contact/business_review_reports_tool',
    note: 'マップ上の報告で対応されない場合の追加導線',
  },
  {
    label: '禁止および制限されているコンテンツ（ポリシー本文）',
    url: 'https://support.google.com/contributionpolicy/answer/7400114',
    note: 'なりすまし・利益相反・スパム・不適切・個人情報などの定義',
  },
];

// 通報は匿名で行われる旨の固定文言（138で確認済みの事実。UIに明記してよい）
export const ANONYMITY_NOTICE =
  'Googleへの報告は匿名で行われ、投稿者に「誰が報告したか」は通知されません。安心してご報告いただけます。';
