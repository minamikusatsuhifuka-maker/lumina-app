import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface DbReview {
  author_name: string;
  rating: number;
  text: string | null;
  source: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { reviews, name, rating, totalReviews } = await req.json();

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json({ error: 'reviews が必要です' }, { status: 400 });
    }

    // DB保存済みの口コミも取得して分析対象に含める
    let dbReviews: DbReview[] = [];
    try {
      const sql = neon(process.env.DATABASE_URL!);
      dbReviews = await sql`
        SELECT author_name, rating, text, source
        FROM clinic_reviews
        ORDER BY created_at DESC
      ` as DbReview[];
    } catch {
      // DBテーブル未作成などでも分析は継続
    }

    const placesReviewTexts = reviews
      .map((r: { rating: number; author: string; text: string }, i: number) =>
        `${i + 1}. [${r.rating}★] ${r.author}（Google Places）: ${r.text}`)
      .join('\n\n');

    const dbReviewTexts = dbReviews
      .map((r, i) =>
        `${reviews.length + i + 1}. [${r.rating}★] ${r.author_name}（${r.source === 'manual' ? '手動登録' : r.source}）: ${r.text ?? ''}`)
      .join('\n\n');

    const allReviewTexts = [placesReviewTexts, dbReviewTexts].filter(Boolean).join('\n\n');
    const totalAnalyzed = reviews.length + dbReviews.length;

    const prompt = `あなたは皮膚科クリニックの口コミ分析・評判管理の専門家です。以下の口コミを分析してください。

## クリニック情報
- 名前: ${name}
- 総合評価: ${rating}/5.0（${totalReviews}件）
- 分析対象の口コミ数: ${totalAnalyzed}件（Google Places: ${reviews.length}件、DB保存: ${dbReviews.length}件）

## 分析対象の口コミ
${allReviewTexts}

以下のJSON形式で回答してください:
{
  "summary": "全体的な口コミの傾向サマリー（2〜3文）",
  "strengths": ["良い点を3〜5個（具体的に）"],
  "improvements": ["改善が必要な点を3〜5個（具体的なアクション提案付き）"],
  "replyIdeas": ["返信テンプレート案を3個（ポジティブ口コミ用1つ、ネガティブ口コミ用1つ、一般的な感謝の返信1つ）"]
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        summary: text,
        strengths: [],
        improvements: [],
        replyIdeas: [],
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      summary: parsed.summary || '',
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || [],
      replyIdeas: parsed.replyIdeas || [],
      analyzedCount: totalAnalyzed,
      placesCount: reviews.length,
      dbCount: dbReviews.length,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[places/reviews/analyze] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
