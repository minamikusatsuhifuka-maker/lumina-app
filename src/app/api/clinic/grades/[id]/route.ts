import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM grade_levels WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  const allowedFields: Record<string, string> = {
    name: 'name',
    levelNumber: 'level_number',
    description: 'description',
    requirementsPromotion: 'requirements_promotion',
    requirementsDemotion: 'requirements_demotion',
    salaryMin: 'salary_min',
    salaryMax: 'salary_max',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (body[key] !== undefined) {
      const val = body[key];
      // 各カラムを個別に更新
      if (col === 'name') await sql`UPDATE grade_levels SET name = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'level_number') await sql`UPDATE grade_levels SET level_number = ${val as number}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'description') await sql`UPDATE grade_levels SET description = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'requirements_promotion') await sql`UPDATE grade_levels SET requirements_promotion = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'requirements_demotion') await sql`UPDATE grade_levels SET requirements_demotion = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'salary_min') await sql`UPDATE grade_levels SET salary_min = ${val as number}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'salary_max') await sql`UPDATE grade_levels SET salary_max = ${val as number}, updated_at = NOW() WHERE id = ${id}`;
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM grade_levels WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
