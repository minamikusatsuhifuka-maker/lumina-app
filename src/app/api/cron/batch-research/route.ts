import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 60;

// Vercel Cronから毎分呼ばれて、予約された'cron'ジョブを起動するAPI
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const now = new Date();

  // 実行時刻に達した pending の cron ジョブを取得
  const pendingJobs = await sql`
    SELECT id FROM batch_research_jobs
    WHERE schedule_type = 'cron'
      AND status = 'pending'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= ${now.toISOString()}
    ORDER BY scheduled_at ASC
    LIMIT 5
  `;

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://xlumina.jp';

  const triggered: number[] = [];
  for (const job of pendingJobs) {
    try {
      // 待たずに発火だけする（fire-and-forget）
      fetch(`${baseUrl}/api/batch-research/${job.id}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
      }).catch((e) => console.error('[cron/batch-research] fetch失敗:', e));
      triggered.push(job.id as number);
    } catch (e) {
      console.error('[cron/batch-research] 起動失敗:', e);
    }
  }

  return NextResponse.json({ triggered, count: triggered.length });
}
