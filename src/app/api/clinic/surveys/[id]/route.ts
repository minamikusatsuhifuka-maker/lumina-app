import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const [surveyRows, responseRows] = await Promise.all([
    sql`SELECT * FROM surveys WHERE id = ${id}`,
    sql`SELECT r.*, s.name as staff_name
        FROM staff_survey_responses r
        LEFT JOIN staff s ON s.id = r.staff_id
        WHERE r.survey_id = ${id}
        ORDER BY r.created_at DESC`,
  ]);

  if (!surveyRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...surveyRows[0],
    responses: responseRows,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  if (body.title !== undefined) await sql`UPDATE surveys SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}`;
  if (body.description !== undefined) await sql`UPDATE surveys SET description = ${body.description}, updated_at = NOW() WHERE id = ${id}`;
  if (body.questions !== undefined) await sql`UPDATE surveys SET questions = ${body.questions}, updated_at = NOW() WHERE id = ${id}`;
  if (body.is_active !== undefined) await sql`UPDATE surveys SET is_active = ${body.is_active}, updated_at = NOW() WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM surveys WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
