import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureQuadrantCriteria, replaceDefaults, listCriteria } from '@/lib/quadrant-criteria';

export const runtime = 'nodejs';

// 既定(is_default=true)のみ全削除→クリニック向け既定を再投入。ユーザー追加/編集分(is_default=false)は保持。
// owner スコープ(IDOR防止)。UIの「🔄 デフォルト判断基準を再読込(置換)」から呼ぶ。
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureQuadrantCriteria(sql);
  await replaceDefaults(sql, owner);
  const criteria = await listCriteria(sql, owner);
  return NextResponse.json({ criteria });
}
