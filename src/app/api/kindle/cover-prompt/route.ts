import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { bookTitle, bookType, theme, targetReader, mood } = await req.json();
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
        max_tokens: 3000,
        system: `あなたはKindle書籍の表紙デザイン専門家です。
書籍の情報をもとに、3つの異なるスタイルの表紙デザインプロンプトを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "prompts": [
    {
      "style_name": "デザインスタイル名（例: ミニマル、イラスト、写真風）",
      "midjourney_prompt": "Midjourney用の英語プロンプト",
      "dalle_prompt": "DALL-E用の英語プロンプト",
      "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
      "typography_suggestion": "フォント・文字配置の提案（日本語）",
      "layout_description": "レイアウトの詳細説明（日本語）"
    }
  ]
}

3つのデザインは互いに異なるテイストにしてください。
Kindle表紙の推奨サイズ（1600x2560px、縦横比1:1.6）を考慮してください。
プロンプトはbook cover, kindle cover, high qualityなどのキーワードを含めてください。`,
        messages: [{
          role: 'user',
          content: `以下の書籍の表紙デザインプロンプトを3案作成してください。

書籍タイトル: ${bookTitle}
書籍タイプ: ${bookType || 'guide'}
テーマ: ${theme || '（タイトルから推測してください）'}
ターゲット読者: ${targetReader || '一般'}
雰囲気・ムード: ${mood || '（おまかせ）'}`,
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
    return NextResponse.json({ error: `表紙プロンプト生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
