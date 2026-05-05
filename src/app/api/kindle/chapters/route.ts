import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// 章の作成・更新API（書籍の所有者チェック付き）

async function checkBookOwner(sql: any, bookId: number, userId: string) {
  const [row] = await sql`SELECT user_id FROM kindle_books WHERE id = ${bookId}`;
  return row && row.user_id === userId;
}

async function checkChapterOwner(sql: any, chapterId: number, userId: string) {
  const [row] = await sql`
    SELECT b.user_id, c.book_id
    FROM kindle_chapters c
    JOIN kindle_books b ON b.id = c.book_id
    WHERE c.id = ${chapterId}
  `;
  return row && row.user_id === userId ? row.book_id : null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { bookId, chapterNumber, title, summary, targetWordCount } = await req.json();
  if (!bookId || !title || chapterNumber === undefined) {
    return NextResponse.json({ error: 'bookId/chapterNumber/titleが必要' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const owns = await checkBookOwner(sql, parseInt(String(bookId), 10), userId);
  if (!owns) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const [chapter] = await sql`
    INSERT INTO kindle_chapters (book_id, chapter_number, title, summary, target_word_count)
    VALUES (${parseInt(String(bookId), 10)}, ${chapterNumber}, ${title}, ${summary ?? null}, ${targetWordCount ?? 3000})
    RETURNING *
  `;
  return NextResponse.json({ chapter });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const { id, ...f } = body;
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const bookId = await checkChapterOwner(sql, parseInt(String(id), 10), userId);
  if (!bookId) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const [chapter] = await sql`
    UPDATE kindle_chapters SET
      title = COALESCE(${f.title ?? null}, title),
      summary = COALESCE(${f.summary ?? null}, summary),
      target_word_count = COALESCE(${f.targetWordCount ?? null}, target_word_count),
      content = COALESCE(${f.content ?? null}, content),
      research_data = COALESCE(${f.researchData ?? null}, research_data),
      refs = COALESCE(${f.references ? JSON.stringify(f.references) : null}::jsonb, refs),
      evaluation = COALESCE(${f.evaluation ? JSON.stringify(f.evaluation) : null}::jsonb, evaluation),
      improvements = COALESCE(${f.improvements ? JSON.stringify(f.improvements) : null}::jsonb, improvements),
      is_polished = COALESCE(${f.isPolished ?? null}, is_polished),
      spell_checked = COALESCE(${f.spellChecked ?? null}, spell_checked),
      status = COALESCE(${f.status ?? null}, status),
      updated_at = NOW()
    WHERE id = ${parseInt(String(id), 10)}
    RETURNING *
  `;

  // 書籍の総文字数を更新（contentが変わった場合）
  if (f.content !== undefined && chapter) {
    await sql`
      UPDATE kindle_books SET
        current_word_count = (
          SELECT COALESCE(SUM(LENGTH(content)), 0)
          FROM kindle_chapters WHERE book_id = ${chapter.book_id}
        ),
        updated_at = NOW()
      WHERE id = ${chapter.book_id}
    `;
  }
  return NextResponse.json({ chapter });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const bookId = await checkChapterOwner(sql, parseInt(id, 10), userId);
  if (!bookId) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  await sql`DELETE FROM kindle_chapters WHERE id = ${parseInt(id, 10)}`;
  return NextResponse.json({ success: true });
}
