import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// GET /api/feature-default-contexts/by-context-save?contextSaveId=5
// 用途: コンテキストライブラリで各カードに「どの機能に登録済みか」を表示
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const contextSaveId = searchParams.get('contextSaveId');
    if (!contextSaveId) {
      return NextResponse.json({ error: 'contextSaveId が必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    const rows = await sql`
      SELECT feature_key
      FROM feature_default_contexts
      WHERE user_id = ${userId}
        AND context_save_id = ${parseInt(contextSaveId, 10)}
    `;

    return NextResponse.json({ featureKeys: rows.map((r: any) => r.feature_key) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}
