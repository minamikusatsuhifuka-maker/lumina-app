import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { title, message, type, href } = await req.json();

  await sql`
    INSERT INTO notifications (user_id, title, message, type, href)
    VALUES (${userId}, ${title}, ${message ?? ''}, ${type ?? 'info'}, ${href ?? null})
  `;

  return NextResponse.json({ ok: true });
}
