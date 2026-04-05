import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const status = searchParams.get('status');

  let rows;
  if (category && status) {
    rows = await sql`SELECT * FROM strategies WHERE category = ${category} AND status = ${status} ORDER BY priority DESC, updated_at DESC`;
  } else if (category) {
    rows = await sql`SELECT * FROM strategies WHERE category = ${category} ORDER BY priority DESC, updated_at DESC`;
  } else if (status) {
    rows = await sql`SELECT * FROM strategies WHERE status = ${status} ORDER BY priority DESC, updated_at DESC`;
  } else {
    rows = await sql`SELECT * FROM strategies ORDER BY priority DESC, updated_at DESC`;
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { title, category, description, goal, background, priority, startDate, targetDate } = body;
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO strategies (id, title, category, description, goal, background, priority, start_date, target_date)
    VALUES (${id}, ${title}, ${category || null}, ${description || null}, ${goal || null}, ${background || null}, ${priority || 'medium'}, ${startDate || null}, ${targetDate || null})`;

  return NextResponse.json({ success: true, id });
}
