import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import {
  ensureQuadrantCriteria,
  seedDefaultsIfEmpty,
  listCriteria,
  createCriterion,
  updateCriterion,
  deleteCriterion,
} from '@/lib/quadrant-criteria';

export const runtime = 'nodejs';

// 象限の判断基準ナレッジ CRUD。owner はセッションから(IDOR防止・per-account 分離)。
// service role 相当(Neon直)＋ user_id=owner スコープで他人のレコードに触れない。

async function getOwner(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

// GET: 自分の基準一覧(quadrant・sort_order 順)。空なら初回デフォルトを投入してから返す。
export async function GET() {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  await seedDefaultsIfEmpty(sql, owner);
  const criteria = await listCriteria(sql, owner);
  return NextResponse.json({ criteria });
}

// POST: 追加(quadrant/title/body)。
export async function POST(req: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  const criterion = await createCriterion(sql, owner, body);
  return NextResponse.json({ criterion });
}

// PATCH: 編集(title/body/enabled/sort_order/quadrant)。id は body に含める。
export async function PATCH(req: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? '').toString();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  const criterion = await updateCriterion(sql, owner, id, body);
  if (!criterion) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ criterion });
}

// DELETE: 削除(?id=...)。
export async function DELETE(req: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  const ok = await deleteCriterion(sql, owner, id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
