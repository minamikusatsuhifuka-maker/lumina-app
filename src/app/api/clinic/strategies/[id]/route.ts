import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const [strategyRows, taskRows] = await Promise.all([
    sql`SELECT * FROM strategies WHERE id = ${id}`,
    sql`SELECT * FROM action_tasks WHERE strategy_id = ${id} ORDER BY priority DESC`,
  ]);

  if (!strategyRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...strategyRows[0],
    tasks: taskRows,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  if (body.title !== undefined) await sql`UPDATE strategies SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}`;
  if (body.category !== undefined) await sql`UPDATE strategies SET category = ${body.category}, updated_at = NOW() WHERE id = ${id}`;
  if (body.description !== undefined) await sql`UPDATE strategies SET description = ${body.description}, updated_at = NOW() WHERE id = ${id}`;
  if (body.goal !== undefined) await sql`UPDATE strategies SET goal = ${body.goal}, updated_at = NOW() WHERE id = ${id}`;
  if (body.background !== undefined) await sql`UPDATE strategies SET background = ${body.background}, updated_at = NOW() WHERE id = ${id}`;
  if (body.status !== undefined) await sql`UPDATE strategies SET status = ${body.status}, updated_at = NOW() WHERE id = ${id}`;
  if (body.priority !== undefined) await sql`UPDATE strategies SET priority = ${body.priority}, updated_at = NOW() WHERE id = ${id}`;
  if (body.startDate !== undefined) await sql`UPDATE strategies SET start_date = ${body.startDate}, updated_at = NOW() WHERE id = ${id}`;
  if (body.targetDate !== undefined) await sql`UPDATE strategies SET target_date = ${body.targetDate}, updated_at = NOW() WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE action_tasks SET strategy_id = NULL WHERE strategy_id = ${id}`;
  await sql`DELETE FROM strategies WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
