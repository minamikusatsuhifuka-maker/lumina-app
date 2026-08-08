import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/lib/require-auth';
import { neon } from '@neondatabase/serverless';
import { sanitizeForDb } from '@/lib/sanitize';

export const runtime = 'nodejs';

// 229B: Kindle→note展開の保存（唯一の書き込み口・人間確認型の保存ボタンから呼ぶ）。
// library への記事INSERTと、kindle_books.book_meta.noteArticleIds への追記（相互リンク）を
// サーバ側で同時に行う（229設計#6の4キー案）。
// - library.metadata: { from:'kindle-book', sourceBookId, sourceChapterId, sourceChapterNumber, style, savedAt }
// - book_meta.noteArticleIds: string[]（224で確立したjsonb_setマージ方式で追記＝他キーと同居）
// 自動カテゴライズは呼び出し側がSaveToLibraryButtonと同じくfire-and-forgetで実行する。

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const userId = guard.userId;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      bookId?: unknown;
      chapterId?: unknown;
      chapterNumber?: unknown;
      title?: unknown;
      content?: unknown;
      style?: unknown;
    };
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId) || !title || !content) {
      return NextResponse.json({ error: 'bookId・chapterId・title・contentが必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    // 所有者検証（本が自分のものであること）
    const [book] = await sql`
      SELECT id FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
    `;
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

    const id = randomUUID();
    const metadata = JSON.stringify({
      from: 'kindle-book',
      sourceBookId: bookId,
      sourceChapterId: chapterId,
      sourceChapterNumber: Number(body.chapterNumber) || null,
      style: typeof body.style === 'string' ? body.style : undefined,
      savedAt: new Date().toISOString(),
    });
    await sql`
      INSERT INTO library (id, user_id, type, title, content, metadata, is_favorite, tags, group_name)
      VALUES (${id}, ${userId}, 'note-article', ${sanitizeForDb(`note記事下書き: ${title}`)}, ${sanitizeForDb(content)},
              ${metadata}, 0, ${'note記事,下書き,Kindle展開'}, ${'note記事'})
    `;

    // 相互リンク: book_meta.noteArticleIds へ追記（新規uuidのため重複しない・失敗しても記事は保存済み）
    try {
      await sql`
        UPDATE kindle_books SET book_meta =
          jsonb_set(
            COALESCE(book_meta, '{}'::jsonb),
            '{noteArticleIds}',
            COALESCE(book_meta->'noteArticleIds', '[]'::jsonb) || to_jsonb(${id}::text),
            true
          ),
          updated_at = NOW()
        WHERE id = ${bookId} AND user_id = ${userId}
      `;
    } catch (e) {
      console.warn('[kindle/to-note/save] noteArticleIds追記に失敗（記事保存は成功）:', e);
    }

    return NextResponse.json({ id, title });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/to-note/save] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
