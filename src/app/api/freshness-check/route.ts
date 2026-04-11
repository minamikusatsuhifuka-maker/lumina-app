import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;

  try {
    // 30日以上前に保存されたアイテム
    const stale = await sql`
      SELECT id, title, type, tags, group_name, created_at
      FROM library
      WHERE user_id = ${userId}
        AND created_at < NOW() - INTERVAL '30 days'
        AND created_at >= NOW() - INTERVAL '90 days'
      ORDER BY created_at ASC
      LIMIT 50
    `;

    // 90日以上前に保存されたアイテム
    const veryStale = await sql`
      SELECT id, title, type, tags, group_name, created_at
      FROM library
      WHERE user_id = ${userId}
        AND created_at < NOW() - INTERVAL '90 days'
      ORDER BY created_at ASC
      LIMIT 50
    `;

    return NextResponse.json({
      stale,
      veryStale,
      totalStale: stale.length + veryStale.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `鮮度チェックに失敗しました: ${msg}` }, { status: 500 });
  }
}
