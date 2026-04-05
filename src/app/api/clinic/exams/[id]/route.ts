import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const [examRows, resultRows] = await Promise.all([
    sql`SELECT * FROM exams WHERE id = ${id}`,
    sql`SELECT r.*, s.name as staff_name
        FROM staff_exam_results r
        LEFT JOIN staff s ON s.id = r.staff_id
        WHERE r.exam_id = ${id}
        ORDER BY r.created_at DESC`,
  ]);

  if (!examRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...examRows[0],
    results: resultRows,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  if (body.title !== undefined) await sql`UPDATE exams SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}`;
  if (body.description !== undefined) await sql`UPDATE exams SET description = ${body.description}, updated_at = NOW() WHERE id = ${id}`;
  if (body.questions !== undefined) await sql`UPDATE exams SET questions = ${body.questions}, updated_at = NOW() WHERE id = ${id}`;
  if (body.passingScore !== undefined) await sql`UPDATE exams SET passing_score = ${body.passingScore}, updated_at = NOW() WHERE id = ${id}`;
  if (body.is_active !== undefined) await sql`UPDATE exams SET is_active = ${body.is_active}, updated_at = NOW() WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM exams WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
