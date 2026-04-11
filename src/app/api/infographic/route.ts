import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { content, topic, style, platform } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!topic) {
    return NextResponse.json({ error: 'トピックは必須です' }, { status: 400 });
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
        system: `あなたはインフォグラフィックデザインの専門家です。
与えられた情報をインフォグラフィック向けに構造化してください。
各セクションにはアイコン（絵文字）、キーナンバー、箇条書きを含めてください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "title": "インフォグラフィックのタイトル",
  "subtitle": "サブタイトル",
  "sections": [
    {
      "heading": "セクション見出し",
      "icon": "絵文字アイコン",
      "key_number": "主要数値（例：87%、3倍など）",
      "body": "セクションの説明文",
      "bullet_points": ["ポイント1", "ポイント2", "ポイント3"]
    }
  ],
  "key_takeaway": "最も重要なポイント（1文）",
  "cta": "行動喚起テキスト",
  "hashtags": ["ハッシュタグ1", "ハッシュタグ2"],
  "color_suggestion": "推奨カラーパレット",
  "layout_suggestion": "レイアウトの提案"
}`,
        messages: [{
          role: 'user',
          content: `以下の情報からインフォグラフィック用テキストを生成してください。

トピック: ${topic}
プラットフォーム: ${platform || '汎用'}
スタイル: ${style || 'モダン'}
${content ? `\n参考情報:\n${content}` : ''}`,
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
    return NextResponse.json({ error: `インフォグラフィック生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
