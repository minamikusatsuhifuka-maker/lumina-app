import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { bookTitle, bookType, chapters, hasImages } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!bookTitle) {
    return NextResponse.json({ error: '書籍タイトルは必須です' }, { status: 400 });
  }

  try {
    const chaptersText = Array.isArray(chapters)
      ? chapters.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')
      : chapters || '（章立て未定）';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `あなたはKindle出版の品質管理マネージャーです。
書籍の情報をもとに、出版前に確認すべきチェックリストを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "pre_publish_checks": [
    {
      "category": "原稿/フォーマット/メタデータ/法的確認",
      "item": "チェック項目の説明",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "technical_checks": [
    {
      "item": "技術的チェック項目",
      "detail": "具体的な確認方法",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "marketing_checks": [
    {
      "item": "マーケティング準備項目",
      "detail": "具体的なアクション",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "estimated_publish_time": "出版までの推定所要時間"
}

書籍タイプと画像の有無に応じて、適切なチェック項目を含めてください。`,
        messages: [{
          role: 'user',
          content: `以下の書籍の出版前チェックリストを作成してください。

書籍タイトル: ${bookTitle}
書籍タイプ: ${bookType || 'guide'}
章立て:
${chaptersText}
画像あり: ${hasImages ? 'はい' : 'いいえ'}`,
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
    return NextResponse.json({ error: `チェックリスト生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
