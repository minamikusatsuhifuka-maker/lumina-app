import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureReviewSyncSchema, upsertReviews, buildExternalId } from '@/lib/places-reviews';
import { ensureReviewManagementSchema } from '@/lib/review-management';

export const runtime = 'nodejs';

interface ImportReview {
  author_name: string;
  rating: number;
  text?: string;
  review_date?: string;
  source?: string;
  external_id?: string;
  time?: number; // Google Places の unix秒（external_id 算出用・任意）
}

// 口コミを一括保存
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const body = await req.json();
    const reviews: ImportReview[] = Array.isArray(body) ? body : body.reviews ?? [body];

    if (!reviews.length) {
      return NextResponse.json({ error: '口コミデータが必要です' }, { status: 400 });
    }

    // バリデーション
    for (const r of reviews) {
      if (!r.author_name || typeof r.author_name !== 'string') {
        return NextResponse.json({ error: '投稿者名は必須です' }, { status: 400 });
      }
      if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) {
        return NextResponse.json({ error: '評価は1〜5の整数で指定してください' }, { status: 400 });
      }
    }

    const sql = neon(process.env.DATABASE_URL!);

    // external_id 列 + UNIQUE(source, external_id) を冪等に用意（既存行は NULL で非破壊）
    await ensureReviewSyncSchema(sql);

    // UPSERT 化（手動入力は external_id=NULL のため従来どおり常に新規挿入）
    const { inserted, updated, rows } = await upsertReviews(
      sql,
      reviews.map((r) => {
        const source = r.source ?? 'manual';
        // Google Places取得分は time+投稿者で安定キーを生成しUPSERTで重複取り込みを防ぐ
        const external_id =
          r.external_id ??
          (source === 'google_maps' && r.time ? buildExternalId(r.time, r.author_name) : null);
        return {
          author_name: r.author_name,
          rating: r.rating,
          text: r.text ?? '',
          review_date: r.review_date ?? null,
          source,
          external_id,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      count: rows.length,
      inserted,
      updated,
      reviews: rows,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[places/reviews/import] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 保存済み口コミ一覧
export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    // 管理用のリスク列が無いDBでも SELECT が落ちないよう冪等に用意してから取得
    await ensureReviewManagementSchema(sql);
    const rows = await sql`
      SELECT id, author_name, rating, text, review_date, source, created_at, replied_at, reply_text,
             risk_flag, risk_type, risk_reason, risk_score, review_status, analyzed_at
      FROM clinic_reviews
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ reviews: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[places/reviews/import] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
