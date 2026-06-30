import { createHash } from 'crypto';
import { neon } from '@neondatabase/serverless';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Google Places 口コミ取得 + clinic_reviews UPSERT 共通ライブラリ（提案2 / v51）
// route（手動取得）と cron（日次同期）の両方から呼べるよう、取得fetchをここに集約。
// 既存 places/reviews/route.ts の挙動は変えない（同じ取得関数を呼ぶ形）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 南草津皮フ科の Google Place ID（既存 route のコード内定数を踏襲）
export const PLACE_ID = 'ChIJ7VPhj_pzAWARqIB4cyLDDFU';
export const CLINIC_NAME = '南草津皮フ科';
// 同期口コミの source（既存スキーマ既定値と一致）
export const PLACES_SOURCE = 'google_maps';

type Sql = ReturnType<typeof neon<false, false>>;

// 1件の口コミ（取得後の正規化済み）
export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  relativeTime: string;
  time: number; // Places の unix秒（擬似安定キーの素材）
  profilePhoto: string;
  review_date: string | null; // time から導出した YYYY-MM-DD（DATE列用）
  external_id: string; // sha256(source + time + author_name)
}

// Place 詳細 + 口コミ配列
export interface PlacesData {
  placeId: string;
  name: string;
  rating: number;
  totalReviews: number;
  address: string;
  phone: string;
  website: string;
  mapsUrl: string;
  openingHours: string[];
  reviews: PlaceReview[];
}

// 安定キー: 旧Places APIは安定IDを返さないため time + author_name を擬似キーにする
export function buildExternalId(
  time: number,
  authorName: string,
  source: string = PLACES_SOURCE,
): string {
  return createHash('sha256')
    .update(`${source}:${time}:${authorName}`)
    .digest('hex');
}

// unix秒 → YYYY-MM-DD（JST基準でなくUTC日付。review_date は表示用の目安）
function toReviewDate(time: number): string | null {
  if (!time || !Number.isFinite(time)) return null;
  try {
    return new Date(time * 1000).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Google Places Details API から Place 情報 + 口コミ（最大5件）を取得
// 既存 route と同じエンドポイント・パラメータを使用（挙動不変）
export async function fetchPlacesData(): Promise<PlacesData> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY が設定されていません');
  }

  const detailsUrl = new URL(
    'https://maps.googleapis.com/maps/api/place/details/json',
  );
  detailsUrl.searchParams.set('place_id', PLACE_ID);
  detailsUrl.searchParams.set(
    'fields',
    'name,rating,user_ratings_total,reviews,opening_hours,formatted_address,formatted_phone_number,website,url',
  );
  detailsUrl.searchParams.set('language', 'ja');
  detailsUrl.searchParams.set('reviews_sort', 'newest');
  detailsUrl.searchParams.set('key', apiKey);

  const res = await fetch(detailsUrl.toString());
  const data = await res.json();

  if (data.status !== 'OK') {
    throw new Error(`Places API エラー: ${data.status}`);
  }

  const result = data.result ?? {};

  const reviews: PlaceReview[] = (result.reviews ?? [])
    .slice(0, 5)
    .map(
      (r: {
        author_name?: string;
        rating?: number;
        text?: string;
        relative_time_description?: string;
        time?: number;
        profile_photo_url?: string;
      }) => {
        const author_name = r.author_name ?? '匿名';
        const time = r.time ?? 0;
        return {
          author_name,
          rating: r.rating ?? 0,
          text: r.text ?? '',
          relativeTime: r.relative_time_description ?? '',
          time,
          profilePhoto: r.profile_photo_url ?? '',
          review_date: toReviewDate(time),
          external_id: buildExternalId(time, author_name),
        };
      },
    );

  return {
    placeId: PLACE_ID,
    name: result.name ?? CLINIC_NAME,
    rating: result.rating ?? 0,
    totalReviews: result.user_ratings_total ?? 0,
    address: result.formatted_address ?? '',
    phone: result.formatted_phone_number ?? '',
    website: result.website ?? '',
    mapsUrl: result.url ?? '',
    openingHours: result.opening_hours?.weekday_text ?? [],
    reviews,
  };
}

// 競合クリニックの基礎情報（148-4。取得可の範囲のみ）
export interface CompetitorPlace {
  placeId: string;
  name: string;
  rating: number;
  totalReviews: number;
  address: string;
  phone: string;
  website: string;
  mapsUrl: string;
  categories: string[]; // Places の types（汎用カテゴリ。参考値）
  openingHours: string[];
}

// クリニック名/エリアのテキストから Place を検索 → 詳細を取得（旧 Places API）。
// 競合の星平均・口コミ数・カテゴリ・営業時間・URL を取得可の範囲で返す。
export async function fetchPlaceByText(query: string): Promise<CompetitorPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY が設定されていません');
  }

  // ① Text Search で place_id を特定
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('language', 'ja');
  searchUrl.searchParams.set('region', 'jp');
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString());
  const searchData = await searchRes.json();
  if (searchData.status !== 'OK' || !searchData.results?.[0]?.place_id) {
    return null;
  }
  const placeId: string = searchData.results[0].place_id;

  // ② Place Details で詳細
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', placeId);
  detailsUrl.searchParams.set(
    'fields',
    'name,rating,user_ratings_total,types,opening_hours,formatted_address,formatted_phone_number,website,url',
  );
  detailsUrl.searchParams.set('language', 'ja');
  detailsUrl.searchParams.set('key', apiKey);

  const res = await fetch(detailsUrl.toString());
  const data = await res.json();
  if (data.status !== 'OK') return null;
  const r = data.result ?? {};

  return {
    placeId,
    name: r.name ?? query,
    rating: r.rating ?? 0,
    totalReviews: r.user_ratings_total ?? 0,
    address: r.formatted_address ?? '',
    phone: r.formatted_phone_number ?? '',
    website: r.website ?? '',
    mapsUrl: r.url ?? '',
    categories: Array.isArray(r.types) ? r.types : [],
    openingHours: r.opening_hours?.weekday_text ?? [],
  };
}

// clinic_reviews に external_id 列 + UNIQUE(source, external_id) を冪等に用意。
// 既存行は external_id=NULL（NULL は UNIQUE 重複扱いされないため非破壊）。
// マイグレーションフレームワーク無し方針に合わせ ADD COLUMN IF NOT EXISTS で運用。
export async function ensureReviewSyncSchema(sql: Sql): Promise<void> {
  await sql`ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS external_id TEXT`;
  // UNIQUE 制約は CREATE UNIQUE INDEX IF NOT EXISTS で冪等に（ON CONFLICT 推論に一致）
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_reviews_source_external_id
    ON clinic_reviews (source, external_id)
  `;
}

// UPSERT 用入力（手動 import / cron 同期 共通）
export interface UpsertReview {
  author_name: string;
  rating: number;
  text?: string | null;
  review_date?: string | null;
  source?: string | null;
  external_id?: string | null;
}

export interface UpsertResult {
  inserted: number; // 新規挿入件数（通知の「新着N件」に使用）
  updated: number; // 既存更新件数
  rows: Array<Record<string, unknown>>;
}

// ON CONFLICT (source, external_id) DO UPDATE で UPSERT。
// - external_id を持つ行（cron同期）: 重複は本文/評価/日付のみ更新（replied_at/reply_text は維持）
// - external_id が NULL の行（手動入力）: NULL は重複扱いされないため常に新規挿入（従来挙動）
// 新規/更新は RETURNING の (xmax = 0) で判定する。
export async function upsertReviews(
  sql: Sql,
  reviews: UpsertReview[],
): Promise<UpsertResult> {
  const rows: Array<Record<string, unknown>> = [];
  let inserted = 0;
  let updated = 0;

  for (const r of reviews) {
    const result = await sql`
      INSERT INTO clinic_reviews (author_name, rating, text, review_date, source, external_id)
      VALUES (
        ${r.author_name},
        ${r.rating},
        ${r.text ?? ''},
        ${r.review_date ?? null},
        ${r.source ?? PLACES_SOURCE},
        ${r.external_id ?? null}
      )
      ON CONFLICT (source, external_id) DO UPDATE SET
        text = EXCLUDED.text,
        rating = EXCLUDED.rating,
        review_date = COALESCE(EXCLUDED.review_date, clinic_reviews.review_date)
      RETURNING id, author_name, rating, text, review_date, source, external_id,
                created_at, replied_at, reply_text, (xmax = 0) AS is_new
    `;
    const row = result[0];
    if (row) {
      if (row.is_new) inserted++;
      else updated++;
      rows.push(row);
    }
  }

  return { inserted, updated, rows };
}
