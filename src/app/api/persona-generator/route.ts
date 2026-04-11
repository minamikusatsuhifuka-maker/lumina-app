import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { product, industry, ageRange, gender } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: `あなたは日本トップクラスのマーケティングリサーチャー・UXリサーチャーです。
商品・サービスのターゲットペルソナを3人分、極めてリアルかつ詳細に生成してください。
日本市場に特化した具体的なペルソナにしてください。

JSON形式のみで返答。マークダウン不要：
{
  "personas": [
    {
      "name": "日本人のリアルな名前（フルネーム）",
      "age": 35,
      "gender": "性別",
      "occupation": "具体的な職業・役職",
      "income": "年収（例：480万円）",
      "location": "居住地（例：東京都世田谷区）",
      "family": "家族構成（例：妻と子ども2人（5歳・3歳））",
      "personality": "性格特性（100字程度、具体的に）",
      "daily_life": "1日の過ごし方（100字程度、朝から夜まで）",
      "goals": ["達成したい目標1", "達成したい目標2", "達成したい目標3"],
      "pains": ["抱えている悩み・課題1", "抱えている悩み・課題2", "抱えている悩み・課題3"],
      "information_sources": ["情報収集源1（例：Twitter）", "情報収集源2（例：YouTube）", "情報収集源3"],
      "purchase_triggers": ["購買のきっかけ1", "購買のきっかけ2"],
      "objections": ["購入をためらう理由1", "購入をためらう理由2"],
      "ideal_message": "この人に最も響くメッセージ（一文）",
      "best_channel": "最適なマーケティングチャネル"
    }
  ],
  "common_insights": "3人のペルソナに共通するインサイト・気づき（100字程度）",
  "marketing_strategy": "3人のペルソナを踏まえた総合マーケティング戦略（200字程度）"
}`,
      messages: [{
        role: 'user',
        content: `商品・サービス名：${product}\n業界：${industry}\n年齢層：${ageRange}\n性別：${gender}\n\n上記の情報をもとに、極めてリアルなターゲットペルソナを3人生成してください。\n各ペルソナは異なるセグメントから選び、具体的な生活背景・心理状態を持たせてください。`,
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
}
