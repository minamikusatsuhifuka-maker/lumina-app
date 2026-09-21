import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  generateOtpCode,
  hashOtp,
  isValidEmail,
  OTP_TTL_MS,
} from '@/lib/scheduling';
import { getEventByPublicToken, upsertParticipant, setParticipantOtp } from '@/lib/scheduling/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendEmail, renderEmailLayout, escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';

// 公開API（認証なし）。メール登録 → OTP生成・本人宛送信。
// 受付は status=collecting のイベントのみ。rate-limit 必須。
// 存在有無を漏らさない汎用レスポンス（列挙・踏み台対策）。
// 109: 参加者の保存は lib/scheduling/db.ts の upsertParticipant（平文＋email_enc/email_hash の二重書き）。
const GENERIC_OK = {
  ok: true,
  message: '確認コードをメールに送信しました。届かない場合は迷惑メールもご確認ください。',
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!token || !isValidEmail(email)) {
      return NextResponse.json({ error: 'メールアドレスを正しく入力してください' }, { status: 400 });
    }

    // IP単位の登録スパム制限（1時間に20回）
    if (!rateLimit(`sched:register:ip:${ip}`, 20, 60 * 60 * 1000).ok) {
      return NextResponse.json({ error: 'リクエストが多すぎます。時間をおいて再度お試しください' }, { status: 429 });
    }

    await ensureSchedulingTables(sql);
    const event = await getEventByPublicToken(sql, token);
    // 存在しない/collecting以外でも汎用文言（情報を漏らさない）。ただしメールは送らない。
    if (!event || event.status !== 'collecting') {
      return NextResponse.json(GENERIC_OK);
    }

    // 送信間隔（同一event×email: 60秒に1回）と日次上限（同 5回/日）
    const intervalKey = `sched:otp:interval:${token}:${email}`;
    const dailyKey = `sched:otp:daily:${token}:${email}`;
    if (!rateLimit(intervalKey, 1, 60 * 1000).ok) {
      return NextResponse.json({ error: '確認コードの再送は60秒後に可能です' }, { status: 429 });
    }
    if (!rateLimit(dailyKey, 5, 24 * 60 * 60 * 1000).ok) {
      return NextResponse.json({ error: '本日の送信上限に達しました。明日以降に再度お試しください' }, { status: 429 });
    }

    // 参加者を UPSERT（UNIQUE(event_id,email)）。本人のみ作成。平文と enc/hash の二重書き。
    const participant = await upsertParticipant(sql, token, email);

    // OTP生成 → ハッシュ保存（平文保存しない）、期限・試行回数リセット
    const code = generateOtpCode();
    const otpHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await setParticipantOtp(sql, participant.id, otpHash, expiresAt);

    // 本人（入力されたアドレス）にのみ送信。任意アドレスへの踏み台にしない。
    const safeTitle = escapeHtml(event.title);
    const html = renderEmailLayout({
      title: '確認コードのお知らせ',
      bodyHtml: `<p>日程調整「${safeTitle}」の確認コードです。</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1f2433;margin:16px 0;">${code}</p>
        <p>このコードを画面に入力してください（有効期限：10分）。</p>
        <p style="color:#9098ad;font-size:12px;">心当たりがない場合はこのメールを破棄してください。</p>`,
    });
    await sendEmail({
      to: email,
      subject: `【xLUMINA】確認コード: ${code}`,
      text: `日程調整「${event.title}」の確認コードは ${code} です（有効期限10分）。画面に入力してください。`,
      html,
    });

    return NextResponse.json(GENERIC_OK);
  } catch (e) {
    console.error('[scheduling/public/register]', e);
    // 失敗詳細も漏らさない
    return NextResponse.json(GENERIC_OK);
  }
}
