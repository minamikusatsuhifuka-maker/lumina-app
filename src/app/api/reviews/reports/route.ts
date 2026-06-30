import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureReviewManagementSchema,
  REPORT_STATUSES,
  type ReportStatus,
} from '@/lib/review-management';

export const runtime = 'nodejs';

// 院内の通報記録 CRUD（いつ/誰が/どの口コミを/どのポリシーで通報したか・ステータス）。
// すべて owner=session.user.id でスコープ（IDOR防止）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// 一覧取得（owner の記録のみ）
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);
    const rows = await sql`
      SELECT id, review_id, policy, report_text, status, reported_at, created_at, updated_at
      FROM review_reports
      WHERE owner = ${owner}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ reports: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reports] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 新規記録を作成
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { reviewId, policy, reportText, status } = await req.json();
    if (!reviewId) return NextResponse.json({ error: 'reviewId が必要です' }, { status: 400 });

    const st: ReportStatus = REPORT_STATUSES.includes(status) ? status : '未通報';
    const reportedAt = st === '通報済み' ? 'now' : null;

    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);
    const rows = await sql`
      INSERT INTO review_reports (owner, review_id, policy, report_text, status, reported_at)
      VALUES (
        ${owner},
        ${reviewId},
        ${policy ?? null},
        ${reportText ?? null},
        ${st},
        ${reportedAt === 'now' ? new Date().toISOString() : null}
      )
      RETURNING id, review_id, policy, report_text, status, reported_at, created_at, updated_at
    `;
    return NextResponse.json({ success: true, report: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reports] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ステータス/本文の更新（owner 検証）
export async function PATCH(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id, status, reportText } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);

    const st: ReportStatus | null = REPORT_STATUSES.includes(status) ? status : null;
    // 「通報済み」に遷移した時点で reported_at を打刻（既存値があれば維持）
    const reportedAt = st === '通報済み' ? new Date().toISOString() : null;

    const rows = await sql`
      UPDATE review_reports
      SET status = COALESCE(${st}, status),
          report_text = COALESCE(${reportText ?? null}, report_text),
          reported_at = CASE
            WHEN ${st} = '通報済み' AND reported_at IS NULL THEN ${reportedAt}
            ELSE reported_at
          END,
          updated_at = NOW()
      WHERE id = ${id} AND owner = ${owner}
      RETURNING id, review_id, policy, report_text, status, reported_at, created_at, updated_at
    `;
    if (!rows.length) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 });
    return NextResponse.json({ success: true, report: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reports] PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
