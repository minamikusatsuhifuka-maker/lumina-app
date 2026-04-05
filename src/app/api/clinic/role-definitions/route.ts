import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM role_definitions ORDER BY level_order`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, levelOrder, description, responsibilities, authority, leadershipRequirements } = body;
  if (!name) return NextResponse.json({ error: 'name は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // Upsert: 同名があれば更新、なければ新規作成
  const existing = await sql`SELECT id FROM role_definitions WHERE name = ${name}`;
  if (existing.length > 0) {
    await sql`UPDATE role_definitions SET level_order = ${levelOrder || null}, description = ${description || null}, responsibilities = ${responsibilities || null}, authority = ${authority || null}, leadership_requirements = ${leadershipRequirements || null}, updated_at = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const id = uuidv4();
    await sql`INSERT INTO role_definitions (id, name, level_order, description, responsibilities, authority, leadership_requirements)
      VALUES (${id}, ${name}, ${levelOrder || null}, ${description || null}, ${responsibilities || null}, ${authority || null}, ${leadershipRequirements || null})`;
    return NextResponse.json({ success: true, id });
  }
}
