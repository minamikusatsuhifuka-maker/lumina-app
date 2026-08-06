import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { put, del } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { blobAuthOptions, hasBlobCredentials } from '@/lib/blob-auth';
import { fetchJpFonts } from '@/lib/og-fonts';
import type { KindleBookSummaries } from '@/lib/kindle-summaries';
import {
  buildSummaryImageElement,
  collectSummaryImageText,
  estimateSummaryImageHeight,
  SUMMARY_IMAGE_WIDTH,
  SUMMARY_IMAGE_TEMPLATES,
  type SummaryImageData,
  type SummaryImageEntry,
  type SummaryImageTemplateKey,
} from '@/lib/kindle-summary-image-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 227【C】: まとめビジュアル画像（方式b=プログラム描画・next/og）。
// 文字はsatoriが「編集後のまとめデータ」をそのまま描く＝100%正確（AIの創作・再要約なし）。
// - POST { bookId, target:'chapter'|'book', chapterId?, template }: 描画→Blob保存→
//   book_meta.summaryImages へ jsonb_set マージ（224方式）。sourceUpdatedAtで古さ検知
// - DELETE { bookId, target, chapterId? }: メタ削除＋Blob削除（✕不使用）
// fail-closed: フォント取得・描画・保存の失敗はエラー返却のみ（既存データ無傷）。

// フォント取得は lib/og-fonts.ts（228でnote共用化のため抽出。キャッシュ含め挙動不変）

interface Target {
  target: 'chapter' | 'book';
  chapterId: number | null;
  book: any;
}

async function resolveTarget(sql: any, userId: string, body: any): Promise<{ t?: Target; error?: NextResponse }> {
  const bookId = Number(body.bookId);
  if (!Number.isFinite(bookId)) return { error: NextResponse.json({ error: 'bookIdが必要です' }, { status: 400 }) };
  const target = body.target === 'book' ? 'book' : body.target === 'chapter' ? 'chapter' : null;
  if (!target) return { error: NextResponse.json({ error: 'targetはchapter/bookのいずれかです' }, { status: 400 }) };
  const [book] = await sql`
    SELECT id, title, book_meta FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
  `;
  if (!book) return { error: NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 }) };
  let chapterId: number | null = null;
  if (target === 'chapter') {
    chapterId = Number(body.chapterId);
    if (!Number.isFinite(chapterId)) return { error: NextResponse.json({ error: 'chapterIdが必要です' }, { status: 400 }) };
  }
  return { t: { target, chapterId, book } };
}

function existingEntry(t: Target): SummaryImageEntry | null {
  const si = t.book?.book_meta?.summaryImages ?? {};
  return t.target === 'book' ? (si.book ?? null) : (si.chapters?.[String(t.chapterId)] ?? null);
}

async function saveEntry(sql: any, t: Target, entry: SummaryImageEntry) {
  if (t.target === 'book') {
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{summaryImages}', COALESCE(book_meta->'summaryImages', '{}'::jsonb), true),
          '{summaryImages,book}', ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${t.book.id}
    `;
  } else {
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{summaryImages}', COALESCE(book_meta->'summaryImages', '{}'::jsonb), true),
            '{summaryImages,chapters}', COALESCE(book_meta->'summaryImages'->'chapters', '{}'::jsonb), true
          ),
          ${['summaryImages', 'chapters', String(t.chapterId)]}::text[], ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${t.book.id}
    `;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    if (!hasBlobCredentials()) {
      return NextResponse.json({ error: 'Blobストアが未設定です（BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN）' }, { status: 500 });
    }
    const template: SummaryImageTemplateKey =
      typeof body.template === 'string' && body.template in SUMMARY_IMAGE_TEMPLATES ? body.template : 'card';

    const sql = neon(process.env.DATABASE_URL!);
    const { t, error } = await resolveTarget(sql, userId, body);
    if (error) return error;
    const target = t!;

    const summaries: KindleBookSummaries = target.book.book_meta?.summaries ?? {};
    const chapters = (await sql`
      SELECT id, chapter_number, title FROM kindle_chapters
      WHERE book_id = ${target.book.id} ORDER BY chapter_number ASC
    `) as { id: number; chapter_number: number; title: string }[];

    // 描画データ（ソースは編集後のまとめデータのみ＝文言の創作をしない）
    let data: SummaryImageData;
    let sourceUpdatedAt: string;
    if (target.target === 'chapter') {
      const ch = chapters.find((c) => c.id === target.chapterId);
      if (!ch) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
      const entry = summaries[String(ch.id)];
      if (!entry || entry.points.length === 0) {
        return NextResponse.json({ error: 'この章のまとめがまだありません（⑤の📝まとめで生成・保存してください）' }, { status: 400 });
      }
      data = { title: `第${ch.chapter_number}章 ${ch.title}｜この章のまとめ`, groups: [{ points: entry.points }] };
      sourceUpdatedAt = entry.updatedAt;
    } else {
      const groups = chapters
        .filter((c) => (summaries[String(c.id)]?.points ?? []).length > 0)
        .map((c) => ({ heading: `第${c.chapter_number}章 ${c.title}`, points: summaries[String(c.id)].points }));
      if (groups.length === 0) {
        return NextResponse.json({ error: 'まとめのある章がありません（⑤の📝まとめで生成・保存してください）' }, { status: 400 });
      }
      data = { title: `${target.book.title}｜全章まとめ`, groups };
      sourceUpdatedAt = chapters
        .map((c) => summaries[String(c.id)]?.updatedAt || '')
        .filter(Boolean)
        .sort()
        .pop() as string;
    }

    // フォント（テキスト単位サブセット）→ 描画 → PNG
    const fonts = await fetchJpFonts(collectSummaryImageText(data));
    const height = estimateSummaryImageHeight(template, data);
    const img = new ImageResponse(buildSummaryImageElement(template, data) as any, {
      width: SUMMARY_IMAGE_WIDTH,
      height,
      fonts,
    });
    const buffer = Buffer.from(await img.arrayBuffer());
    if (buffer.length === 0) return NextResponse.json({ error: '画像の描画に失敗しました' }, { status: 500 });

    const suffix = target.target === 'book' ? 'summary-book' : `summary-ch${target.chapterId}`;
    const { url, pathname } = await put(
      `kindle/${userId}/${target.book.id}/${suffix}-${randomUUID()}.png`,
      buffer,
      { access: 'public', contentType: 'image/png', ...blobAuthOptions() },
    );

    const old = existingEntry(target);
    const entry: SummaryImageEntry = { url, pathname, template, sourceUpdatedAt, updatedAt: new Date().toISOString() };
    await saveEntry(sql, target, entry);
    if (old?.pathname) {
      try {
        await del(old.pathname, blobAuthOptions());
      } catch {
        /* 孤児Blobは実害なし（コスト極小）のため握りつぶす */
      }
    }
    return NextResponse.json({ success: true, entry, height });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/summary-image POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL!);
    const { t, error } = await resolveTarget(sql, userId, body);
    if (error) return error;
    const target = t!;

    const old = existingEntry(target);
    if (!old) return NextResponse.json({ error: '対象の画像がありません' }, { status: 404 });
    const path = target.target === 'book' ? ['summaryImages', 'book'] : ['summaryImages', 'chapters', String(target.chapterId)];
    await sql`
      UPDATE kindle_books SET book_meta = book_meta #- ${path}::text[], updated_at = NOW()
      WHERE id = ${target.book.id}
    `;
    if (old.pathname) {
      try {
        await del(old.pathname, blobAuthOptions());
      } catch {
        /* Blob削除失敗は孤児化のみ（メタは消えている）のため握りつぶす */
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/summary-image DELETE] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
