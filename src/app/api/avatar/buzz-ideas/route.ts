import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, targetAudience, platform } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!avatarName) {
    return NextResponse.json({ error: 'アバター名は必須です' }, { status: 400 });
  }

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
        max_tokens: 3000,
        system: `あなたはSNSバズコンテンツの専門家です。バズる投稿アイデアを10個提案してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "ideas": [
    {
      "rank": 1,
      "title": "アイデアタイトル",
      "hook": "冒頭フック文（最初の1行で引き込む）",
      "format": "投稿フォーマット（カルーセル/リール/テキスト/画像付き等）",
      "viral_score": 85,
      "reason": "バズる理由（なぜこのコンテンツが拡散されるか）",
      "timing": "最適な投稿タイミング"
    }
  ]
}

viral_scoreは0〜100で評価してください。10個すべてのアイデアを生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の条件でバズ投稿アイデアを10個提案してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
ターゲット読者: ${targetAudience || '一般'}
プラットフォーム: ${platform || 'Instagram'}`,
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
    return NextResponse.json({ error: `バズアイデア生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
