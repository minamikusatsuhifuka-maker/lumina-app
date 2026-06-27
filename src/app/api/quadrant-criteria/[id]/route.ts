import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureQuadrantCriteria, updateCriterion, deleteCriterion } from '@/lib/quadrant-criteria';

export const runtime = 'nodejs';

// 象限の判断基準: 個別更新/削除。owner スコープで他人の id に触れない(IDOR防止)。
type Ctx = { params: Promise<{ id: string }> };

async function getOwner(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

// PATCH: 編集(title/body/enabled/sort_order/quadrant)。
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  const criterion = await updateCriterion(sql, owner, id, body);
  if (!criterion) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ criterion });
}

// DELETE: 削除。
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  const ok = await deleteCriterion(sql, owner, id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
