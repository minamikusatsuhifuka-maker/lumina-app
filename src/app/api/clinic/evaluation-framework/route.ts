import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT * FROM evaluation_framework WHERE id = 'default'`;
    if (rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const sql = neon(process.env.DATABASE_URL!);
    if (body.mindset_levels !== undefined) {
      await sql`UPDATE evaluation_framework SET mindset_levels = ${JSON.stringify(body.mindset_levels)}::jsonb, updated_at = NOW() WHERE id = 'default'`;
    }
    if (body.real_principles !== undefined) {
      await sql`UPDATE evaluation_framework SET real_principles = ${JSON.stringify(body.real_principles)}::jsonb, updated_at = NOW() WHERE id = 'default'`;
    }
    if (body.score_distribution !== undefined) {
      await sql`UPDATE evaluation_framework SET score_distribution = ${JSON.stringify(body.score_distribution)}::jsonb, updated_at = NOW() WHERE id = 'default'`;
    }
    if (body.grade_system_description !== undefined) {
      // カラムが存在しない場合に追加
      await sql`ALTER TABLE evaluation_framework ADD COLUMN IF NOT EXISTS grade_system_description TEXT`.catch(() => {});
      await sql`UPDATE evaluation_framework SET grade_system_description = ${body.grade_system_description}, updated_at = NOW() WHERE id = 'default'`;
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
