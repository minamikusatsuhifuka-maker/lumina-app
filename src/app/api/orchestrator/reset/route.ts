import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ResetRequest {
  jobId: number;
}

// 「実行中」のまま固まったジョブを失敗扱いに変更するエンドポイント
// 長時間 running 状態が続いた場合の手動復旧用
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: ResetRequest;
  try {
    body = (await req.json()) as ResetRequest;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const { jobId } = body;
  if (!jobId) {
    return NextResponse.json({ error: 'jobIdが必要です' }, { status: 400 });
  }

  // running状態のジョブのみリセット対象
  const result = await sql`
    UPDATE pipeline_jobs SET
      status = 'failed',
      error_message = '手動リセット',
      updated_at = NOW()
    WHERE id = ${jobId}
      AND user_id = ${userId}
      AND status = 'running'
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    reset: result.length > 0,
  });
}
