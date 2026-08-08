import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { KINDLE_COMMON_RULES } from '@/lib/kindle-purposes';
import { normalizeSummaryPoints, type KindleChapterSummary } from '@/lib/kindle-summaries';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 227【B】: 章ごとの独立まとめ欄（要点箇条書き3〜5点）。
// - POST { bookId, chapterId }: 章本文から要点を生成し book_meta.summaries.<章ID> に保存（source:'auto'）
// - PUT  { bookId, chapterId, points }: 編集UIからの保存（source:'edited'）
// 保存は book_meta.summaries 配下への jsonb_set マージ（224 proofread と同方式・
// 丸ごと置換をしないため proofread 等の同居キーを壊さない）。
// fail-closed: 生成のパース失敗時は保存せず500（既存のまとめ・本文は無傷）。
// 生成は章本文のみを入力とし、素材にない事実の追加を禁止する（KINDLE_COMMON_RULES適用）。

async function saveSummary(sql: any, bookId: number, chapterId: number, entry: KindleChapterSummary) {
  await sql`
    UPDATE kindle_books SET book_meta =
      jsonb_set(
        jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{summaries}', COALESCE(book_meta->'summaries', '{}'::jsonb), true),
        ${['summaries', String(chapterId)]}::text[], ${JSON.stringify(entry)}::jsonb, true
      ),
      updated_at = NOW()
    WHERE id = ${bookId}
  `;
}

async function loadOwnedChapter(sql: any, userId: string, bookId: number, chapterId: number) {
  const [book] = await sql`
    SELECT id FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
  `;
  if (!book) return { error: NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 }) };
  const [chapter] = await sql`
    SELECT id, chapter_number, title, content FROM kindle_chapters
    WHERE id = ${chapterId} AND book_id = ${bookId}
  `;
  if (!chapter) return { error: NextResponse.json({ error: '章が見つかりません' }, { status: 404 }) };
  return { chapter };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId)) {
      return NextResponse.json({ error: 'bookId / chapterId が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const { chapter, error } = await loadOwnedChapter(sql, userId, bookId, chapterId);
    if (error) return error;
    const content: string = chapter.content || '';
    if (!content.trim()) return NextResponse.json({ error: '章の本文が空です' }, { status: 400 });

    // 235: 生成は ai-fallback に集約。Anthropicキーの有無で門前払いしない（Geminiだけでも動く）
    const system = `あなたは書籍編集のプロです。章の本文から、読者が持ち帰るべき要点を3〜5個の箇条書きで抽出してください。

# 厳守事項
${KINDLE_COMMON_RULES}
- 要点は章の本文に書かれている内容のみから作る。本文にない事実・数値・提案を加えない
- 各要点は40〜60字程度の短い1文で、その章の核心が伝わるようにする
- 本文中の「この章のまとめ」「この章でわかること」がある場合も、丸写しせず本文全体から要点を選び直す

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"points": ["要点1", "要点2", "要点3"]}`;

    // 235: 共通層でClaude→Gemini自動フォールバック（上限・混雑時のみ切替）
    const ai = await generateTextWithFallback({
      system,
      maxTokens: 2048,
      messages: [{
        role: 'user',
        content: `以下の章の要点を抽出してください。\n\n章タイトル: 第${chapter.chapter_number}章 ${chapter.title}\n\n--- 章の本文 ---\n${content}\n--- ここまで ---`,
      }],
    });

    // fail-closed: パース失敗・要点0件は保存しない
    const text = ai.text;
    const parsed = robustJsonParse<{ points?: unknown }>(text);
    const points = normalizeSummaryPoints(parsed?.points);
    if (points.length === 0) {
      return NextResponse.json({ error: '要点を抽出できませんでした（再試行してください）' }, { status: 500 });
    }

    const entry: KindleChapterSummary = { points, updatedAt: new Date().toISOString(), source: 'auto' };
    await saveSummary(sql, bookId, chapterId, entry);
    return NextResponse.json({ success: true, chapterId, summary: entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/summaries POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    const points = normalizeSummaryPoints(body.points);
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId)) {
      return NextResponse.json({ error: 'bookId / chapterId が必要です' }, { status: 400 });
    }
    if (points.length === 0) {
      return NextResponse.json({ error: '要点が空です（1点以上必要）' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const { error } = await loadOwnedChapter(sql, userId, bookId, chapterId);
    if (error) return error;

    const entry: KindleChapterSummary = { points, updatedAt: new Date().toISOString(), source: 'edited' };
    await saveSummary(sql, bookId, chapterId, entry);
    return NextResponse.json({ success: true, chapterId, summary: entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/summaries PUT] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
