import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

const VALID_PAGE_TYPES = ['seo', 'conversion', 'competitor', 'contacts'] as const;
type PageType = (typeof VALID_PAGE_TYPES)[number];

function isValidPageType(v: unknown): v is PageType {
  return typeof v === 'string' && (VALID_PAGE_TYPES as readonly string[]).includes(v);
}

// 一覧取得（page_type絞り込み可、最新5件 or limit指定）
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const pageType = searchParams.get('page_type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 50);

    let rows;
    if (pageType && isValidPageType(pageType)) {
      rows = await sql`
        SELECT id, user_id, page_type, title, data, created_at
        FROM analysis_saves
        WHERE user_id = ${userId} AND page_type = ${pageType}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT id, user_id, page_type, title, data, created_at
        FROM analysis_saves
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }
    return NextResponse.json({ saves: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[analysis-saves GET] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 保存
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';
  if (!userId) return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });

  try {
    const body = await req.json();
    const { page_type, title, data } = body;

    if (!isValidPageType(page_type)) {
      return NextResponse.json({ error: 'page_typeが無効です' }, { status: 400 });
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'dataが必要です' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO analysis_saves (user_id, page_type, title, data)
      VALUES (${userId}, ${page_type}, ${title || null}, ${JSON.stringify(data)})
      RETURNING id, user_id, page_type, title, data, created_at
    `;
    return NextResponse.json({ success: true, save: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[analysis-saves POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 削除
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });

    await sql`DELETE FROM analysis_saves WHERE id = ${id} AND user_id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
