import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { triggerIntegrations } from '@/lib/integrationEngine';

export const runtime = 'nodejs';

interface BlogPostBody {
  title: string;
  content?: string;
  excerpt?: string;
  category?: string;
  tags?: unknown[];
  status?: string;
  sourceType?: string;
  sourceId?: number | null;
  seoTitle?: string;
  seoDescription?: string;
}

interface BlogPatchBody {
  id: number;
  title?: string;
  content?: string;
  excerpt?: string;
  status?: string;
  category?: string;
  tags?: unknown[];
  seoTitle?: string;
  seoDescription?: string;
}

const makeSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9぀-ゟ゠-ヿ一-龯]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    const posts = status
      ? await sql`
          SELECT * FROM blog_posts
          WHERE user_id = ${userId} AND status = ${status}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT * FROM blog_posts
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 50
        `;
    return NextResponse.json({ posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as BlogPostBody;
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: 'titleは必須です' },
        { status: 400 },
      );
    }

    const slug = makeSlug(body.title);

    const rows = await sql`
      INSERT INTO blog_posts
        (user_id, title, slug, content, excerpt, category, tags,
         status, source_type, source_id, seo_title, seo_description,
         published_at)
      VALUES (
        ${userId}, ${body.title}, ${slug},
        ${body.content ?? ''}, ${body.excerpt ?? ''},
        ${body.category ?? '一般'},
        ${JSON.stringify(body.tags ?? [])}::jsonb,
        ${body.status ?? 'draft'},
        ${body.sourceType ?? 'manual'},
        ${body.sourceId ?? null},
        ${body.seoTitle ?? body.title},
        ${body.seoDescription ?? body.excerpt ?? ''},
        ${body.status === 'published' ? new Date().toISOString() : null}
      )
      RETURNING *
    `;
    return NextResponse.json({ post: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as BlogPatchBody;
    const {
      id,
      title,
      content,
      excerpt,
      status,
      category,
      tags,
      seoTitle,
      seoDescription,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    const tagsJson = tags !== undefined ? JSON.stringify(tags) : null;

    const rows = await sql`
      UPDATE blog_posts SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        excerpt = COALESCE(${excerpt ?? null}, excerpt),
        status = COALESCE(${status ?? null}, status),
        category = COALESCE(${category ?? null}, category),
        tags = COALESCE(${tagsJson}::jsonb, tags),
        seo_title = COALESCE(${seoTitle ?? null}, seo_title),
        seo_description = COALESCE(${seoDescription ?? null}, seo_description),
        published_at = CASE
          WHEN ${status ?? null} = 'published' AND published_at IS NULL THEN NOW()
          ELSE published_at
        END,
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    const post = rows[0] as
      | {
          id: number;
          title: string;
          content?: string;
          excerpt?: string;
          tags?: unknown;
        }
      | undefined;

    // ブログ公開時にSaaS連携を発火
    if (status === 'published' && post) {
      const postTags = Array.isArray(post.tags)
        ? (post.tags as string[])
        : [];
      await triggerIntegrations(
        {
          userId,
          sourceType: 'blog',
          sourceId: post.id,
          title: post.title,
          content: post.content ?? '',
          summary: post.excerpt ?? (post.content ?? '').slice(0, 200),
          tags: postTags,
        },
        'blog_published',
      ).catch(() => {
        /* 連携失敗はブログ公開に影響させない */
      });
    }

    return NextResponse.json({ post });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    await sql`
      DELETE FROM blog_posts
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
