import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM grade_levels ORDER BY level_number ASC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, levelNumber, description, requirementsPromotion, requirementsDemotion, salaryMin, salaryMax } = body;
  if (!name || levelNumber === undefined) return NextResponse.json({ error: 'name と levelNumber は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO grade_levels (id, name, level_number, description, requirements_promotion, requirements_demotion, salary_min, salary_max)
    VALUES (${id}, ${name}, ${levelNumber}, ${description || null}, ${requirementsPromotion || null}, ${requirementsDemotion || null}, ${salaryMin || null}, ${salaryMax || null})`;

  return NextResponse.json({ success: true, id });
}
