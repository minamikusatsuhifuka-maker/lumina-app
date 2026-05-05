import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// 書籍プロジェクト管理API
function toCamelBook(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    language: row.language,
    genre: row.genre,
    targetAudience: row.target_audience,
    targetWordCount: row.target_word_count,
    currentWordCount: row.current_word_count,
    marketingStrategy: row.marketing_strategy,
    tableOfContents: row.table_of_contents ?? [],
    status: row.status,
    phase: row.phase,
    messages: row.messages ?? [],
    bookMeta: row.book_meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCamelChapter(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    bookId: row.book_id,
    chapterNumber: row.chapter_number,
    number: row.chapter_number,
    title: row.title,
    summary: row.summary,
    targetWordCount: row.target_word_count,
    target_word_count: row.target_word_count,
    content: row.content,
    researchData: row.research_data,
    references: row.refs ?? [],
    evaluation: row.evaluation,
    improvements: row.improvements ?? [],
    isPolished: row.is_polished,
    spellChecked: row.spell_checked,
    status: row.status,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const [book] = await sql`
      SELECT * FROM kindle_books
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });
    const chapters = await sql`
      SELECT * FROM kindle_chapters WHERE book_id = ${parseInt(id, 10)}
      ORDER BY chapter_number ASC
    `;
    return NextResponse.json({
      book: toCamelBook(book),
      chapters: chapters.map(toCamelChapter),
    });
  }

  const books = await sql`
    SELECT id, title, subtitle, language, genre, status, phase,
           target_word_count, current_word_count, created_at, updated_at
    FROM kindle_books
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 20
  `;
  return NextResponse.json({ books: books.map(toCamelBook) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { title, language } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const [book] = await sql`
    INSERT INTO kindle_books (user_id, title, language)
    VALUES (${userId}, ${title ?? '新しい書籍'}, ${language ?? 'ja'})
    RETURNING *
  `;
  return NextResponse.json({ book: toCamelBook(book) });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const { id, ...f } = body;
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const [book] = await sql`
    UPDATE kindle_books SET
      title = COALESCE(${f.title ?? null}, title),
      subtitle = COALESCE(${f.subtitle ?? null}, subtitle),
      language = COALESCE(${f.language ?? null}, language),
      genre = COALESCE(${f.genre ?? null}, genre),
      target_audience = COALESCE(${f.targetAudience ?? null}, target_audience),
      target_word_count = COALESCE(${f.targetWordCount ?? null}, target_word_count),
      marketing_strategy = COALESCE(${f.marketingStrategy ? JSON.stringify(f.marketingStrategy) : null}::jsonb, marketing_strategy),
      table_of_contents = COALESCE(${f.tableOfContents ? JSON.stringify(f.tableOfContents) : null}::jsonb, table_of_contents),
      status = COALESCE(${f.status ?? null}, status),
      phase = COALESCE(${f.phase ?? null}, phase),
      messages = COALESCE(${f.messages ? JSON.stringify(f.messages) : null}::jsonb, messages),
      book_meta = COALESCE(${f.bookMeta ? JSON.stringify(f.bookMeta) : null}::jsonb, book_meta),
      updated_at = NOW()
    WHERE id = ${parseInt(String(id), 10)} AND user_id = ${userId}
    RETURNING *
  `;
  if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });
  return NextResponse.json({ book: toCamelBook(book) });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM kindle_books WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
