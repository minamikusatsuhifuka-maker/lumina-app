import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM action_tasks WHERE strategy_id = ${id} ORDER BY priority DESC, created_at`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { title, description, assigneeName, priority, dueInDays, category } = body;
  if (!title) return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const taskId = uuidv4();
  const dueDate = dueInDays ? new Date(Date.now() + dueInDays * 86400000).toISOString().slice(0, 10) : null;

  await sql`INSERT INTO action_tasks (id, title, description, assignee_name, priority, due_date, category, strategy_id)
    VALUES (${taskId}, ${title}, ${description || null}, ${assigneeName || null}, ${priority || 'medium'}, ${dueDate}, ${category || null}, ${id})`;

  return NextResponse.json({ success: true, id: taskId });
}
