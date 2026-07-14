import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { requireAuth } from '@/lib/require-auth';
import { blobAuthOptions, hasBlobCredentials } from '@/lib/blob-auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// 単体取得・削除。いずれも owner 検証必須（他人の行は見えない・消せない）。

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const { id } = await params;
    const rows = await sql`
      SELECT id, blob_url, pathname, prompt, settings, title, source,
             width, height, bytes, created_at
      FROM image_gallery
      WHERE id = ${id} AND owner = ${userId}
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    }
    return NextResponse.json({ image: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gallery GET id]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 削除は Blob → DB の順（片方失敗時に「DBに無いのに実体が残る」孤児を作らない）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: 'Blobストアが未設定です（BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN）' },
      { status: 500 },
    );
  }

  try {
    const { id } = await params;
    // owner検証を兼ねた取得（他人の行はここで 404）
    const rows = await sql`
      SELECT pathname FROM image_gallery
      WHERE id = ${id} AND owner = ${userId}
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    }

    await del(String(rows[0].pathname), blobAuthOptions());
    await sql`
      DELETE FROM image_gallery
      WHERE id = ${id} AND owner = ${userId}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gallery DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
