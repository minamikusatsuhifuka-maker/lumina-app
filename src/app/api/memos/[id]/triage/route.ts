import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables, triageMemo } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: 1件を AI判定(Gemini)→ 保存(status=triaged)。task なら todos も生成。
// GEMINI未設定/AI失敗時はメモ保存はそのまま(triageは後追い可)。

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  const rows = (await sql`SELECT id, raw_text FROM memos WHERE id = ${id} AND owner = ${owner}`) as unknown as { id: string; raw_text: string }[];
  if (rows.length === 0) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 });

  try {
    const result = await triageMemo(sql, owner, rows[0]);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'triage failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
