import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { id, replyText } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

    await sql`
      UPDATE clinic_reviews
      SET replied_at = NOW(), reply_text = ${replyText || null}
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/mark-replied] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
