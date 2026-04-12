import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

const PLACE_ID = 'ChIJ7VPhj_pzAWARqIB4cyLDDFU';
const CLINIC_NAME = '南草津皮フ科';

export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    // Place Details APIで詳細を取得
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', PLACE_ID);
    detailsUrl.searchParams.set('fields', 'name,rating,user_ratings_total,reviews,opening_hours,formatted_address,formatted_phone_number,website,url');
    detailsUrl.searchParams.set('language', 'ja');
    detailsUrl.searchParams.set('reviews_sort', 'newest');
    detailsUrl.searchParams.set('key', apiKey);

    const res = await fetch(detailsUrl.toString());
    const data = await res.json();

    if (data.status !== 'OK') {
      return NextResponse.json({ error: `Places API エラー: ${data.status}` }, { status: 500 });
    }

    const result = data.result;

    return NextResponse.json({
      placeId: PLACE_ID,
      name: result.name ?? CLINIC_NAME,
      rating: result.rating ?? 0,
      totalReviews: result.user_ratings_total ?? 0,
      address: result.formatted_address ?? '',
      phone: result.formatted_phone_number ?? '',
      website: result.website ?? '',
      mapsUrl: result.url ?? '',
      openingHours: result.opening_hours?.weekday_text ?? [],
      reviews: (result.reviews ?? []).slice(0, 5).map((r: {
        author_name?: string;
        rating?: number;
        text?: string;
        relative_time_description?: string;
        time?: number;
        profile_photo_url?: string;
      }) => ({
        author: r.author_name ?? '匿名',
        rating: r.rating ?? 0,
        text: r.text ?? '',
        relativeTime: r.relative_time_description ?? '',
        timestamp: r.time ?? 0,
        profilePhoto: r.profile_photo_url ?? '',
      })),
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[places/reviews] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
