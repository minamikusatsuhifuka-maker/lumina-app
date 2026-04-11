import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { url, title, author, publishDate, siteName, style } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!style) {
    return NextResponse.json({ error: 'スタイルは必須です' }, { status: 400 });
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
        system: `あなたは学術引用・参考文献の専門家です。
指定された引用スタイルに基づいて、正確な引用情報を生成してください。
不足している情報がある場合はmissing_infoで明示してください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "citation": "フル引用文（参考文献リスト用）",
  "inline_citation": "本文中の引用表記（例：(著者, 年) や [1] など）",
  "bibliography_entry": "参考文献リストに記載する完全な書誌情報",
  "missing_info": ["不足している情報のリスト"],
  "tips": "引用に関するアドバイスや注意点"
}`,
        messages: [{
          role: 'user',
          content: `以下の情報から${style}形式の引用を生成してください。

URL: ${url || '未指定'}
タイトル: ${title || '未指定'}
著者: ${author || '未指定'}
公開日: ${publishDate || '未指定'}
サイト名: ${siteName || '未指定'}
引用スタイル: ${style}`,
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
    return NextResponse.json({ error: `引用生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
