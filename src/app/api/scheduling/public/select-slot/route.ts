import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  loadEventByToken,
  loadParticipant,
  parseTimeSlots,
  isValidSlot,
  isValidEmail,
} from '@/lib/scheduling';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';

// 公開API（認証なし）。1対1で本人確認済みの相手が time_slots から1枠を選択。
// status=collecting・本人確認済み必須。提示枠の中からのみ選択可。PII保護。
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const slot = body.slot;

    if (!token || !isValidEmail(email) || !isValidSlot(slot)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
    }

    // 連打制限（IP単位・1分30回）
    if (!rateLimit(`sched:selslot:ip:${ip}`, 30, 60 * 1000).ok) {
      return NextResponse.json({ error: 'リクエストが多すぎます。時間をおいて再度お試しください' }, { status: 429 });
    }

    await ensureSchedulingTables(sql);
    const event = await loadEventByToken(sql, token);
    if (!event || event.status !== 'collecting') {
      return NextResponse.json({ error: '受付は終了しています' }, { status: 403 });
    }
    if (event.type !== 'one_on_one') {
      return NextResponse.json({ error: 'この調整では枠選択はできません' }, { status: 400 });
    }

    const p = await loadParticipant(sql, token, email);
    if (!p) {
      return NextResponse.json({ error: 'まず確認コードで本人確認をしてください' }, { status: 400 });
    }
    if (!p.email_verified_at) {
      return NextResponse.json({ error: '本人確認が必要です' }, { status: 403 });
    }

    // 提示された枠の中からのみ選択可（改竄防止）
    const slots = parseTimeSlots(event.time_slots);
    const match = slots.find((s) => s.start === slot.start && s.end === slot.end);
    if (!match) {
      return NextResponse.json({ error: '提示された枠から選んでください' }, { status: 400 });
    }

    await sql`
      UPDATE scheduling_participants
      SET selected_slot = ${JSON.stringify(match)}::jsonb, responded_at = now()
      WHERE id = ${p.id}
    `;

    // オーナーに通知（fire-and-forget）
    await notify({
      userId: event.owner_user_id,
      title: '🗓️ 面談枠が選択されました',
      message: `「${event.title}」: ${match.start.replace('T', ' ')} が選択されました`,
      href: `/dashboard/scheduling/${token}`,
      type: 'info',
    });

    return NextResponse.json({ ok: true, selected: match });
  } catch (e) {
    console.error('[scheduling/public/select-slot]', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
