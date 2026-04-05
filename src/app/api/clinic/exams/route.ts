import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM exams ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { title, description, questions, passingScore, targetRole } = body;
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO exams (id, title, description, questions, passing_score, target_role)
    VALUES (${id}, ${title}, ${description || null}, ${questions || '[]'}, ${passingScore || 70}, ${targetRole || null})`;

  return NextResponse.json({ success: true, id });
}
