import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 180;

const STRUCTURE_LABELS: Record<string, string> = {
  kishoten: '起承転結（日本の伝統的な4段構成）',
  hero: 'ヒーローズジャーニー（英雄の旅路、変容と成長の物語）',
  problem_solution: '問題解決型（課題提示→解決策→結果）',
  sparkline: 'スパークライン（理想と現実を交互に示す）',
  peel: 'PEEL（Point→Evidence→Explanation→Link）',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { content, topic, structure, targetReader, length } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!topic) {
    return NextResponse.json({ error: 'トピックは必須です' }, { status: 400 });
  }

  const structureGuide = STRUCTURE_LABELS[structure] || STRUCTURE_LABELS.kishoten;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: `あなたはストーリーテリングの専門家です。
与えられた情報を指定された物語構造で魅力的なストーリーに変換してください。
読者の心を動かす、感情に訴えかける文章を作成してください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "title": "ストーリーのタイトル",
  "hook": "冒頭のフック（読者を引き込む最初の一文）",
  "story": "ストーリー本文（指定された構造に従い、段落分けして読みやすく）",
  "key_message": "このストーリーの核心メッセージ（1文）",
  "emotional_arc": "感情の流れ（例：不安→挑戦→発見→希望）",
  "metaphors_used": ["使用した比喩表現1", "使用した比喩表現2"],
  "suggested_visuals": ["ストーリーに合うビジュアル提案1", "ストーリーに合うビジュアル提案2"]
}`,
        messages: [{
          role: 'user',
          content: `以下の情報をストーリーに変換してください。

トピック: ${topic}
物語構造: ${structureGuide}
ターゲット読者: ${targetReader || '一般'}
文章量: ${length || '標準（800〜1200文字）'}
${content ? `\n参考情報・素材:\n${content}` : ''}`,
        }],
      }),
    });

    const data = await response.json();
    let text = data.content?.[0]?.text ?? '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `ストーリーテリング生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
