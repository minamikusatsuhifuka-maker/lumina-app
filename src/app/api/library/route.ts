import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { neon } from '@neondatabase/serverless';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const q = req.nextUrl.searchParams.get('q')?.trim();

  if (q) {
    const rows = await sql`
      SELECT *, CASE
        WHEN title ILIKE ${'%' + q + '%'} THEN 1
        WHEN content ILIKE ${'%' + q + '%'} THEN 2
        ELSE 3
      END as relevance
      FROM library
      WHERE user_id = ${userId}
        AND (title ILIKE ${'%' + q + '%'} OR content ILIKE ${'%' + q + '%'})
      ORDER BY relevance ASC, created_at DESC
      LIMIT 50
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`SELECT * FROM library WHERE user_id = ${userId} ORDER BY is_favorite DESC, created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, title, content, metadata, tags, group_name, is_favorite, folder_name } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  const userId = (session.user as any).id;
  await sql`INSERT INTO library (id, user_id, type, title, content, metadata, tags, group_name, is_favorite, folder_name)
    VALUES (${id}, ${userId}, ${type}, ${title}, ${content || ''}, ${JSON.stringify(metadata || {})}, ${tags || ''}, ${group_name || '未分類'}, ${is_favorite ? 1 : 0}, ${folder_name || null})`;

  // ライブラリ保存後に通知作成（非同期・ノンブロッキング）
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  fetch(`${baseUrl}/api/notifications/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      title: '📚 ライブラリに保存しました',
      message: title ?? '',
      type: 'success',
      href: '/dashboard/library',
    }),
  }).catch(() => {});

  // ライブラリ保存後に非同期でメモリ化（レスポンスを待たない）
  fetch(`${baseUrl}/api/memory/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      content: content || '',
      title: title ?? '',
      sourceType: group_name ?? 'library',
      category: group_name ?? 'general',
    }),
  }).catch(() => {}); // エラーは無視

  return NextResponse.json({ success: true, id });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, is_favorite, tags, group_name, title, folder_name } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  if (is_favorite !== undefined) {
    await sql`UPDATE library SET is_favorite = ${is_favorite} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (tags !== undefined) {
    await sql`UPDATE library SET tags = ${tags} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (group_name !== undefined) {
    await sql`UPDATE library SET group_name = ${group_name} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (title !== undefined) {
    await sql`UPDATE library SET title = ${title} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (folder_name !== undefined) {
    await sql`UPDATE library SET folder_name = ${folder_name} WHERE id = ${id} AND user_id = ${userId}`;
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`DELETE FROM library WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
