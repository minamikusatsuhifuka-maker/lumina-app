import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { product, target, goal, steps, emailType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const stepCount = parseInt(steps, 10) || 5;

  const emailTypeDescriptions: Record<string, string> = {
    'ウェルカム': 'ウェルカムシーケンス（新規登録者向けのオンボーディング）',
    'セールス': 'セールスシーケンス（見込み客を購買に導くナーチャリング）',
    'リテンション': 'リテンションシーケンス（既存顧客の継続利用を促進）',
    'カート放棄': 'カート放棄シーケンス（購入未完了者のリカバリー）',
    'ローンチ': 'ローンチシーケンス（新商品・サービスのリリース告知）',
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: `あなたは日本トップクラスのメールマーケティング戦略家です。
ステップメール（${emailTypeDescriptions[emailType] ?? emailTypeDescriptions['セールス']}）を${stepCount}通分設計してください。
各メールは心理学的トリガーを活用し、開封率・クリック率を最大化する設計にしてください。

JSON形式のみで返答。マークダウン不要：
{
  "emails": [
    {
      "step": 1,
      "timing": "配信タイミング（例：登録直後、翌日、3日後など）",
      "subject": "件名（開封率を最大化する魅力的な件名、30字以内）",
      "preheader": "プリヘッダー（件名を補完するテキスト、40字以内）",
      "body": "メール本文（300字程度、パーソナライズされた自然な文体）",
      "cta_text": "CTAボタンテキスト",
      "cta_url_placeholder": "{{CTA_URL}}",
      "psychology": "このメールで使用する心理テクニック名",
      "goal": "このメールの具体的な目標"
    }
  ],
  "sequence_strategy": "シーケンス全体の戦略説明（200字程度）",
  "open_rate_tips": [
    "開封率を上げるためのアドバイス1",
    "開封率を上げるためのアドバイス2",
    "開封率を上げるためのアドバイス3",
    "開封率を上げるためのアドバイス4"
  ]
}`,
      messages: [{
        role: 'user',
        content: `商品・サービス名：${product}\nターゲット：${target}\nシーケンスの目的：${goal}\nメール数：${stepCount}通\nメールタイプ：${emailType}\n\n上記の情報をもとに、高効果のステップメールシーケンスを設計してください。\n各メールは前のメールの内容を踏まえ、徐々に購買意欲を高める構成にしてください。`,
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
