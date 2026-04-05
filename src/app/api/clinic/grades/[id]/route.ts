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

  const updates: [string, unknown][] = [];
  const map: Record<string, string> = {
    name: 'name', levelNumber: 'level_number', description: 'description',
    requirementsPromotion: 'requirements_promotion', requirementsDemotion: 'requirements_demotion',
    salaryMin: 'salary_min', salaryMax: 'salary_max',
    position: 'position', role: 'role',
    skills: 'skills', knowledge: 'knowledge', mindset: 'mindset',
    continuousLearning: 'continuous_learning', requiredCertifications: 'required_certifications',
    promotionExam: 'promotion_exam', aiChatHistory: 'ai_chat_history',
  };

  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) updates.push([col, body[key]]);
  }

  for (const [col, val] of updates) {
    const v = val as string;
    if (col === 'name') await sql`UPDATE grade_levels SET name = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'level_number') await sql`UPDATE grade_levels SET level_number = ${Number(v)}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'description') await sql`UPDATE grade_levels SET description = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'requirements_promotion') await sql`UPDATE grade_levels SET requirements_promotion = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'requirements_demotion') await sql`UPDATE grade_levels SET requirements_demotion = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'salary_min') await sql`UPDATE grade_levels SET salary_min = ${Number(v)}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'salary_max') await sql`UPDATE grade_levels SET salary_max = ${Number(v)}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'position') await sql`UPDATE grade_levels SET position = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'role') await sql`UPDATE grade_levels SET role = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'skills') await sql`UPDATE grade_levels SET skills = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'knowledge') await sql`UPDATE grade_levels SET knowledge = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'mindset') await sql`UPDATE grade_levels SET mindset = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'continuous_learning') await sql`UPDATE grade_levels SET continuous_learning = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'required_certifications') await sql`UPDATE grade_levels SET required_certifications = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'promotion_exam') await sql`UPDATE grade_levels SET promotion_exam = ${v}, updated_at = NOW() WHERE id = ${id}`;
    else if (col === 'ai_chat_history') await sql`UPDATE grade_levels SET ai_chat_history = ${v}, updated_at = NOW() WHERE id = ${id}`;
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
