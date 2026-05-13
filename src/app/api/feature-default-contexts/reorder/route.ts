import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// PATCH /api/feature-default-contexts/reorder
// Body: { featureKey: 'kindle', orderedIds: [3, 1, 5, 2] }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { featureKey, orderedIds } = await req.json();
    if (!featureKey || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'featureKey と orderedIds は必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // 配列順に display_order を更新
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`
        UPDATE feature_default_contexts
        SET display_order = ${i}, updated_at = NOW()
        WHERE id = ${parseInt(orderedIds[i], 10)}
          AND user_id = ${userId}
          AND feature_key = ${featureKey}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '並び替えに失敗しました' }, { status: 500 });
  }
}
