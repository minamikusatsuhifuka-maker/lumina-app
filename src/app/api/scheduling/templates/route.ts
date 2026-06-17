import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSchedulingTables } from '@/lib/scheduling';

export const runtime = 'nodejs';

// 説明文テンプレート（作成者単位・要auth）。テンプレは小規模なので一覧で body も返す。

// GET: 自分のテンプレ一覧
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const rows = await sql`
    SELECT id, title, body, updated_at
    FROM scheduling_description_templates
    WHERE created_by = ${userId}
    ORDER BY updated_at DESC
  `;
  return NextResponse.json({ templates: rows });
}

// POST: 作成 { title, body }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body : '';
  if (!title) return NextResponse.json({ error: 'テンプレ名が必要です' }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: '本文が空です' }, { status: 400 });

  const rows = await sql`
    INSERT INTO scheduling_description_templates (created_by, title, body)
    VALUES (${userId}, ${title}, ${text})
    RETURNING id, title, body, updated_at
  `;
  return NextResponse.json({ template: rows[0] });
}
