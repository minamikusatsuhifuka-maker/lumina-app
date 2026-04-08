import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const keyword = searchParams.get('keyword') ?? '';

  let rows;
  if (keyword) {
    const pattern = `%${keyword}%`;
    rows = await sql`SELECT * FROM memory_items WHERE user_id = ${userId} AND (summary ILIKE ${pattern} OR keywords ILIKE ${pattern} OR source_title ILIKE ${pattern}) ORDER BY created_at DESC LIMIT ${limit}`;
  } else {
    rows = await sql`SELECT * FROM memory_items WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
  }

  return NextResponse.json(rows);
}

// 全件削除
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const body = await req.json().catch(() => ({}));
  if (body.deleteAll) {
    await sql`DELETE FROM memory_items WHERE user_id = ${userId}`;
  }
  return NextResponse.json({ ok: true });
}
