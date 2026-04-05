import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM employment_rules ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json(rows[0] || null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, content, fileName, version, effectiveDate } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: 'title と content は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // 既存があれば更新
  const existing = await sql`SELECT id FROM employment_rules LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE employment_rules SET
      title = ${title}, content = ${content},
      file_name = ${fileName || null}, version = ${version || null},
      effective_date = ${effectiveDate || null}, updated_at = NOW()
    WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  }

  const rows = await sql`INSERT INTO employment_rules (title, content, file_name, version, effective_date)
    VALUES (${title}, ${content}, ${fileName || null}, ${version || null}, ${effectiveDate || null})
    RETURNING id`;

  return NextResponse.json({ success: true, id: rows[0].id });
}
