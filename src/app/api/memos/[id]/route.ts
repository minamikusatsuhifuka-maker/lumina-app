import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: 1件の修正 / 削除。
// PATCH = AIの提案を「人が上書き」(象限・カテゴリ・重要度・種別・状態)。Next.js: params は Promise。

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  // 上書き可能フィールドを正規化(未指定は現値維持: COALESCE)
  const status = ['inbox', 'triaged', 'done', 'archived'].includes(body.status) ? body.status : null;
  const kind = ['task', 'idea', 'note', 'reference'].includes(body.kind) ? body.kind : null;
  const importance = typeof body.importance === 'number' ? Math.min(5, Math.max(1, Math.round(body.importance))) : null;
  const urgency = typeof body.urgency === 'number' ? Math.min(5, Math.max(1, Math.round(body.urgency))) : null;
  const quadrant = typeof body.quadrant === 'number' && body.quadrant >= 1 && body.quadrant <= 4 ? Math.round(body.quadrant) : null;
  const rawText = typeof body.raw_text === 'string' ? body.raw_text : null;
  const aiSummary = typeof body.ai_summary === 'string' ? body.ai_summary : null;
  // category_id / goal_ref は null での明示クリアを許可するため has フラグで判定
  const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category_id');
  const categoryId = hasCategory ? (body.category_id || null) : null;
  const hasGoal = Object.prototype.hasOwnProperty.call(body, 'goal_ref');
  const goalRef = hasGoal ? (body.goal_ref || null) : null;
  // due_at(AI抽出日時)の人手編集・クリア(human-in-the-loop)。null で終日/日時クリア。
  const hasDueAt = Object.prototype.hasOwnProperty.call(body, 'due_at');
  const dueAt = hasDueAt ? (body.due_at || null) : null;
  const hasTime = typeof body.has_time === 'boolean' ? body.has_time : null;

  const rows = await sql`
    UPDATE memos SET
      status      = COALESCE(${status}, status),
      kind        = COALESCE(${kind}, kind),
      importance  = COALESCE(${importance}::int, importance),
      urgency     = COALESCE(${urgency}::int, urgency),
      quadrant    = COALESCE(${quadrant}::int, quadrant),
      raw_text    = COALESCE(${rawText}, raw_text),
      ai_summary  = COALESCE(${aiSummary}, ai_summary),
      category_id = CASE WHEN ${hasCategory} THEN ${categoryId}::uuid ELSE category_id END,
      goal_ref    = CASE WHEN ${hasGoal} THEN ${goalRef}::uuid ELSE goal_ref END,
      due_at      = CASE WHEN ${hasDueAt} THEN ${dueAt}::timestamptz ELSE due_at END,
      has_time    = COALESCE(${hasTime}::boolean, has_time)
    WHERE id = ${id} AND owner = ${owner}
    RETURNING *
  `;
  if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ memo: rows[0] });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  // memo_todos は ON DELETE CASCADE で連動削除
  await sql`DELETE FROM memos WHERE id = ${id} AND owner = ${owner}`;
  return NextResponse.json({ success: true });
}
