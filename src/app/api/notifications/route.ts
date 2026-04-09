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

  const notifications = await sql`
    SELECT * FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;
  return NextResponse.json({ notifications, unreadCount });
}

// 既読にする
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { id } = await req.json();

  if (id === 'all') {
    await sql`UPDATE notifications SET is_read = true WHERE user_id = ${userId}`;
  } else {
    await sql`UPDATE notifications SET is_read = true WHERE id = ${id} AND user_id = ${userId}`;
  }

  return NextResponse.json({ ok: true });
}
