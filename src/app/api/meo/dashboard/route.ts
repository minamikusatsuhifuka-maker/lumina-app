import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureGbpSchema, MANUAL_ITEMS } from '@/lib/gbp-audit';

export const runtime = 'nodejs';

// 148-3 MEOダッシュボード。既存データ（clinic_reviews / gbp_checklist / gbp_post_drafts）を集計。
// GBP Insights（表示回数/ルート/電話タップ）は OAuth必須のため当面プレースホルダ（誤った自動値を出さない）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);

    // 口コミ集計（clinic_reviews は owner無しのグローバル＝単一クリニック）
    const summaryRows = await sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(AVG(rating), 0)::float AS avg_rating,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
        COUNT(*) FILTER (WHERE risk_flag IS TRUE)::int AS risk_flagged
      FROM clinic_reviews
    `;
    const s = (summaryRows[0] as {
      total: number;
      avg_rating: number;
      replied: number;
      risk_flagged: number;
    }) ?? { total: 0, avg_rating: 0, replied: 0, risk_flagged: 0 };

    // 月次推移（直近6ヶ月：件数と平均星）
    const monthly = (await sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             COUNT(*)::int AS count,
             COALESCE(AVG(rating), 0)::float AS avg_rating
      FROM clinic_reviews
      WHERE created_at >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY 1 ORDER BY 1 ASC
    `) as Array<{ month: string; count: number; avg_rating: number }>;

    // 手入力チェックの達成率（147A の gbp_checklist）
    const checkRows = (await sql`
      SELECT status, COUNT(*)::int AS c FROM gbp_checklist
      WHERE owner = ${owner} GROUP BY status
    `) as Array<{ status: string; c: number }>;
    const doneCount = checkRows.find((r) => r.status === 'done')?.c ?? 0;
    const checklistRate = Math.round((doneCount / MANUAL_ITEMS.length) * 100);

    // 投稿本数（147B の gbp_post_drafts）
    const postRows = await sql`SELECT COUNT(*)::int AS c FROM gbp_post_drafts WHERE owner = ${owner}`;
    const postCount = (postRows[0] as { c: number })?.c ?? 0;

    const replyRate = s.total > 0 ? Math.round((s.replied / s.total) * 100) : 0;

    return NextResponse.json({
      reviews: {
        total: s.total,
        avgRating: Number(s.avg_rating.toFixed(2)),
        replied: s.replied,
        replyRate,
        riskFlagged: s.risk_flagged,
        monthly: monthly.map((m) => ({
          month: m.month,
          count: m.count,
          avgRating: Number(m.avg_rating.toFixed(2)),
        })),
      },
      checklist: { doneCount, total: MANUAL_ITEMS.length, rate: checklistRate },
      posts: { count: postCount },
      // GBP Insights は OAuth連携で将来自動取得（今は枠のみ）
      insights: { available: false, note: 'GBP Insights（表示回数・ルート検索・電話タップ）はGoogle連携（OAuth）で将来自動取得予定' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/dashboard] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
