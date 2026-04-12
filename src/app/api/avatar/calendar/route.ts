import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, targetAudience, platforms, postFrequency } = await req.json();
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
        max_tokens: 8000,
        system: `あなたはSNSコンテンツカレンダーの専門家です。30日分の投稿カレンダーを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "calendar": [
    {
      "day": 1,
      "weekday": "月",
      "platform": "プラットフォーム名",
      "post_type": "投稿タイプ",
      "topic": "トピック",
      "hook": "冒頭フック文",
      "best_time": "推奨投稿時間",
      "hashtags": ["タグ1", "タグ2"]
    }
  ],
  "monthly_themes": ["第1週テーマ", "第2週テーマ", "第3週テーマ", "第4週テーマ"],
  "content_ratio": {
    "educational": 40,
    "entertaining": 25,
    "promotional": 15,
    "personal": 20
  }
}

calendarは30日分すべて生成してください。曜日は月〜日で循環させてください。投稿頻度に基づいて適切にスケジュールしてください。`,
        messages: [{
          role: 'user',
          content: `以下の条件で30日間の投稿カレンダーを作成してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
ターゲット読者: ${targetAudience || '一般'}
使用プラットフォーム: ${platforms || 'Instagram, X'}
投稿頻度: ${postFrequency || '毎日1投稿'}`,
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
    return NextResponse.json({ error: `カレンダー生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
