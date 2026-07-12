import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notify } from '@/lib/notify';
import {
  fetchPlacesData,
  ensureReviewSyncSchema,
  upsertReviews,
  PLACES_SOURCE,
} from '@/lib/places-reviews';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 口コミ Places 日次同期 + 未返信アラート（提案2 / v51）
// Vercel Cron から JST 朝8時（UTC 前日23:00）に呼ばれる。
// 1. 認証（Bearer CRON_SECRET）→ 2. Places取得 → 3. clinic_reviews へ UPSERT（重複防止）
// → 4. 未返信集計 → 5. 新着 or 未返信があるときのみ notify（v50ヘルパー / fire-and-forget）。
// 取得失敗は握りつぶして通知しない（毎日無意味/誤報を出さない）。

export async function GET(req: NextRequest) {
  // 1. 認証: Bearer CRON_SECRET（既存 cron と同作法）
  const authHeader = req.headers.get('authorization');
  // CRON_SECRET未設定時に "Bearer undefined" で一致しないようガード
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const result: Record<string, unknown> = {};

  // スキーマ冪等保証（external_id 列 + UNIQUE）
  try {
    await ensureReviewSyncSchema(sql);
  } catch (e) {
    console.error('[cron/sync-reviews] ensureSchema failed', e);
  }

  // 2〜3. Places取得 → UPSERT。取得失敗は握って通知しない。
  let inserted = 0;
  let updated = 0;
  let fetched = 0;
  try {
    const data = await fetchPlacesData();
    fetched = data.reviews.length;
    if (data.reviews.length > 0) {
      const upserted = await upsertReviews(
        sql,
        data.reviews.map((r) => ({
          author_name: r.author_name,
          rating: r.rating,
          text: r.text,
          review_date: r.review_date,
          source: PLACES_SOURCE,
          external_id: r.external_id,
        })),
      );
      inserted = upserted.inserted;
      updated = upserted.updated;
    }
    result.fetched = fetched;
    result.inserted = inserted;
    result.updated = updated;
  } catch (e) {
    // 取得/保存失敗は握る（通知しない）
    console.error('[cron/sync-reviews] fetch/upsert failed', e);
    result.fetchError = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: true, notified: false, ...result });
  }

  // 4. 未返信件数を集計（replied_at IS NULL）
  let unreplied = 0;
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS cnt FROM clinic_reviews WHERE replied_at IS NULL
    `;
    unreplied = Number(rows[0]?.cnt ?? 0);
  } catch (e) {
    console.error('[cron/sync-reviews] count unreplied failed', e);
  }
  result.unreplied = unreplied;

  // 通知先（院長）userId を解決: 最古ユーザー（GA cron と同方針）
  let ownerUserId: string | null = null;
  try {
    const users = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
    ownerUserId = (users[0]?.id as string) ?? null;
  } catch (e) {
    console.error('[cron/sync-reviews] resolve owner failed', e);
  }

  // 5. 新着 or 未返信があるときのみ通知（0件のときは通知しない）
  let notified = false;
  if (ownerUserId && (inserted > 0 || unreplied > 0)) {
    const parts: string[] = [];
    if (inserted > 0) parts.push(`新着${inserted}件`);
    if (unreplied > 0) parts.push(`未返信${unreplied}件`);
    await notify({
      userId: ownerUserId,
      title: '⭐ Google口コミ',
      message: `${parts.join(' / ')}（返信文案は口コミ画面から作成できます）`,
      href: '/dashboard/reviews',
      type: 'info',
    });
    notified = true;
  }
  result.notified = notified;

  return NextResponse.json({ ok: true, ...result });
}

// 手動テスト用（GET と同じ処理）
export async function POST(req: NextRequest) {
  return GET(req);
}
