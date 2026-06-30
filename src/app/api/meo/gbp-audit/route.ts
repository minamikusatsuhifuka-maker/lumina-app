import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { fetchPlacesData } from '@/lib/places-reviews';
import {
  ensureGbpSchema,
  loadThresholds,
  loadChecklist,
  evaluateAutoItems,
  buildManualItems,
  computeScore,
  buildTodos,
} from '@/lib/gbp-audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// GBP最適化チェッカー：Places自動診断＋手入力チェック＋スコア＋やることリスト
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY が設定されていません' },
      { status: 500 },
    );
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);

    const [data, thresholds, savedChecklist] = await Promise.all([
      fetchPlacesData(),
      loadThresholds(sql, owner),
      loadChecklist(sql, owner),
    ]);

    const auto = evaluateAutoItems(data, thresholds);
    const manual = buildManualItems(savedChecklist);
    const all = [...auto, ...manual];
    const score = computeScore(all);
    const todos = buildTodos(all);

    return NextResponse.json({
      place: {
        name: data.name,
        rating: data.rating,
        totalReviews: data.totalReviews,
        address: data.address,
        phone: data.phone,
        website: data.website,
        mapsUrl: data.mapsUrl,
        openingHours: data.openingHours,
      },
      thresholds,
      auto,
      manual,
      score,
      todos,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-audit] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
