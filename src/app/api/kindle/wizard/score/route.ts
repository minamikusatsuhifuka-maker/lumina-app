import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { getKindlePurpose, KINDLE_COMMON_RULES } from '@/lib/kindle-purposes';
import { KINDLE_SCORE_AXES, type KindleChapterScore } from '@/lib/kindle-taste';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 236A: 章の採点（診断）。224の校正（個別の修正提案）とは役割が別。
// - POST { bookId, chapterId } → 5軸5段階＋講評＋改善の要点3つ
// - 保存は book_meta.scores.<章ID> への jsonb_set マージ（224/227と同方式・同居キーを壊さない）
// - fail-closed: パース失敗・軸欠損は保存せず500（既存スコア・本文は無傷）
// - 235: Claude上限時はGeminiへ自動フォールバック（どちらで採点したかも保存する）

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId)) {
      return NextResponse.json({ error: 'bookId / chapterId が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = (await sql`
      SELECT id, title, target_reader, book_meta FROM kindle_books
      WHERE id = ${bookId} AND user_id = ${userId}
    `) as { id: number; title: string; target_reader: string | null; book_meta: any }[];
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

    const [chapter] = (await sql`
      SELECT id, chapter_number, title, content FROM kindle_chapters
      WHERE id = ${chapterId} AND book_id = ${bookId}
    `) as { id: number; chapter_number: number; title: string; content: string | null }[];
    if (!chapter) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
    const content = chapter.content || '';
    if (!content.trim()) return NextResponse.json({ error: '章の本文が空です' }, { status: 400 });

    const purpose = getKindlePurpose(book.book_meta?.purposeKey);
    const axisLines = KINDLE_SCORE_AXES.map((a) => `- ${a.key}（${a.label}）: ${a.criteria}`).join('\n');

    const system = `あなたは書籍編集のプロです。Kindle書籍の1章を読み、5つの観点で採点し、改善の要点を示してください。

# この本の目的
${purpose.label}

# 採点の観点（各1〜5の整数。5が最良）
${axisLines}

# 採点の姿勢
- 忖度せず、直すべき点を具体的に指摘する。ただし人格ではなく文章を評価する
- 「目的との整合」は上記の本の目的に照らして判断する
- 改善の要点は「何を・どう直すと・どう良くなるか」が分かる形で、実行可能な粒度にする

# 厳守事項
${KINDLE_COMMON_RULES}
- 素材にない事実の追加を改善案として提案しない（表現・構成の改善に留める）
- 誇張・断定・不安煽り・医療広告NG表現を改善案として提案しない

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"scores": {${KINDLE_SCORE_AXES.map((a) => `"${a.key}": 3`).join(', ')}}, "comment": "全体講評（2〜3文）", "improvements": ["改善の要点1", "改善の要点2", "改善の要点3"]}`;

    const ai = await generateTextWithFallback({
      system,
      maxTokens: 3000,
      messages: [
        {
          role: 'user',
          content: `以下の章を採点してください。\n\n書籍タイトル: ${book.title}\nターゲット読者: ${book.target_reader ?? '（未設定）'}\n\n第${chapter.chapter_number}章「${chapter.title}」\n\n--- 本文 ---\n${content}\n--- ここまで ---`,
        },
      ],
    });

    // fail-closed: 5軸が揃わない結果は保存しない（欠損を3点で埋めて「採点済み」に見せない）
    const parsed = robustJsonParse<{ scores?: Record<string, unknown>; comment?: unknown; improvements?: unknown }>(ai.text);
    const scores: Record<string, number> = {};
    for (const axis of KINDLE_SCORE_AXES) {
      const raw = Number(parsed?.scores?.[axis.key]);
      if (!Number.isFinite(raw)) {
        return NextResponse.json({ error: `採点結果に「${axis.label}」がありません（再試行してください）` }, { status: 500 });
      }
      scores[axis.key] = Math.min(5, Math.max(1, Math.round(raw)));
    }
    const improvements = (Array.isArray(parsed?.improvements) ? parsed.improvements : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 5);
    if (improvements.length === 0) {
      return NextResponse.json({ error: '改善の要点を取得できませんでした（再試行してください）' }, { status: 500 });
    }

    const values = KINDLE_SCORE_AXES.map((a) => scores[a.key]);
    const entry: KindleChapterScore = {
      scores,
      average: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
      comment: String(parsed?.comment ?? '').trim(),
      improvements,
      scoredAt: new Date().toISOString(),
      provider: ai.provider,
      modelLabel: ai.modelLabel,
    };

    // book_meta.scores.<章ID> へマージ（親パスを先に確保してから書く＝227で確立した作法）
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{scores}', COALESCE(book_meta->'scores', '{}'::jsonb), true),
          ${['scores', String(chapterId)]}::text[], ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${bookId} AND user_id = ${userId}
    `;

    return NextResponse.json({ success: true, chapterId, score: entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/score] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
