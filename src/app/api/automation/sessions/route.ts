import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const sessions = await sql`
    SELECT id, title, domain, status, strategy_output IS NOT NULL as has_output, created_at, updated_at
    FROM automation_sessions WHERE user_id = ${userId}
    ORDER BY updated_at DESC LIMIT 20
  `;
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const { title, domain, messages } = await req.json();

  const [s] = await sql`
    INSERT INTO automation_sessions (user_id, title, domain, messages)
    VALUES (${userId}, ${title ?? '自動化戦略セッション'}, ${domain ?? 'all'}, ${JSON.stringify(messages ?? [])}::jsonb)
    RETURNING *
  `;
  return NextResponse.json({ session: s });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const { id, messages, title } = await req.json();

  const [s] = await sql`
    UPDATE automation_sessions SET
      messages = ${JSON.stringify(messages)}::jsonb,
      title = COALESCE(${title ?? null}, title),
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;
  return NextResponse.json({ session: s });
}
