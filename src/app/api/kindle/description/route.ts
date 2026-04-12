import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { bookTitle, subtitle, chapters, targetReader, uniqueValue } = await req.json();
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
        max_tokens: 3000,
        system: `あなたはAmazon KDP出版のコピーライターです。
書籍情報をもとに、Amazonの商品ページに掲載する各種テキストを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "amazon_description": "Amazon商品説明文（HTMLタグ使用可: <b>, <br>, <h2>, <ul>, <li>。4000字以内）",
  "back_cover_text": "裏表紙テキスト（200字以内）",
  "author_bio": "著者プロフィール（100字以内）",
  "editorial_review": "書評風テキスト（100字以内）",
  "bullet_points": ["セールスポイント1", "セールスポイント2", "セールスポイント3", "セールスポイント4", "セールスポイント5"]
}

amazon_descriptionは購買意欲を高める構成にしてください:
1. 読者の悩みに共感するリード文
2. この本で得られること
3. 目次（章タイトル）
4. こんな人におすすめ
5. 購入を促すクロージング`,
        messages: [{
          role: 'user',
          content: `以下の書籍のAmazon掲載テキストを作成してください。

書籍タイトル: ${bookTitle}
サブタイトル: ${subtitle || '（なし）'}
章立て:
${chaptersText}
ターゲット読者: ${targetReader || '一般'}
この本の独自価値: ${uniqueValue || '（おまかせ）'}`,
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
    return NextResponse.json({ error: `説明文の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
