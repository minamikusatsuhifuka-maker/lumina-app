import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  canTransition,
  parseCandidateDates,
  isValidDateStr,
  type SchedulingStatus,
} from '@/lib/scheduling';
import { sendEmail, renderEmailLayout, escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 120;

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function dateLabelJa(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(y, (m || 1) - 1, day || 1).getDay();
  return `${y}年${m}月${day}日（${WEEK[wd] ?? ''}）`;
}

// ⑥ 確定・全員通知（要auth・オーナーのみ）。
// 確定日をセット → 検証済み参加者にメール → 記録 → notified。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const body = await req.json().catch(() => ({}));
  const date = typeof body.date === 'string' ? body.date : '';
  if (!isValidDateStr(date)) {
    return NextResponse.json({ error: '確定日が不正です' }, { status: 400 });
  }

  const events = await sql`
    SELECT id, title, description, status, candidate_dates
    FROM scheduling_events
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;
  if (events.length === 0) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  const event = events[0];
  const current = event.status as SchedulingStatus;

  // ready（1対1短縮は collecting も可）→ finalized
  if (!canTransition(current, 'finalized')) {
    return NextResponse.json(
      { error: `現在の状態(${current})では確定できません` },
      { status: 409 }
    );
  }

  // 確定日は候補日（算出後 or 既存候補）の中から
  const candidates = parseCandidateDates(event.candidate_dates);
  if (candidates.length > 0 && !candidates.includes(date)) {
    return NextResponse.json({ error: '確定日は候補日の中から選んでください' }, { status: 400 });
  }

  // 確定をセット（status→finalized）
  await sql`
    UPDATE scheduling_events
    SET finalized_date = ${`${date}T00:00:00Z`}, status = 'finalized', updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;

  // 宛先＝DBの検証済み参加者のみ（外部入力をそのまま使わない）
  const participants = await sql`
    SELECT id, email FROM scheduling_participants
    WHERE event_id = ${id} AND email_verified_at IS NOT NULL
  `;

  const safeTitle = escapeHtml(event.title);
  const safeDate = dateLabelJa(date);
  const html = renderEmailLayout({
    title: '日程が確定しました',
    bodyHtml: `<p>日程調整「${safeTitle}」の開催日が確定しました。</p>
      <p style="font-size:20px;font-weight:700;color:#1f2433;margin:14px 0;">📅 ${escapeHtml(safeDate)}</p>
      ${event.description ? `<p style="color:#5a6075;">${escapeHtml(String(event.description))}</p>` : ''}
      <p style="color:#9098ad;font-size:12px;">ご都合が合わなくなった場合は主催者までご連絡ください。</p>`,
  });

  let sent = 0;
  let failed = 0;
  for (const p of participants) {
    const r = await sendEmail({
      to: p.email,
      subject: `【xLUMINA】日程確定のお知らせ: ${event.title}`,
      text: `日程調整「${event.title}」の開催日が ${safeDate} に確定しました。`,
      html,
    });
    await sql`
      INSERT INTO scheduling_notifications (event_id, participant_id, kind, status)
      VALUES (${id}, ${p.id}, 'finalized', ${r.ok ? 'sent' : 'failed'})
    `;
    if (r.ok) sent++;
    else failed++;
  }

  // 送信失敗があっても finalized は維持。全処理後 notified に。
  await sql`
    UPDATE scheduling_events
    SET status = 'notified', updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;

  return NextResponse.json({
    ok: true,
    status: 'notified',
    finalizedDate: date,
    recipients: participants.length,
    sent,
    failed,
  });
}
