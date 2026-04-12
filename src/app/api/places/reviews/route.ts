import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

// 南草津皮フ科のPlace ID（初回はFind Placeで自動取得してキャッシュ）
let cachedPlaceId: string | null = null;
const CLINIC_NAME = '南草津皮フ科';

async function getPlaceId(apiKey: string): Promise<string> {
  if (cachedPlaceId) return cachedPlaceId;

  const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  url.searchParams.set('input', CLINIC_NAME);
  url.searchParams.set('inputtype', 'textquery');
  url.searchParams.set('fields', 'place_id,name');
  url.searchParams.set('locationbias', 'point:35.006601,135.942499');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.candidates && data.candidates.length > 0) {
    cachedPlaceId = data.candidates[0].place_id;
    return cachedPlaceId!;
  }

  throw new Error('Place IDが見つかりませんでした');
}

export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const placeId = await getPlaceId(apiKey);

    // Place Details APIで詳細を取得
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', placeId);
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
      placeId,
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
