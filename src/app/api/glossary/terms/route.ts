import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// glossary_terms（リサーチ用語集）の一覧・更新・削除API

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const bookmarked = searchParams.get('bookmarked');

  let terms;
  if (category && category !== 'all') {
    terms = await sql`
      SELECT * FROM glossary_terms
      WHERE user_id = ${userId} AND category = ${category}
      ORDER BY created_at DESC
    `;
  } else if (search) {
    const like = `%${search}%`;
    terms = await sql`
      SELECT * FROM glossary_terms
      WHERE user_id = ${userId}
        AND (term ILIKE ${like} OR explanation ILIKE ${like})
      ORDER BY created_at DESC
    `;
  } else if (bookmarked === 'true') {
    terms = await sql`
      SELECT * FROM glossary_terms
      WHERE user_id = ${userId} AND is_bookmarked = TRUE
      ORDER BY created_at DESC
    `;
  } else {
    terms = await sql`
      SELECT * FROM glossary_terms
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }
  return NextResponse.json({ terms });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, isBookmarked, incrementReview } = await req.json();
    if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    const termId = parseInt(id, 10);

    if (incrementReview) {
      await sql`
        UPDATE glossary_terms
        SET review_count = review_count + 1, last_reviewed_at = NOW()
        WHERE id = ${termId} AND user_id = ${userId}
      `;
    }
    if (isBookmarked !== undefined) {
      await sql`
        UPDATE glossary_terms
        SET is_bookmarked = ${!!isBookmarked}
        WHERE id = ${termId} AND user_id = ${userId}
      `;
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'エラー' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`DELETE FROM glossary_terms WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
