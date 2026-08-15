import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { neon } from '@neondatabase/serverless';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { checkMedicalAd, MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { getNoteStyle, NOTE_COMMON_RULES } from '@/lib/note-styles';
import { NOTE_WRITING_DESIGN, KINDLE_TO_NOTE_RULES } from '@/lib/note-writing';
import { getMyStylePrompt } from '@/lib/my-style-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 229B: Kindle章→note記事のリライト（1リクエスト=1章=1記事・クライアント直列キュー=note-bundleと同型）。
// - 素材=章content＋章まとめ（book_meta.summaries・227B）があれば要点も注入
// - 品質規約はnote生成2経路と完全同格: note-styles＋NOTE_WRITING_DESIGN＋NOTE_COMMON_RULES＋
//   医療広告ガード＋checkMedicalAd後付け＋マイ文体（228c・未設定は空）
// - 生成のみ（保存は /api/kindle/to-note/save が唯一の書き込み口=人間確認型）

type Length = 'short' | 'medium' | 'long';
const LENGTH_CONFIG: Record<Length, { label: string; chars: string }> = {
  short: { label: '短め', chars: '1500〜2500字' },
  medium: { label: '標準', chars: '3000〜4500字' },
  long: { label: '長め', chars: '5000〜7000字' },
};

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const userId = guard.userId;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      bookId?: unknown;
      chapterId?: unknown;
      style?: unknown;
      length?: unknown;
      model?: unknown;
    };
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId)) {
      return NextResponse.json({ error: 'bookIdとchapterIdが必要です' }, { status: 400 });
    }
    const style = getNoteStyle(body.style);
    const length: Length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';
    const aiModel = body.model === 'claude' ? 'claude' : DEFAULT_AI_MODEL;

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = await sql`
      SELECT id, title, book_meta FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
    `;
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });
    const [chapter] = await sql`
      SELECT id, chapter_number, title, content FROM kindle_chapters
      WHERE id = ${chapterId} AND book_id = ${bookId}
    `;
    if (!chapter) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
    if (!chapter.content || !String(chapter.content).trim()) {
      return NextResponse.json({ error: 'この章はまだ本文が生成されていません' }, { status: 400 });
    }

    // 227Bの章まとめ（あれば要点として注入。文言はそのまま使わせず内容の芯として渡す）
    const summaryPoints: string[] = Array.isArray(book.book_meta?.summaries?.[String(chapterId)]?.points)
      ? book.book_meta.summaries[String(chapterId)].points
      : [];
    const summarySection = summaryPoints.length > 0
      ? `\n# この章の要点（まとめ済み・記事の芯にする）\n${summaryPoints.map((p: string) => `- ${p}`).join('\n')}\n`
      : '';

    // 228c: マイ文体（未設定・無効・失敗は空文字）
    const myStyleBlock = await getMyStylePrompt(userId);

    const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

    const config = LENGTH_CONFIG[length];
    const prompt = `以下の「書籍の1章」を素材に、note記事を執筆してください。

${KINDLE_TO_NOTE_RULES}

# 記事の長さ
${config.label}（${config.chars}）

${style.promptBlock}
${myStyleBlock ? `\n${myStyleBlock}\n` : ''}
${NOTE_WRITING_DESIGN}

# 素材（書籍「${book.title}」第${chapter.chapter_number}章「${chapter.title}」の本文）
${String(chapter.content).slice(0, 40_000)}
${summarySection}
# 出力形式
- Markdown 形式（先頭に # 記事タイトルを置く。前置き・コードフェンス不要）
- 見出しは ## / ### を活用し、適度に箇条書きを使用

# 厳守事項
- ${config.chars} の範囲内で、必ず最後の結論まで書ききる
- 根拠は素材の記述のみ。素材に無い出典・数値・固有の研究名を新たに書かない
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に`;

    const content = await generateWithModel(aiModel, prompt, system, 12000, GEMINI_TEXT_THINKING_MEDIUM);
    if (!content || !content.trim()) {
      return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }

    // 先頭の # 行を記事タイトルとして抽出（無ければ章タイトルでフォールバック）
    const titleMatch = /^#\s+(.+)$/m.exec(content);
    const articleTitle = (titleMatch?.[1] ?? `${chapter.title}`).trim().slice(0, 80);

    const adCheck = await checkMedicalAd(content);

    return NextResponse.json({
      content,
      title: articleTitle,
      ad_check: adCheck,
      style: style.key,
      chapterNumber: chapter.chapter_number,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/to-note] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
