
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { terms, sourceText } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const termList = terms.map((t: any) => `- ${t.term}（${t.industry}・${t.level}）`).join('\n');

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
      system: `あなたは丁寧でわかりやすい解説が得意な専門家です。
指定された専門用語について、必ずJSON形式のみで解説を生成してください。
前置きや説明は不要です。

{
  "explanations": [
    {
      "term": "用語名",
      "definition": "わかりやすい解説（200字程度）",
      "example": "具体的な使用例・文脈",
      "related": ["関連用語1", "関連用語2"]
    }
  ]
}

解説の方針：
- 専門知識がない人でも理解できる言葉で
- 具体例を必ず含める
- 堅苦しくなく丁寧なトーンで`,
      messages: [{
        role: 'user',
        content: `以下の用語を解説してください：\n${termList}\n\n元のテキスト（文脈参考用）：\n${sourceText?.slice(0, 500) ?? ''}`,
      }],
    }),
  });

  const data = await response.json();
  let resultText = data.content?.[0]?.text ?? '{"explanations":[]}';
  resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(resultText);
    return Response.json(parsed);
  } catch {
    return Response.json({ explanations: [] });
  }
}
