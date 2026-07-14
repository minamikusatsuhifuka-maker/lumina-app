import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireAuth } from '@/lib/require-auth';
import { blobAuthOptions, hasBlobCredentials } from '@/lib/blob-auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// 画像ギャラリー。画像本体（バイナリ）は Vercel Blob、Neon にはメタ＋Blob URL のみ。
// 一覧は base64 本文を返さない（表示はブラウザが blob_url から直接取得する）。
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS image_gallery (
        id          text PRIMARY KEY,
        owner       text NOT NULL,
        blob_url    text NOT NULL,
        pathname    text NOT NULL,
        prompt      text,
        settings    jsonb,
        title       text,
        source      text DEFAULT 'image-gen',
        width       int,
        height      int,
        bytes       int,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `
      .then(() =>
        sql`
          CREATE INDEX IF NOT EXISTS idx_image_gallery_owner
          ON image_gallery(owner, created_at DESC)
        `,
      )
      .catch((e) => {
        // 失敗時は次回再試行できるようリセット
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

// "1536x1024" のようなサイズ指定から幅・高さを取り出す（auto や不正値は null）
function parseSize(size: unknown): { width: number | null; height: number | null } {
  const m = typeof size === 'string' ? size.match(/^(\d+)x(\d+)$/) : null;
  if (!m) return { width: null, height: null };
  return { width: Number(m[1]), height: Number(m[2]) };
}

// 一覧（メタ＋blob_url のみ・owner絞り込み）
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 30, 1), 100);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    // COUNT(*) OVER() で総件数を実数で返す（ページング用）
    const rows = await sql`
      SELECT id, blob_url, pathname, prompt, settings, title, source,
             width, height, bytes, created_at,
             COUNT(*) OVER() AS total_count
      FROM image_gallery
      WHERE owner = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const totalCount = rows[0] ? Number(rows[0].total_count) : 0;
    const images = rows.map((row) => {
      const rest = { ...row };
      delete rest.total_count; // 総件数は images 各行には含めない
      return rest;
    });
    return NextResponse.json({ images, total_count: totalCount, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gallery GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 保存: 画像本体を Blob へ put し、Neon にはメタ＋URL のみ INSERT
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: 'Blobストアが未設定です（BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN）' },
      { status: 500 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!imageBase64) {
      return NextResponse.json({ error: '画像データがありません' }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    if (buffer.length === 0) {
      return NextResponse.json({ error: '画像データが不正です' }, { status: 400 });
    }

    const id = randomUUID();
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const settings =
      body.settings && typeof body.settings === 'object' ? body.settings : {};
    const title = String(body.title ?? '').trim() || prompt.slice(0, 60) || '無題の画像';
    const parsed = parseSize((settings as { size?: unknown }).size);
    const width = Number(body.width) || parsed.width;
    const height = Number(body.height) || parsed.height;

    // owner 配下に格納（キーにowner/idを含める）
    const { url, pathname } = await put(`gallery/${userId}/${id}.png`, buffer, {
      access: 'public',
      contentType: 'image/png',
      ...blobAuthOptions(),
    });

    await ensureTable();
    const rows = await sql`
      INSERT INTO image_gallery
        (id, owner, blob_url, pathname, prompt, settings, title, source, width, height, bytes)
      VALUES
        (${id}, ${userId}, ${url}, ${pathname}, ${prompt},
         ${JSON.stringify(settings)}::jsonb, ${title}, 'image-gen',
         ${width}, ${height}, ${buffer.length})
      RETURNING id, blob_url, pathname, prompt, settings, title, source,
                width, height, bytes, created_at
    `;
    // 返却はメタのみ（base64は返さない）
    return NextResponse.json({ ok: true, image: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gallery POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
