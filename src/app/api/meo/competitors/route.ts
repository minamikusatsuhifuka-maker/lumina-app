import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';
import { fetchPlaceByText } from '@/lib/places-reviews';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 148-4 競合クリニックの登録・削除。登録時に Places で基礎情報を取得。owner検証。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      SELECT id, name, place_id, place_data, created_at
      FROM competitors WHERE owner = ${owner}
      ORDER BY created_at ASC
    `;
    return NextResponse.json({ competitors: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitors] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 競合を追加（name/エリアで Places 検索 → 基礎情報を保存）
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query（競合名/エリア）が必要です' }, { status: 400 });
    }
    const place = await fetchPlaceByText(query.trim());
    if (!place) {
      return NextResponse.json({ error: 'Places で見つかりませんでした。名称や地域を具体的に入力してください' }, { status: 404 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      INSERT INTO competitors (owner, name, place_id, place_data)
      VALUES (${owner}, ${place.name}, ${place.placeId}, ${JSON.stringify(place)})
      RETURNING id, name, place_id, place_data, created_at
    `;
    return NextResponse.json({ success: true, competitor: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitors] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    await sql`DELETE FROM competitors WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitors] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
