import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// PATCH /api/clinic/handbooks/[id]/lock — ロック状態をtoggle
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // 現在のis_lockedを取得してtoggle
  const current = await sql`SELECT is_locked FROM handbooks WHERE id = ${id}`;
  if (!current[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newLocked = !current[0].is_locked;
  await sql`UPDATE handbooks SET is_locked = ${newLocked} WHERE id = ${id}`;

  return NextResponse.json({ is_locked: newLocked });
}
