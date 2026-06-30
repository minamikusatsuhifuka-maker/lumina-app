import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureReviewManagementSchema } from '@/lib/review-management';

export const runtime = 'nodejs';

// ③ 返信下書きの保存・履歴（自動投稿はしない）。owner=session.user.id でスコープ。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// 履歴取得（任意で review_id 絞り込み）
export async function GET(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const reviewId = searchParams.get('reviewId');

    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);

    const rows = reviewId
      ? await sql`
          SELECT id, review_id, draft_text, tone, ad_check_result, created_at
          FROM review_reply_drafts
          WHERE owner = ${owner} AND review_id = ${Number(reviewId)}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT id, review_id, draft_text, tone, ad_check_result, created_at
          FROM review_reply_drafts
          WHERE owner = ${owner}
          ORDER BY created_at DESC
          LIMIT 100
        `;
    return NextResponse.json({ drafts: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reply-drafts] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 下書きを保存
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { reviewId, draftText, tone, adCheckResult } = await req.json();
    if (!draftText || typeof draftText !== 'string') {
      return NextResponse.json({ error: 'draftText が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);

    const adCheckStr =
      adCheckResult == null
        ? null
        : typeof adCheckResult === 'string'
          ? adCheckResult
          : JSON.stringify(adCheckResult);

    const rows = await sql`
      INSERT INTO review_reply_drafts (owner, review_id, draft_text, tone, ad_check_result)
      VALUES (${owner}, ${reviewId ?? null}, ${draftText}, ${tone ?? null}, ${adCheckStr})
      RETURNING id, review_id, draft_text, tone, ad_check_result, created_at
    `;
    return NextResponse.json({ success: true, draft: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reply-drafts] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 履歴削除（owner 検証）
export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);
    await sql`DELETE FROM review_reply_drafts WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reply-drafts] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
