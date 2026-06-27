import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import {
  ensureQuadrantCriteria,
  seedDefaultsIfEmpty,
  migrateDefaults,
  listCriteria,
  createCriterion,
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
  // 旧・汎用デフォルトのみ持つ owner は一度だけクリニック向けへ置換(編集/追加分は保護)。二度目以降はno-op。
  await migrateDefaults(sql, owner);
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

// PATCH/DELETE は個別ルート /api/quadrant-criteria/[id] を参照。
