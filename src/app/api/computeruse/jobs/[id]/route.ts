import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// Computer Use ジョブ個別 API
// GET   /api/computeruse/jobs/:id  -> ジョブ詳細（UI用、ユーザー認証）
// PATCH /api/computeruse/jobs/:id  -> ジョブ更新（Worker用、X-Worker-Key）

function checkWorkerKey(req: NextRequest): boolean {
  const key = req.headers.get('x-worker-key');
  const expected = process.env.XLUMINA_WORKER_API_KEY;
  if (!key || !expected) return false;
  return key === expected;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: '不正なIDです' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    const rows = await sql`
      SELECT id, user_id, task_type, target_service, status, source_id, params,
             screenshots, result_url, result_data, error_message, cost_jpy,
             retry_count, started_at, completed_at, created_at, updated_at
      FROM computeruse_sessions
      WHERE id = ${id} AND user_id = ${userId}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 });
    }

    const r: any = rows[0];
    return NextResponse.json({
      job: {
        id: r.id,
        taskType: r.task_type,
        targetService: r.target_service,
        status: r.status,
        sourceId: r.source_id,
        params: r.params,
        screenshots: r.screenshots,
        resultUrl: r.result_url,
        resultData: r.result_data,
        errorMessage: r.error_message,
        costJpy: r.cost_jpy,
        retryCount: r.retry_count,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkWorkerKey(req)) {
    return NextResponse.json({ error: 'Worker key required' }, { status: 401 });
  }

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: '不正なIDです' }, { status: 400 });
    }

    const body = await req.json();
    const { status, resultUrl, resultData, errorMessage, costJpy, screenshot } = body;

    const sql = neon(process.env.DATABASE_URL!);

    // 存在確認
    const existing = await sql`
      SELECT id, screenshots FROM computeruse_sessions WHERE id = ${id}
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 });
    }

    // スクショ追加（既存配列に push）
    if (screenshot) {
      const current = (existing[0].screenshots as any) || [];
      const next = [...current, { ts: new Date().toISOString(), ...screenshot }];
      await sql`
        UPDATE computeruse_sessions
        SET screenshots = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    // ステータス遷移＆結果更新
    if (status === 'completed') {
      await sql`
        UPDATE computeruse_sessions
        SET status = 'completed',
            result_url = ${resultUrl || null},
            result_data = ${resultData ? JSON.stringify(resultData) : null}::jsonb,
            cost_jpy = ${costJpy || null},
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (status === 'failed') {
      await sql`
        UPDATE computeruse_sessions
        SET status = 'failed',
            error_message = ${errorMessage || 'unknown error'},
            cost_jpy = ${costJpy || null},
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (status === 'running') {
      // 単なる進捗更新（スクショ追加など）
      await sql`
        UPDATE computeruse_sessions
        SET updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '更新に失敗しました' }, { status: 500 });
  }
}
