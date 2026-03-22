import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'クエリが必要です' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `あなたは優秀なリサーチアナリストです。
Webを検索して得た情報をもとに、日本語で詳しくまとめてください。
必ず各情報の引用元を [出典: サイト名](URL) の形式で明記してください。
事実と推測を明確に区別してください。`,
        messages: [{
          role: 'user',
          content: `以下のテーマについてWebを検索し、日本語で簡潔にまとめてください。

テーマ：${query}

以下の構成でまとめてください：
## 概要
## 主要ポイント
## まとめ

各セクションの情報源となったWebサイトのURLを必ず記載してください。`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[websearch] API error:', response.status, err);
      return NextResponse.json({ error: `APIエラー: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    return NextResponse.json({ result: text });

  } catch (error: any) {
    console.error('[websearch] Error:', error);
    return NextResponse.json({ error: `エラー: ${error.message}` }, { status: 500 });
  }
}
