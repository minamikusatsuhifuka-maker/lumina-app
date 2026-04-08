import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  await sql`DELETE FROM memory_items WHERE id = ${id} AND user_id = ${userId}`;
  return Response.json({ ok: true });
}
