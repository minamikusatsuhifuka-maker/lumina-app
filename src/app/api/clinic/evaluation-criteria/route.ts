import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  const gradeId = req.nextUrl.searchParams.get('gradeId');
  if (gradeId) {
    const rows = await sql`SELECT * FROM evaluation_criteria WHERE grade_id = ${gradeId} ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  }

  const rows = await sql`SELECT * FROM evaluation_criteria ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { gradeId, categories } = body;
  if (!gradeId || !categories) return NextResponse.json({ error: 'gradeId と categories は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO evaluation_criteria (id, grade_id, categories)
    VALUES (${id}, ${gradeId}, ${categories})`;

  return NextResponse.json({ success: true, id });
}
