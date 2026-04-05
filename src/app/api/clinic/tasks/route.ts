import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const assigneeName = searchParams.get('assigneeName');

  let rows;
  if (status && priority && assigneeName) {
    rows = await sql`SELECT * FROM action_tasks WHERE status = ${status} AND priority = ${priority} AND assignee_name = ${assigneeName} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (status && priority) {
    rows = await sql`SELECT * FROM action_tasks WHERE status = ${status} AND priority = ${priority} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (status && assigneeName) {
    rows = await sql`SELECT * FROM action_tasks WHERE status = ${status} AND assignee_name = ${assigneeName} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (priority && assigneeName) {
    rows = await sql`SELECT * FROM action_tasks WHERE priority = ${priority} AND assignee_name = ${assigneeName} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (status) {
    rows = await sql`SELECT * FROM action_tasks WHERE status = ${status} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (priority) {
    rows = await sql`SELECT * FROM action_tasks WHERE priority = ${priority} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else if (assigneeName) {
    rows = await sql`SELECT * FROM action_tasks WHERE assignee_name = ${assigneeName} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  } else {
    rows = await sql`SELECT * FROM action_tasks ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { title, description, assigneeName, priority, category, strategyId, targetDate } = body;
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO action_tasks (id, title, description, assignee_name, priority, category, strategy_id, due_date)
    VALUES (${id}, ${title}, ${description || null}, ${assigneeName || null}, ${priority || 'medium'}, ${category || null}, ${strategyId || null}, ${targetDate || null})`;

  return NextResponse.json({ success: true, id });
}
