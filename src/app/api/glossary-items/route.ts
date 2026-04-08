import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const industry = searchParams.get('industry');
  const level = searchParams.get('level');

  let rows;
  if (industry && industry !== 'all' && level && level !== 'all') {
    rows = await sql`SELECT * FROM glossary_items WHERE user_id = ${userId} AND industry = ${industry} AND level = ${level} ORDER BY created_at DESC`;
  } else if (industry && industry !== 'all') {
    rows = await sql`SELECT * FROM glossary_items WHERE user_id = ${userId} AND industry = ${industry} ORDER BY created_at DESC`;
  } else if (level && level !== 'all') {
    rows = await sql`SELECT * FROM glossary_items WHERE user_id = ${userId} AND level = ${level} ORDER BY created_at DESC`;
  } else {
    rows = await sql`SELECT * FROM glossary_items WHERE user_id = ${userId} ORDER BY created_at DESC`;
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;

  const items = await req.json();
  let count = 0;

  for (const item of items) {
    const id = uuidv4();
    await sql`INSERT INTO glossary_items (id, user_id, term, reading, definition, industry, level, tags, source_text)
      VALUES (${id}, ${userId}, ${item.term}, ${item.reading || null}, ${item.definition}, ${item.industry || 'general'}, ${item.level || 'beginner'}, ${(item.tags || []).join(',')}, ${item.sourceText || null})`;
    count++;
  }

  return NextResponse.json({ count });
}
