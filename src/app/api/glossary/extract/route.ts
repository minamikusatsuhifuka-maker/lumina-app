
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    // 429/529 はリトライ
    if ((res.status === 429 || res.status === 529) && i < retries) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { text } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  try {
    const data = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `あなたは専門用語抽出の専門家です。
与えられたテキストからすべての専門用語・略語・英字表記を抽出し、必ずJSON形式のみで返してください。
マークダウンのコードブロック（\`\`\`json等）は絶対に使わず、JSONをそのまま返してください。
前置きや説明は不要です。

{"terms":[{"term":"用語名","reading":"よみがな","industry":"AI|Claude Code|技術スタック|AIセキュリティ|IT|医療|法律|金融|マーケティング|経営|general","level":"beginner|intermediate|advanced","reason":"理由10字以内"}]}

抽出ルール：
- 略語・英字表記（API, SDK, HL7, FHIR, JSON-RPC等）は必ずすべて抽出する
- カタカナ専門用語も必ず抽出する
- 分野を問わずすべての専門用語を抽出する
- 一般的な日常語のみ除外する
- 最大15個まで`,
      messages: [{ role: 'user', content: `以下のテキストから専門用語を抽出してください：\n\n${text}` }],
    });

    let resultText = data.content?.[0]?.text ?? '{"terms":[]}';

    // マークダウンコードブロックを除去
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(resultText);
    return Response.json(parsed);
  } catch (e: any) {
    console.error('[glossary/extract]', e.message);
    return Response.json({ terms: [], error: e.message }, { status: 502 });
  }
}
