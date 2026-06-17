import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  loadEventByToken,
  loadParticipant,
  isValidEmail,
} from '@/lib/scheduling';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 公開API（認証なし）。本人（token×自分のemail）の登録状況・自分のNG日のみ返す。
// 他参加者のメール・NG日は一切返さない（PII保護）。NG日は本人確認済みのときのみ返す。
// email はURLに載せず POST ボディで受ける（ログ・履歴流出を避ける）。
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!token || !isValidEmail(email)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
    }

    // 照会連打の制限（IP単位・1分60回）
    if (!rateLimit(`sched:me:ip:${ip}`, 60, 60 * 1000).ok) {
      return NextResponse.json({ error: 'リクエストが多すぎます' }, { status: 429 });
    }

    await ensureSchedulingTables(sql);
    const event = await loadEventByToken(sql, token);
    if (!event) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const p = await loadParticipant(sql, token, email);
    const registered = !!p;
    const verified = !!p?.email_verified_at;
    const responded = !!p?.responded_at;

    // NG日は「本人確認済み」のときのみ返す（自分の participant_id 分のみ）
    let ngDates: string[] = [];
    if (p && verified) {
      const rows = await sql`
        SELECT ng_date FROM scheduling_ng_dates
        WHERE participant_id = ${p.id}
        ORDER BY ng_date ASC
      `;
      ngDates = rows.map((r: Record<string, unknown>) => {
        const v = r.ng_date;
        return typeof v === 'string' ? v.slice(0, 10) : new Date(v as string).toISOString().slice(0, 10);
      });
    }

    return NextResponse.json({
      status: event.status,
      registered,
      verified,
      responded,
      ngDates,
    });
  } catch (e) {
    console.error('[scheduling/public/me]', e);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
