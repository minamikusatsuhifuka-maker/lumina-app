import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 190①: HPブログの「読者（ターゲット）」をテーマからAIが提案する。
// 人間確認型: 候補を返すだけ。入力欄への反映はユーザーのクリック操作（手入力の既存挙動は不変）。

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
    if (!theme) {
      return NextResponse.json({ error: 'テーマを入力してください' }, { status: 400 });
    }

    const systemPrompt =
      'あなたは皮膚科クリニックの広報担当です。ブログ記事のテーマから、読者として最も多いと考えられる層を提案します。';

    const prompt = `以下のブログ記事テーマについて、読者（ターゲット）の候補を3つ提案してください。

【厳守事項】
- 各候補は1行・40字以内。「水仕事の多い30〜40代女性／育児中の方」のように具体的な生活像で書く。
- 割合・統計などの数値を書かない（「◯％が該当」等は禁止。年代表現「30〜40代」はよい）。
- 前置き・見出し・番号・記号は不要。候補のみを1行ずつ出力する。

テーマ: ${theme}`;

    // Gemini 3.x は思考が既定ONのため出力枠を大きめに確保（eyecatch/prompt と同方針）
    const raw = await generateWithModel('gemini', prompt, systemPrompt, 4096);

    const suggestions = raw
      .split('\n')
      // 箇条書き記号・番号（「1. 」「1) 」等）だけを剥がす。「30〜40代…」の先頭数字は消さない
      .map((s) => s.replace(/^\s*(?:[-・*•]|\d+[.)．）])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: '提案を作成できませんでした。もう一度お試しください。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[hp-blog/suggest-target]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
