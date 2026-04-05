import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  if (body.status !== undefined) {
    await sql`UPDATE action_tasks SET status = ${body.status}, updated_at = NOW() WHERE id = ${id}`;
    if (body.status === 'done') {
      await sql`UPDATE action_tasks SET completed_at = NOW() WHERE id = ${id}`;
    }
  }
  if (body.title !== undefined) await sql`UPDATE action_tasks SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}`;
  if (body.description !== undefined) await sql`UPDATE action_tasks SET description = ${body.description}, updated_at = NOW() WHERE id = ${id}`;
  if (body.assigneeName !== undefined) await sql`UPDATE action_tasks SET assignee_name = ${body.assigneeName}, updated_at = NOW() WHERE id = ${id}`;
  if (body.priority !== undefined) await sql`UPDATE action_tasks SET priority = ${body.priority}, updated_at = NOW() WHERE id = ${id}`;
  if (body.category !== undefined) await sql`UPDATE action_tasks SET category = ${body.category}, updated_at = NOW() WHERE id = ${id}`;
  if (body.memo !== undefined) await sql`UPDATE action_tasks SET memo = ${body.memo}, updated_at = NOW() WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM action_tasks WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
