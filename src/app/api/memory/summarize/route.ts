import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { extractAnthropicText } from '@/lib/anthropic-text';

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

  // 206: 要約・キーワードが取れなかったら保存せず失敗を返す（リトライ可能に）。
  // 旧実装は失敗を握りつぶしてタイトルだけのレコードをINSERTしており、
  // 要約・キーワード欠落のまま永続化されていた（205調査）
  let summary = '';
  let keywords = '';

  try {
    const data = await callAnthropic(apiKey, {
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 1024,
      system: `与えられたコンテンツを以下のJSON形式で返してください。マークダウンや前置きは不要です。
{
  "summary": "内容の要約（100字以内・体言止め）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3"]
}`,
      messages: [{ role: 'user', content: `タイトル：${title}\n\n内容：${content?.slice(0, 1000) ?? ''}` }],
    });

    const resultText = extractAnthropicText(data.content) || '';
    const parsed = robustJsonParse<{ summary?: string; keywords?: string[] }>(resultText);
    summary = parsed.summary ?? '';
    keywords = (parsed.keywords ?? []).join(',');
  } catch (e) {
    console.error('memory/summarize failed:', e instanceof Error ? e.message : e);
    return Response.json(
      { error: 'AI要約の生成に失敗しました。もう一度お試しください。' },
      { status: 502 },
    );
  }
  if (!summary) summary = title ?? 'メモリ';

  const rows = await sql`INSERT INTO memory_items (user_id, summary, category, source_type, source_title, keywords)
    VALUES (${userId}, ${summary}, ${category ?? 'general'}, ${sourceType ?? 'library'}, ${title ?? null}, ${keywords})
    RETURNING *`;

  return Response.json(rows[0]);
}
