import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

// 一覧取得
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const histories = await sql`
    SELECT id, title, created_at, updated_at
    FROM chat_histories
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 20
  `;

  return NextResponse.json(histories);
}

// 保存・更新
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { title, messages, id } = await req.json();

  if (id) {
    await sql`
      UPDATE chat_histories
      SET messages = ${JSON.stringify(messages)}, updated_at = NOW(), title = ${title}
      WHERE id = ${id} AND user_id = ${userId}
    `;
    return NextResponse.json({ id });
  } else {
    const result = await sql`
      INSERT INTO chat_histories (user_id, title, messages)
      VALUES (${userId}, ${title}, ${JSON.stringify(messages)})
      RETURNING id
    `;
    return NextResponse.json({ id: result[0].id });
  }
}

// 削除
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { id } = await req.json();
  await sql`DELETE FROM chat_histories WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ ok: true });
}
