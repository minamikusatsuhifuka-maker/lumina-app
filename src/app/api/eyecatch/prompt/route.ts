import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

// アイキャッチ用の画像生成プロンプトを本文からAI起案する（人間確認型：起案のみ・生成はしない）。
// 既定AIは Gemini 3.5-flash。画像生成コア（/api/image-gen）には手を入れない。

const KIND_HINT: Record<string, string> = {
  note: 'note記事のヘッダー画像（横長・読み物の雰囲気）',
  sns: 'SNS投稿のサムネイル（正方形・目を引くが上品）',
  lp: 'ランディングページのメインビジュアル（横長・信頼感）',
};

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const sourceTitle = typeof body.sourceTitle === 'string' ? body.sourceTitle : '';
    const kind = typeof body.kind === 'string' ? body.kind : 'note';
    if (!sourceText.trim()) {
      return NextResponse.json({ error: '本文がありません' }, { status: 400 });
    }

    // 本文は先頭のみ使う（プロンプト起案に全文は不要・トークン節約）
    const excerpt = sourceText.slice(0, 2000);
    const kindHint = KIND_HINT[kind] ?? KIND_HINT.note;

    const systemPrompt =
      'あなたは医療クリニックの広報デザイナーです。文章の内容に合う「アイキャッチ画像」の生成プロンプトを1つ作成します。';

    const prompt = `以下の文章に合うアイキャッチ画像の生成プロンプトを日本語で1つ作ってください。用途: ${kindHint}。

【厳守事項】
- 画像内に文字・ロゴ・数字を一切入れない（テキストは後工程で載せる前提）。
- 実在の人物・患者・症例写真的な表現を避け、抽象的・イメージ寄りにする。
- 効果効能・ビフォーアフター等、医療広告で問題になる訴求はプロンプトに入れない。
- 具体的な数値・割合を書かない。
- 主題と雰囲気（色調・光・構図・モチーフ）を簡潔に描写する。

【出力形式】
プロンプト本文のみを出力（前置き・見出し・引用符・番号は不要）。

${sourceTitle ? `タイトル: ${sourceTitle}\n` : ''}本文:
${excerpt}`;

    // Gemini 3.x は思考が既定ONで、旧SDK(generateWithModel=@google/generative-ai)では
    // thinking を制御できない。枠が小さいと思考でトークンを食い切り本文が空になるため、
    // 出力枠を大きめに取り、思考後も本文が残るようにする（env_gemini3_thinking の枠確保方針）。
    const raw = await generateWithModel('gemini', prompt, systemPrompt, 4096);

    const suggestion = raw.trim();
    if (!suggestion) {
      return NextResponse.json(
        { error: 'プロンプトを起案できませんでした。もう一度お試しください。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, prompt: suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[eyecatch/prompt]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
