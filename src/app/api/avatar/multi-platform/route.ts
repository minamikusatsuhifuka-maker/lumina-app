import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { originalPost, originalPlatform, targetPlatforms } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!originalPost) {
    return NextResponse.json({ error: '元の投稿テキストは必須です' }, { status: 400 });
  }

  const platforms = targetPlatforms?.length ? targetPlatforms : ['Instagram', 'X', 'Threads', 'Reels'];

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
        system: `あなたはSNSマルチプラットフォーム運用の専門家です。1つの投稿を複数のプラットフォーム向けに最適化変換してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "conversions": [
    {
      "platform": "プラットフォーム名",
      "content": "最適化された投稿本文",
      "hashtags": ["タグ1", "タグ2"],
      "image_prompt": "画像生成プロンプト（英語）",
      "character_count": 280,
      "tips": "このプラットフォームでの投稿のコツ"
    }
  ]
}

各プラットフォームの特性に合わせて、文体・長さ・ハッシュタグ数・構成を最適化してください。`,
        messages: [{
          role: 'user',
          content: `以下の投稿を各プラットフォーム向けに変換してください。

元のプラットフォーム: ${originalPlatform || '不明'}
変換先: ${platforms.join(', ')}

【元の投稿】
${originalPost}`,
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
    return NextResponse.json({ error: `マルチプラットフォーム変換に失敗しました: ${msg}` }, { status: 500 });
  }
}
