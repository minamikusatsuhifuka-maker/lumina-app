import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { chapterTitle, chapterContent } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!chapterContent) {
    return NextResponse.json({ error: '章の本文は必須です' }, { status: 400 });
  }

  try {
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
        system: `あなたは書籍編集のプロです。
章の内容を要約し、次章への橋渡しとなる文を作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "summary": "章の要約（150字以内）",
  "key_takeaways": ["重要ポイント1", "重要ポイント2", "重要ポイント3"],
  "next_chapter_hook": "次章への橋渡し文（読者が続きを読みたくなるような一文）"
}

summaryは150字以内で、章の核心を簡潔にまとめてください。
key_takeawaysは3〜5個の箇条書きで、読者が持ち帰るべきポイントです。
next_chapter_hookは読者の期待感を高める橋渡し文です。`,
        messages: [{
          role: 'user',
          content: `以下の章を要約してください。

章タイトル: ${chapterTitle || '（指定なし）'}

--- 章の本文 ---
${chapterContent}
--- ここまで ---`,
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `要約の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
