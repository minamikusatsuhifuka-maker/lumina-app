import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { product, target, content } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: `あなたは日本トップクラスのマーケティング戦略コンサルタントです。
ABテスト用のコピーバリエーションを3パターン生成してください。
各パターンは異なる心理アプローチで訴求し、テスト可能な仮説を持たせてください。

JSON形式のみで返答。マークダウン不要：
{
  "variants": [
    {
      "type": "感情訴求型",
      "strategy": "感情的なストーリーテリングで共感を誘い、行動を促す戦略の具体的説明",
      "headline": "感情に訴えるヘッドライン（20字以内）",
      "body": "感情訴求のボディコピー（150字程度）",
      "cta": "CTAテキスト",
      "target_emotion": "狙う感情（例：安心感、焦り、希望）",
      "expected_ctr": "予測CTR（例：2.1%）"
    },
    {
      "type": "論理訴求型",
      "strategy": "データ・数字・論理的根拠で説得する戦略の具体的説明",
      "headline": "論理的なヘッドライン（20字以内）",
      "body": "論理訴求のボディコピー（150字程度）",
      "cta": "CTAテキスト",
      "target_emotion": "狙う感情（例：納得感、合理性）",
      "expected_ctr": "予測CTR（例：1.8%）"
    },
    {
      "type": "社会的証明型",
      "strategy": "他者の行動・実績・権威で信頼を構築する戦略の具体的説明",
      "headline": "社会的証明ヘッドライン（20字以内）",
      "body": "社会的証明のボディコピー（150字程度）",
      "cta": "CTAテキスト",
      "target_emotion": "狙う感情（例：安心感、FOMO）",
      "expected_ctr": "予測CTR（例：2.5%）"
    }
  ],
  "recommendation": "3パターンの中で最も効果が高いと予測されるバリアントとその理由（100字程度）",
  "test_tips": [
    "ABテスト実施時のアドバイス1",
    "ABテスト実施時のアドバイス2",
    "ABテスト実施時のアドバイス3",
    "ABテスト実施時のアドバイス4"
  ]
}`,
      messages: [{
        role: 'user',
        content: `商品・サービス名：${product}\nターゲット：${target}\n現在のコピー・訴求内容：${content}\n\n上記の情報をもとに、ABテスト用の3パターンのコピーバリエーションを生成してください。\n各パターンは明確に異なる心理アプローチを使い、測定可能な仮説を持たせてください。`,
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
