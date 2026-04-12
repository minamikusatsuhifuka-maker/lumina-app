import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, productType, targetPrice, targetAudience } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!avatarName || !productType) {
    return NextResponse.json({ error: 'アバター名と商品タイプは必須です' }, { status: 400 });
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
        max_tokens: 5000,
        system: `あなたはデジタル商品設計とセールスコピーの専門家です。アバターが販売するデジタル商品を設計してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "product_name": "商品名",
  "tagline": "キャッチコピー",
  "curriculum": [
    {
      "module": 1,
      "title": "モジュールタイトル",
      "description": "モジュールの内容説明",
      "duration": "所要時間"
    }
  ],
  "sales_page": {
    "headline": "セールスページの見出し",
    "subheadline": "サブ見出し",
    "pain_points": ["悩み1", "悩み2", "悩み3"],
    "benefits": ["ベネフィット1", "ベネフィット2", "ベネフィット3"],
    "testimonial_templates": ["お客様の声テンプレート1", "テンプレート2"],
    "pricing_text": "価格の見せ方テキスト",
    "cta": "行動喚起テキスト",
    "guarantee": "保証・返金ポリシー"
  },
  "launch_plan": ["ローンチステップ1", "ステップ2", "ステップ3"]
}

curriculumは5〜8モジュール、launch_planは7〜10ステップ生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の条件でデジタル商品を設計してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
商品タイプ: ${productType}
目標価格: ${targetPrice || '未定'}
ターゲット: ${targetAudience || '一般'}`,
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
    return NextResponse.json({ error: `商品設計に失敗しました: ${msg}` }, { status: 500 });
  }
}
