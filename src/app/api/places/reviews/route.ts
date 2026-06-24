import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchPlacesData } from '@/lib/places-reviews';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    // 取得は lib に集約（cron と共通化）。レスポンス形は従来どおり維持する。
    const data = await fetchPlacesData();

    return NextResponse.json({
      placeId: data.placeId,
      name: data.name,
      rating: data.rating,
      totalReviews: data.totalReviews,
      address: data.address,
      phone: data.phone,
      website: data.website,
      mapsUrl: data.mapsUrl,
      openingHours: data.openingHours,
      reviews: data.reviews.map((r) => ({
        author: r.author_name,
        rating: r.rating,
        text: r.text,
        relativeTime: r.relativeTime,
        timestamp: r.time,
        profilePhoto: r.profilePhoto,
      })),
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[places/reviews] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
