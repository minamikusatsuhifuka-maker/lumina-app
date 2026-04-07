import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`DELETE FROM writing_templates WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ ok: true });
}
