import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  canTransition,
  parseCandidateDates,
  type SchedulingStatus,
} from '@/lib/scheduling';
import { generateWithModel } from '@/lib/ai-client';
import { safeJsonParse } from '@/lib/ai-json-parser';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface RankedDay {
  date: string;
  availableCount: number;
  ngCount: number;
  rank: number;
  reason: string;
}

// ⑤ AI日程算出（要auth・オーナーのみ）。
// 集合演算で「全員参加可能な日」を抽出し、AIでランク・理由を付ける（AI障害時は素の集合演算にフォールバック）。
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const events = await sql`
    SELECT id, title, status, candidate_dates
    FROM scheduling_events
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;
  if (events.length === 0) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  const event = events[0];
  const current = event.status as SchedulingStatus;

  if (current !== 'collecting' || !canTransition(current, 'ready')) {
    return NextResponse.json(
      { error: `現在の状態(${current})では算出できません（収集中のみ）` },
      { status: 409 }
    );
  }

  const candidateDates = parseCandidateDates(event.candidate_dates);
  if (candidateDates.length === 0) {
    return NextResponse.json({ error: '候補日が設定されていません' }, { status: 400 });
  }

  // 本人確認済み参加者の人数と、NG日の集計（本人確認済み分のみ）
  const verifiedRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM scheduling_participants
    WHERE event_id = ${id} AND email_verified_at IS NOT NULL
  `;
  const verifiedCount = Number(verifiedRows[0]?.c ?? 0);

  const ngRows = await sql`
    SELECT n.ng_date, COUNT(DISTINCT n.participant_id)::int AS ng_count
    FROM scheduling_ng_dates n
    JOIN scheduling_participants p ON p.id = n.participant_id
    WHERE n.event_id = ${id} AND p.email_verified_at IS NOT NULL
    GROUP BY n.ng_date
  `;
  const ngMap = new Map<string, number>();
  for (const r of ngRows) {
    const d = typeof r.ng_date === 'string' ? r.ng_date.slice(0, 10) : new Date(r.ng_date).toISOString().slice(0, 10);
    ngMap.set(d, Number(r.ng_count));
  }

  // 集合演算: 候補日ごとに 参加可能数 = 検証済み人数 - NG数。降順ランク。
  const base: RankedDay[] = candidateDates
    .map((date) => {
      const ngCount = ngMap.get(date) ?? 0;
      return { date, ngCount, availableCount: Math.max(0, verifiedCount - ngCount), rank: 0, reason: '' };
    })
    .sort((a, b) => a.ngCount - b.ngCount || a.date.localeCompare(b.date));

  // 全員参加可能な日（ngCount==0）。無ければ NG最少の日が最有力。
  const allAvailable = base.filter((d) => d.ngCount === 0).map((d) => d.date);

  // ── AIでランク・理由づけ（失敗時は集合演算のみにフォールバック）──
  let ranked: RankedDay[] = base.map((d, i) => ({ ...d, rank: i + 1, reason: '' }));
  let summary = '';
  let aiUsed = false;
  try {
    const lines = base
      .map((d) => `${d.date}: 参加可能 ${d.availableCount}/${verifiedCount}名（NG ${d.ngCount}名）`)
      .join('\n');
    const prompt = `あなたは日程調整のアシスタントです。以下は候補日ごとの参加可能人数です。
参加可能人数が多い日を上位に、同数なら早い日付を上位にランク付けし、各日に簡潔な日本語の理由を付けてください。
僅差で外れた惜しい日があれば near_miss に入れてください。

【検証済み参加者数】${verifiedCount}名
【候補日と参加可能数】
${lines}

JSONのみを返す（前置き・コードフェンス不要）。形式:
{"summary":"全体の所見(1-2文)","ranked":[{"date":"YYYY-MM-DD","rank":1,"reason":"理由"}],"near_miss":[{"date":"YYYY-MM-DD","reason":"惜しい理由"}]}`;

    const raw = await generateWithModel('claude', prompt, undefined, 2000);
    const parsed = safeJsonParse<{
      summary?: string;
      ranked?: { date?: string; rank?: number; reason?: string }[];
    }>(raw, { ranked: [] });

    if (Array.isArray(parsed.ranked) && parsed.ranked.length > 0) {
      const reasonMap = new Map<string, string>();
      const rankMap = new Map<string, number>();
      parsed.ranked.forEach((r, i) => {
        if (typeof r.date === 'string') {
          reasonMap.set(r.date, String(r.reason ?? ''));
          rankMap.set(r.date, Number(r.rank) || i + 1);
        }
      });
      ranked = base
        .map((d) => ({
          ...d,
          rank: rankMap.get(d.date) ?? 999,
          reason: reasonMap.get(d.date) ?? '',
        }))
        .sort((a, b) => a.rank - b.rank || a.ngCount - b.ngCount);
      summary = String(parsed.summary ?? '');
      aiUsed = true;
    }
  } catch (e) {
    console.warn('[scheduling/compute] AI失敗、集合演算にフォールバック', e);
  }

  // candidate_dates は「全員可能な日を優先したランク順の配列」に更新（finalizeの検証に使う）
  const orderedDates =
    allAvailable.length > 0 ? allAvailable : ranked.map((d) => d.date);
  const computeResult = {
    verifiedCount,
    summary,
    aiUsed,
    ranked,
    allAvailable,
    computedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE scheduling_events
    SET candidate_dates = ${JSON.stringify(orderedDates)}::jsonb,
        compute_result = ${JSON.stringify(computeResult)}::jsonb,
        status = 'ready',
        updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;

  // オーナーに通知（fire-and-forget）
  await notify({
    userId,
    title: '🗓️ 最適日が算出されました',
    message: `「${event.title}」: ${allAvailable.length > 0 ? `全員参加可能な候補 ${allAvailable.length}日` : 'NG最少の候補を提示'}`,
    href: `/dashboard/scheduling/${id}`,
    type: 'info',
  });

  return NextResponse.json({ ok: true, status: 'ready', ...computeResult });
}
