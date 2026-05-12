import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const logs = await sql`
    SELECT * FROM integration_logs
    WHERE user_id = ${userId}
    ORDER BY executed_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ logs });
}
