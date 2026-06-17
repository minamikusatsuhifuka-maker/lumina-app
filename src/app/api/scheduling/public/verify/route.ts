import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  loadEventByToken,
  loadParticipant,
  verifyOtp,
  isValidEmail,
  OTP_MAX_ATTEMPTS,
} from '@/lib/scheduling';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 公開API（認証なし）。OTP照合 → 一致で email_verified_at セット、OTP無効化（使い捨て）。
// 試行回数制限（5回でロック）・期限切れ拒否。status=collecting のみ。
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!token || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
    }

    // 照合の総当たり対策（IP単位・1分20回）
    if (!rateLimit(`sched:verify:ip:${ip}`, 20, 60 * 1000).ok) {
      return NextResponse.json({ error: 'リクエストが多すぎます。時間をおいて再度お試しください' }, { status: 429 });
    }

    await ensureSchedulingTables(sql);
    const event = await loadEventByToken(sql, token);
    if (!event || event.status !== 'collecting') {
      return NextResponse.json({ error: '受付は終了しています' }, { status: 403 });
    }

    const p = await loadParticipant(sql, token, email);
    if (!p || !p.otp_hash || !p.otp_expires_at) {
      return NextResponse.json({ error: '確認コードを再送してください' }, { status: 400 });
    }

    // 試行回数ロック
    if (p.otp_attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: '試行回数の上限に達しました。確認コードを再送してください' },
        { status: 429 }
      );
    }

    // 期限切れ
    if (new Date(p.otp_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: '確認コードの有効期限が切れました。再送してください' }, { status: 400 });
    }

    // 照合（定数時間比較）
    if (!verifyOtp(code, p.otp_hash)) {
      await sql`
        UPDATE scheduling_participants
        SET otp_attempts = otp_attempts + 1
        WHERE id = ${p.id}
      `;
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (p.otp_attempts + 1));
      return NextResponse.json(
        { error: `確認コードが違います（残り${remaining}回）` },
        { status: 400 }
      );
    }

    // 成功: 本人確認済みにし、OTPを無効化（使い捨て）
    await sql`
      UPDATE scheduling_participants
      SET email_verified_at = COALESCE(email_verified_at, now()),
          otp_hash = NULL,
          otp_expires_at = NULL,
          otp_attempts = 0
      WHERE id = ${p.id}
    `;

    return NextResponse.json({ ok: true, verified: true });
  } catch (e) {
    console.error('[scheduling/public/verify]', e);
    return NextResponse.json({ error: '確認に失敗しました' }, { status: 500 });
  }
}
