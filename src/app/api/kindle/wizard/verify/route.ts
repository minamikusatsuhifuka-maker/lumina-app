import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { fetchKindleMaterials } from '@/lib/kindle-materials';
import { findUngroundedTerms, findBannedExpressions, type UngroundedTerm, type BannedExpression } from '@/lib/content-verify';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 233②: Kindleウィザードの内容検証（素材照合＋禁止表現）。
// - AI呼び出しゼロ。素材本文と章本文の文字列照合のみなので数百msで返る
// - **表示のみ**。DBに保存せず、本文も一切書き換えない（RULES.md R-26）
// - 素材本文はサーバ側でowner検証つきに取得する（kindle-materials.ts と同方針＝
//   クライアントに素材全文を渡さない）
//
// POST { bookId } → { chapters: [{ chapterId, chapterNumber, title, ungrounded, banned }], materialCount, totalIssues }

interface ChapterVerify {
  chapterId: number;
  chapterNumber: number;
  title: string;
  ungrounded: UngroundedTerm[];
  banned: BannedExpression[];
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    if (!Number.isFinite(bookId)) return NextResponse.json({ error: 'bookIdが必要です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = (await sql`
      SELECT id, book_meta FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
    `) as { id: number; book_meta: { sourceIds?: unknown } | null }[];
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

    const sourceIds = Array.isArray(book.book_meta?.sourceIds)
      ? (book.book_meta.sourceIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];

    const chapters = (await sql`
      SELECT id, chapter_number, title, content FROM kindle_chapters
      WHERE book_id = ${bookId} AND content IS NOT NULL AND content <> ''
      ORDER BY chapter_number ASC
    `) as { id: number; chapter_number: number; title: string; content: string }[];
    if (chapters.length === 0) {
      return NextResponse.json({ error: '本文のある章がまだありません' }, { status: 400 });
    }

    // 素材が0件でも禁止表現チェックは実施する（素材照合だけスキップ＝warningを返せる形を保つ）
    const materials = sourceIds.length > 0 ? await fetchKindleMaterials(userId, sourceIds) : [];
    const sourceTexts = materials.map((m) => m.text).filter(Boolean);

    // 章タイトル・本のタイトルは院長が確定させたものなので、素材と同格の「根拠あり」として扱う
    // （目次編集で入れた固有名詞が毎章「素材にない」と出るのを防ぐ）
    const titleContext = chapters.map((c) => c.title).join('\n');
    const grounds = sourceTexts.length > 0 ? [...sourceTexts, titleContext] : [];

    const results: ChapterVerify[] = chapters.map((c) => ({
      chapterId: c.id,
      chapterNumber: c.chapter_number,
      title: c.title,
      ungrounded: grounds.length > 0 ? findUngroundedTerms(c.content, grounds, { maxResults: 20 }) : [],
      banned: findBannedExpressions(c.content, { maxResults: 20 }),
    }));

    const totalUngrounded = results.reduce((s, r) => s + r.ungrounded.length, 0);
    const totalBanned = results.reduce((s, r) => s + r.banned.length, 0);
    // 238【3】: 優先度別の件数。画面は既定で🔴（要確認）だけを出す
    const totalUngroundedHigh = results.reduce(
      (s, r) => s + r.ungrounded.filter((u) => u.priority === 'high').length,
      0,
    );

    return NextResponse.json({
      success: true,
      chapters: results,
      materialCount: materials.length,
      groundingSkipped: grounds.length === 0,
      totalUngrounded,
      totalUngroundedHigh,
      totalUngroundedLow: totalUngrounded - totalUngroundedHigh,
      totalBanned,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/verify] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
