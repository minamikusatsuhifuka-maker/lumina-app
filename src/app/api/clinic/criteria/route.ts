import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM clinic_decision_criteria ORDER BY priority DESC, created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { category, criterion, priority } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO clinic_decision_criteria (id, category, criterion, priority) VALUES (${id}, ${category}, ${criterion}, ${priority || 5})`;
  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, criterion, priority } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  if (criterion !== undefined) await sql`UPDATE clinic_decision_criteria SET criterion = ${criterion} WHERE id = ${id}`;
  if (priority !== undefined) await sql`UPDATE clinic_decision_criteria SET priority = ${priority} WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM clinic_decision_criteria WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
