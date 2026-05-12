import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface PostBody {
  title?: string;
  content?: string;
  category?: string;
  source?: string;
  featureTags?: string[];
}

// 背景情報を保存
// 既存スキーマ (topic, context_text) に新カラム (category/source/feature_tags) を併用
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const title = (body.title ?? '').trim() || '無題';
  const content = body.content ?? '';
  if (!content.trim()) {
    return NextResponse.json({ error: 'contentが必要です' }, { status: 400 });
  }

  const category = body.category ?? 'general';
  const source = body.source ?? 'manual';
  const featureTags = Array.isArray(body.featureTags) && body.featureTags.length > 0
    ? body.featureTags
    : ['all'];

  const rows = await sql`
    INSERT INTO context_saves
      (user_id, topic, context_text, category, source, feature_tags, is_active)
    VALUES (
      ${userId}, ${title}, ${content},
      ${category}, ${source}, ${featureTags}, TRUE
    )
    RETURNING id, topic AS title, context_text AS content, category, source, feature_tags, created_at
  `;
  return NextResponse.json({ saved: rows[0] });
}

// 背景情報を取得（feature_tags でフィルタ可能）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const featureTag = searchParams.get('feature');

  const items = featureTag
    ? await sql`
        SELECT
          id,
          topic AS title,
          context_text AS content,
          COALESCE(category, 'general') AS category,
          COALESCE(source, 'manual') AS source,
          COALESCE(feature_tags, '{}'::text[]) AS feature_tags,
          created_at
        FROM context_saves
        WHERE user_id = ${userId}
          AND COALESCE(is_active, TRUE) = TRUE
          AND (
            feature_tags @> ARRAY['all']::text[]
            OR feature_tags @> ARRAY[${featureTag}]::text[]
            OR feature_tags IS NULL
            OR cardinality(feature_tags) = 0
          )
        ORDER BY created_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT
          id,
          topic AS title,
          context_text AS content,
          COALESCE(category, 'general') AS category,
          COALESCE(source, 'manual') AS source,
          COALESCE(feature_tags, '{}'::text[]) AS feature_tags,
          created_at
        FROM context_saves
        WHERE user_id = ${userId}
          AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY created_at DESC
        LIMIT 100
      `;

  return NextResponse.json({ items });
}

// 背景情報を非アクティブ化（実質削除）
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') ?? '0', 10);
  if (!id) {
    return NextResponse.json({ error: 'idが必要です' }, { status: 400 });
  }

  await sql`
    UPDATE context_saves
    SET is_active = FALSE
    WHERE id = ${id} AND user_id = ${userId}
  `;
  return NextResponse.json({ success: true });
}
