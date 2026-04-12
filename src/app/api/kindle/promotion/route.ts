import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { bookTitle, bookType, targetReader, amazonUrl } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!bookTitle) {
    return NextResponse.json({ error: '書籍タイトルは必須です' }, { status: 400 });
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
        system: `あなたはKindle書籍のマーケティング戦略家です。
書籍の情報をもとに、各SNSプラットフォーム向けのプロモーション戦略を作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "posts": [
    {
      "platform": "twitter/instagram/note",
      "content": "投稿テキスト",
      "hashtags": ["#ハッシュタグ1", "#ハッシュタグ2"],
      "best_time": "おすすめ投稿時間（例: 朝7時）",
      "image_prompt": "投稿用画像の生成プロンプト（英語）"
    }
  ],
  "launch_plan": [
    {
      "day": 1,
      "action": "実施内容",
      "platform": "対象プラットフォーム",
      "detail": "具体的な手順"
    }
  ],
  "email_template": {
    "subject": "メール件名",
    "body": "メール本文（改行は\\nで表現）"
  }
}

postsは各プラットフォーム2〜3パターンずつ作成してください。
launch_planは出版日を含む7日間のスケジュールです。`,
        messages: [{
          role: 'user',
          content: `以下の書籍のプロモーション戦略を作成してください。

書籍タイトル: ${bookTitle}
書籍タイプ: ${bookType || 'guide'}
ターゲット読者: ${targetReader || '一般'}
Amazon URL: ${amazonUrl || '（未定）'}`,
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
    return NextResponse.json({ error: `プロモーション戦略の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
