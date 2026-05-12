import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const [s] = await sql`
      SELECT * FROM automation_sessions
      WHERE id = ${parseInt(id)} AND user_id = ${userId}
    `;
    return NextResponse.json({ session: s ?? null });
  }

  const sessions = await sql`
    SELECT id, title, domain, status,
      strategy_output IS NOT NULL as has_strategy,
      report_output IS NOT NULL as has_report,
      jsonb_array_length(messages) as message_count,
      created_at, updated_at
    FROM automation_sessions WHERE user_id = ${userId}
    ORDER BY updated_at DESC LIMIT 30
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
