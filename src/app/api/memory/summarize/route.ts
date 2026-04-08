import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
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
  const userId = (session.user as any).id;

  const { content, title, sourceType, category } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const sql = neon(process.env.DATABASE_URL!);

  let summary = title ?? 'メモリ';
  let keywords = '';

  try {
    const data = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `与えられたコンテンツを以下のJSON形式で返してください。マークダウンや前置きは不要です。
{
  "summary": "内容の要約（100字以内・体言止め）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3"]
}`,
      messages: [{ role: 'user', content: `タイトル：${title}\n\n内容：${content?.slice(0, 1000) ?? ''}` }],
    });

    let resultText = data.content?.[0]?.text ?? '{}';
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(resultText);
    summary = parsed.summary ?? summary;
    keywords = (parsed.keywords ?? []).join(',');
  } catch {
    // AI要約が失敗しても、タイトルベースで保存
  }

  const rows = await sql`INSERT INTO memory_items (user_id, summary, category, source_type, source_title, keywords)
    VALUES (${userId}, ${summary}, ${category ?? 'general'}, ${sourceType ?? 'library'}, ${title ?? null}, ${keywords})
    RETURNING *`;

  return Response.json(rows[0]);
}
