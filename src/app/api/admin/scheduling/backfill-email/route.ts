import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureSchedulingTables } from '@/lib/scheduling';
import { backfillParticipantEmails, getBackfillStatus } from '@/lib/scheduling/backfill';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 109 ②: 参加者メールのバックフィル（一回限り・冪等・件数報告）。
// 認証: 管理者セッション（users.is_admin）または Authorization: Bearer <CRON_SECRET>。
//   GET  … 進捗の確認だけ（total / withHash / withEnc / remaining）。DB は変えない
//   POST … 実行。body { dryRun?: boolean, eventId?: string }。dryRun は件数だけ返す
// 鍵（SCHEDULING_ENCRYPTION_KEY）未設定でも hash は埋まる。enc は鍵設定後に再実行すれば埋まる（冪等）。

async function authorize(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // CRON_SECRET未設定時に "Bearer undefined" で一致しないようガード
  const bearer = req.headers.get('authorization');
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return { ok: true };

  const session = await auth();
  if (!session?.user?.email) return { ok: false, status: 401, error: 'Unauthorized' };
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT is_admin FROM users WHERE email = ${session.user.email}`;
  if (!rows[0]?.is_admin) return { ok: false, status: 403, error: '管理者のみ実行できます' };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const guard = await authorize(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSchedulingTables(sql);
    const status = await getBackfillStatus(sql);
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    console.error('[admin/scheduling/backfill-email GET]', e);
    return NextResponse.json({ error: '状態の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await authorize(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const eventId = typeof body?.eventId === 'string' && body.eventId ? body.eventId : undefined;
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSchedulingTables(sql);
    const result = await backfillParticipantEmails(sql, { dryRun, eventId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[admin/scheduling/backfill-email POST]', e);
    return NextResponse.json({ error: 'バックフィルに失敗しました' }, { status: 500 });
  }
}
