import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  canTransition,
  parseCandidateDates,
  parseTimeSlots,
  isValidDateStr,
  isValidSlotDateTime,
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
// 'YYYY-MM-DDTHH:MM' → '2026年6月20日（金）14:00'
function slotLabelJa(dt: string): string {
  const [d, t] = dt.split('T');
  return `${dateLabelJa(d)} ${t}`;
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

  const events = await sql`
    SELECT id, title, description, type, status, candidate_dates, time_slots
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

  // 確定値の決定（1対1=time_slotsの枠 / 複数名=candidate_datesの日付）
  let finalizedTs: string; // DB(timestamptz)へ入れる値
  let finalizedLabel: string; // メール表示
  let finalizedResponse: string; // レスポンス

  if (event.type === 'one_on_one') {
    const slotStart = typeof body.slotStart === 'string' ? body.slotStart : '';
    if (!isValidSlotDateTime(slotStart)) {
      return NextResponse.json({ error: '確定する枠が不正です' }, { status: 400 });
    }
    const slots = parseTimeSlots(event.time_slots);
    if (slots.length > 0 && !slots.some((s) => s.start === slotStart)) {
      return NextResponse.json({ error: '確定枠は提示した枠の中から選んでください' }, { status: 400 });
    }
    finalizedTs = `${slotStart}:00+09:00`; // 壁時計JSTとして確定
    finalizedLabel = slotLabelJa(slotStart);
    finalizedResponse = slotStart;
  } else {
    const date = typeof body.date === 'string' ? body.date : '';
    if (!isValidDateStr(date)) {
      return NextResponse.json({ error: '確定日が不正です' }, { status: 400 });
    }
    const candidates = parseCandidateDates(event.candidate_dates);
    if (candidates.length > 0 && !candidates.includes(date)) {
      return NextResponse.json({ error: '確定日は候補日の中から選んでください' }, { status: 400 });
    }
    finalizedTs = `${date}T00:00:00Z`;
    finalizedLabel = dateLabelJa(date);
    finalizedResponse = date;
  }

  // 確定をセット（status→finalized）
  await sql`
    UPDATE scheduling_events
    SET finalized_date = ${finalizedTs}, status = 'finalized', updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;

  // 宛先＝DBの検証済み参加者のみ（外部入力をそのまま使わない）
  const participants = await sql`
    SELECT id, email FROM scheduling_participants
    WHERE event_id = ${id} AND email_verified_at IS NOT NULL
  `;

  const safeTitle = escapeHtml(event.title);
  const safeDate = finalizedLabel;
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

  // 1対1は主催者（オーナー）にも確定メールを送る（双方通知）
  if (event.type === 'one_on_one') {
    const owners = await sql`SELECT email FROM users WHERE id = ${userId}`;
    const ownerEmail = owners[0]?.email as string | undefined;
    if (ownerEmail) {
      const r = await sendEmail({
        to: ownerEmail,
        subject: `【xLUMINA】面談日程の確定: ${event.title}`,
        text: `面談「${event.title}」の日程が ${safeDate} に確定しました。`,
        html,
      });
      await sql`
        INSERT INTO scheduling_notifications (event_id, participant_id, kind, status)
        VALUES (${id}, ${null}, 'finalized', ${r.ok ? 'sent' : 'failed'})
      `;
      if (r.ok) sent++;
      else failed++;
    }
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
    finalizedDate: finalizedResponse,
    recipients: participants.length,
    sent,
    failed,
  });
}
