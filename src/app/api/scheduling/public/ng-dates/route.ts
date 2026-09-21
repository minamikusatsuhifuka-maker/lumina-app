import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  parseCandidateDates,
  isValidEmail,
  isValidDateStr,
} from '@/lib/scheduling';
import { getEventByPublicToken, findParticipantByEmail, saveResponse } from '@/lib/scheduling/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// 公開API（認証なし）。本人確認済みのみ。NG日を候補期間内か検証して保存、responded_at セット。
// status=collecting のみ。他人のデータには触れない（event_id × 本人 participant_id のみ）。
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const dates: unknown = body.dates;

    if (!token || !isValidEmail(email) || !Array.isArray(dates)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
    }

    // 連打制限（IP単位・1分30回）
    if (!rateLimit(`sched:ngdates:ip:${ip}`, 30, 60 * 1000).ok) {
      return NextResponse.json({ error: 'リクエストが多すぎます。時間をおいて再度お試しください' }, { status: 429 });
    }

    await ensureSchedulingTables(sql);
    const event = await getEventByPublicToken(sql, token);
    if (!event || event.status !== 'collecting') {
      return NextResponse.json({ error: '受付は終了しています' }, { status: 403 });
    }

    const p = await findParticipantByEmail(sql, token, email);
    if (!p) {
      return NextResponse.json({ error: 'まず確認コードで本人確認をしてください' }, { status: 400 });
    }
    if (!p.email_verified_at) {
      return NextResponse.json({ error: '本人確認が必要です' }, { status: 403 });
    }

    // 候補期間内のみ許可（候補外は弾く）
    const candidate = new Set(parseCandidateDates(event.candidate_dates));
    const requested = Array.from(new Set((dates as unknown[]).filter(isValidDateStr))) as string[];
    const invalid = requested.filter((d) => !candidate.has(d));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: '候補期間外の日付が含まれています', invalid },
        { status: 400 }
      );
    }

    // 本人のNG日を入れ替え（全削除 → 再INSERT）。participant_id で本人分のみ操作。
    const count = await saveResponse(sql, token, p.id, requested);

    return NextResponse.json({ ok: true, responded: true, count });
  } catch (e) {
    console.error('[scheduling/public/ng-dates]', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
