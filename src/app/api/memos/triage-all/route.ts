import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables, triageMemo } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: インボックス(status=inbox)を一括 AI判定。件数上限+直列でレート配慮。

const MAX_BATCH = 15;

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  const list = (await sql`
    SELECT id, raw_text FROM memos
    WHERE owner = ${owner} AND status = 'inbox'
    ORDER BY created_at LIMIT ${MAX_BATCH}
  `) as unknown as { id: string; raw_text: string }[];

  let triaged = 0;
  let failed = 0;
  for (const memo of list) {
    try {
      const r = await triageMemo(sql, owner, memo);
      if (r.fallback) failed++;
      else triaged++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ total: list.length, triaged, failed, capped: list.length >= MAX_BATCH });
}
