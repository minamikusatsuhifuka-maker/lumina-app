import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { text } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `あなたは専門用語抽出の専門家です。
与えられたテキストからすべての専門用語・略語・英字表記を抽出し、必ずJSON形式のみで返してください。
前置きや説明は不要です。

{
  "terms": [
    {
      "term": "用語名",
      "reading": "よみがな（あれば）",
      "industry": "AI|Claude Code|技術スタック|AIセキュリティ|IT|医療|法律|金融|マーケティング|経営|general",
      "level": "beginner|intermediate|advanced",
      "reason": "なぜ専門用語か（10字以内）"
    }
  ]
}

抽出ルール（必ず守ること）：
- 略語・英字表記（API, SDK, HL7, FHIR, JSON-RPC, OML, ORU等）は必ずすべて抽出する
- カタカナ専門用語も必ず抽出する
- 分野を問わずすべての専門用語を抽出する
- 一般的な日常語のみ除外する
- 最大15個まで

優先抽出分野：
1. AI・機械学習（LLM, RAG, MCP, Embedding等）
2. Claude Code（CLAUDE.md, Hooks, Tool use等）
3. 技術スタック（Next.js, Prisma, API, SDK等）
4. AIセキュリティ（プロンプトインジェクション等）
5. 医療・その他あらゆる分野の専門用語・略語`,
      messages: [{ role: 'user', content: `以下のテキストから専門用語をすべて抽出してください：\n\n${text}` }],
    }),
  });

  const data = await response.json();
  const resultText = data.content?.[0]?.text ?? '{"terms":[]}';

  try {
    const parsed = JSON.parse(resultText);
    return Response.json(parsed);
  } catch {
    return Response.json({ terms: [] });
  }
}
