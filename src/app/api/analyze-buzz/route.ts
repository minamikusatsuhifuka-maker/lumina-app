import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { content, score, purpose, target } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const purposeMap: Record<string, string> = {
    marketing:  'マーケティング・集客',
    education:  '教育・学習',
    hr:         '人材育成・採用',
    branding:   'ブランディング・認知拡大',
    sales:      '営業・商品紹介',
    community:  'コミュニティ・ファン形成',
    pr:         'PR・プレスリリース',
    thought:    'thought leadership・専門性発信',
  };

  const targetMap: Record<string, string> = {
    general:    '一般読者',
    beginner:   '初心者・入門者',
    expert:     '専門家・上級者',
    business:   'ビジネスパーソン',
    consumer:   '一般消費者',
    student:    '学生・若年層',
    manager:    '管理職・経営者',
  };

  const systemPrompt = `あなたはSNS・コンテンツマーケティングの専門家です。
与えられた文章のSNSバズり予測スコア（${score}点）をもとに、以下の形式でJSON分析を返してください。

必ずJSON形式のみで返答し、マークダウンや前置きは不要です。

{
  "problems": ["問題点1", "問題点2", "問題点3"],
  "suggestions": ["改善案1", "改善案2", "改善案3"],
  "revised": "修正後の文章全文"
}

分析条件：
- 目的: ${purposeMap[purpose] || purpose}
- ターゲット読者: ${targetMap[target] || target}
- 現在のバズりスコア: ${score}点

problemsは具体的に3点、suggestionsは実行可能な改善案を3点、revisedは目的・ターゲットに最適化した修正全文を返してください。`;

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
      system: systemPrompt,
      messages: [{ role: 'user', content: `以下の文章を分析してください：\n\n${content}` }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '{}';

  try {
    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: '分析に失敗しました' }), { status: 500 });
  }
}
