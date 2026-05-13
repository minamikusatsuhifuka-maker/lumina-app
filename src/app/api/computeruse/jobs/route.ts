import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// Computer Use ジョブキュー API
// GET    /api/computeruse/jobs?status=queued        -> ジョブ一覧（UI用、ユーザー認証必要）
// GET    /api/computeruse/jobs?pending=1            -> pending な1件取得（Worker用、X-Worker-Key必要）
// POST   /api/computeruse/jobs                      -> 新規ジョブ作成（UI用、ユーザー認証必要）

function checkWorkerKey(req: NextRequest): boolean {
  const key = req.headers.get('x-worker-key');
  const expected = process.env.XLUMINA_WORKER_API_KEY;
  if (!key || !expected) return false;
  return key === expected;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pending = searchParams.get('pending');
  const sql = neon(process.env.DATABASE_URL!);

  // === Worker からの pending ジョブ1件取得 ===
  if (pending === '1') {
    if (!checkWorkerKey(req)) {
      return NextResponse.json({ error: 'Worker key required' }, { status: 401 });
    }
    try {
      // FOR UPDATE SKIP LOCKED で複数ワーカー対応（将来用）
      // 今は単一ワーカー想定なので単純な SELECT + UPDATE で十分
      const rows = await sql`
        SELECT id, user_id, task_type, target_service, source_id, params, prompt, retry_count, created_at
        FROM computeruse_sessions
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ job: null });
      }
      const job = rows[0];
      // ステータスを running に遷移
      await sql`
        UPDATE computeruse_sessions
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = ${job.id} AND status = 'queued'
      `;
      return NextResponse.json({
        job: {
          id: job.id,
          userId: job.user_id,
          taskType: job.task_type,
          targetService: job.target_service,
          sourceId: job.source_id,
          params: job.params,
          prompt: job.prompt,
          retryCount: job.retry_count,
          createdAt: job.created_at,
        },
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
    }
  }

  // === UI からの一覧取得 ===
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const userId = (session.user as any).id;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const rows = status
      ? await sql`
          SELECT id, task_type, target_service, status, source_id, result_url, error_message,
                 started_at, completed_at, created_at
          FROM computeruse_sessions
          WHERE user_id = ${userId} AND status = ${status}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, task_type, target_service, status, source_id, result_url, error_message,
                 started_at, completed_at, created_at
          FROM computeruse_sessions
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

    return NextResponse.json({
      items: rows.map((r: any) => ({
        id: r.id,
        taskType: r.task_type,
        targetService: r.target_service,
        status: r.status,
        sourceId: r.source_id,
        resultUrl: r.result_url,
        errorMessage: r.error_message,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { taskType, targetService, sourceId, params, prompt } = body;

    if (!taskType || !targetService) {
      return NextResponse.json({ error: 'taskType と targetService は必須です' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'prompt は必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // 1日あたりの実行数チェック（rate limit: 10件/日）
    const today = await sql`
      SELECT COUNT(*) AS count
      FROM computeruse_sessions
      WHERE user_id = ${userId}
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    const todayCount = parseInt(today[0].count as any, 10);
    if (todayCount >= 10) {
      return NextResponse.json(
        { error: '本日の実行上限（10件）に達しました。明日以降に再度お試しください。' },
        { status: 429 }
      );
    }

    const result = await sql`
      INSERT INTO computeruse_sessions
        (user_id, task_type, target_service, status, source_id, params, prompt)
      VALUES
        (${userId}, ${taskType}, ${targetService}, 'queued', ${sourceId || null},
         ${params ? JSON.stringify(params) : null}::jsonb, ${prompt})
      RETURNING id, created_at
    `;

    return NextResponse.json({
      success: true,
      id: result[0].id,
      createdAt: result[0].created_at,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '作成に失敗しました' }, { status: 500 });
  }
}
