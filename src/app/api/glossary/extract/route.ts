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
      system: `あなたは技術用語抽出の専門家です。
与えられたテキストから専門用語を抽出し、必ずJSON形式のみで返してください。
前置きや説明は不要です。

{
  "terms": [
    {
      "term": "用語名",
      "reading": "よみがな（あれば）",
      "industry": "AI|Claude Code|技術スタック|AIセキュリティ|IT|general",
      "level": "beginner|intermediate|advanced",
      "reason": "なぜ専門用語と判断したか（10字以内）"
    }
  ]
}

抽出の優先順位（高い順）：
1. AI・機械学習関連（LLM, RAG, Fine-tuning, Embedding, Transformer, MCP, プロンプトエンジニアリング等）
2. Claude Code関連（CLAUDE.md, Artifacts, Tool use, Computer use, Hooks, Skill等）
3. 技術スタック関連（Next.js, Prisma, Vercel, Neon, TypeScript, Tailwind等）
4. AIセキュリティ関連（プロンプトインジェクション, ジェイルブレイク, ハルシネーション, データポイズニング等）
5. 略語・英字表記（API, SDK, CI/CD, ORM, SSR, SSG, RBAC等）
6. その他IT・業界用語

抽出基準：
- 略語・英字表記は必ず抽出する
- カタカナ専門用語も抽出する
- 一般的な日常語は除外する
- 最大15個まで`,
      messages: [{ role: 'user', content: `以下のテキストから専門用語を抽出してください：\n\n${text}` }],
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
