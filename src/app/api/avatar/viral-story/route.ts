import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, personality, targetEmotion } = await req.json();
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
        max_tokens: 4000,
        system: `あなたはバイラルストーリーテリングの専門家です。SNSで拡散されるエモーショナルなストーリーを3つ作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "stories": [
    {
      "title": "ストーリータイトル",
      "hook": "冒頭フック（最初の1〜2文で引き込む）",
      "body": "ストーリー本文（300〜500文字）",
      "emotional_arc": "感情の流れ（例：共感→驚き→感動→行動）",
      "call_to_action": "読者への行動喚起",
      "platform_fit": "最適なプラットフォームと投稿形式"
    }
  ],
  "storytelling_tips": ["ストーリーテリングのコツ1", "コツ2", "コツ3"]
}

storiesは3つ生成してください。storytelling_tipsは3〜5個生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の条件でバイラルストーリーを3つ作成してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
性格: ${personality || '明るく社交的'}
狙う感情: ${targetEmotion || '共感・感動'}`,
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
    return NextResponse.json({ error: `バイラルストーリー生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
