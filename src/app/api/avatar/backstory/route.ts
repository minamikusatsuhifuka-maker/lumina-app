import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, occupation, expertise, personality, targetAudience } = await req.json();
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
        system: `あなたはSNSアバターのストーリーテリング専門家です。魅力的で共感を呼ぶバックストーリーを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "origin_story": "このアバターが生まれた背景ストーリー（200〜300文字）",
  "struggle_story": "挫折・苦労のエピソード（200〜300文字）",
  "turning_point": "人生の転機（200〜300文字）",
  "current_mission": "現在のミッション・使命（100〜200文字）",
  "profile_text": {
    "long": "プロフィール文（長文・300文字程度）",
    "short": "プロフィール文（短文・100文字程度）",
    "twitter_bio": "Twitter/X用bio（160文字以内）"
  },
  "self_intro_posts": [
    {
      "platform": "プラットフォーム名",
      "content": "自己紹介投稿の本文"
    }
  ],
  "credibility_points": ["信頼性ポイント1", "信頼性ポイント2", "信頼性ポイント3"],
  "human_moments": ["人間味エピソード1", "人間味エピソード2", "人間味エピソード3"]
}

self_intro_postsは3つ（Instagram, X, Threads）で生成してください。`,
        messages: [{
          role: 'user',
          content: `以下のアバターのバックストーリーを作成してください。

アバター名: ${avatarName}
職業: ${occupation || '指定なし'}
専門分野: ${expertise || '指定なし'}
性格: ${personality || '明るく社交的'}
ターゲット読者: ${targetAudience || '一般'}`,
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
    return NextResponse.json({ error: `バックストーリー生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
