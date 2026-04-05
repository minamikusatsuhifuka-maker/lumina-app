import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM position_definitions ORDER BY name`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, description, responsibilities, requiredBaseSkills, careerPath } = body;
  if (!name) return NextResponse.json({ error: 'name は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // Upsert: 同名があれば更新、なければ新規作成
  const existing = await sql`SELECT id FROM position_definitions WHERE name = ${name}`;
  if (existing.length > 0) {
    await sql`UPDATE position_definitions SET description = ${description || null}, responsibilities = ${responsibilities || null}, required_base_skills = ${requiredBaseSkills || null}, career_path = ${careerPath || null}, updated_at = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const id = uuidv4();
    await sql`INSERT INTO position_definitions (id, name, description, responsibilities, required_base_skills, career_path)
      VALUES (${id}, ${name}, ${description || null}, ${responsibilities || null}, ${requiredBaseSkills || null}, ${careerPath || null})`;
    return NextResponse.json({ success: true, id });
  }
}
