import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text, query } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  // テキストをセクション単位で分割
  const sections = text.split(/\n(?=##\s)/).filter((s: string) => s.trim());

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
      system: `検索結果を以下のカテゴリに分類してください。JSON形式のみで返答。
{
  "classified": [
    { "index": 0, "category": "カテゴリ名" }
  ]
}
カテゴリ：最新ニュース / 専門的知見 / 実践事例 / 統計データ / その他`,
      messages: [{
        role: 'user',
        content: `検索クエリ：${query}\n\n検索結果セクション：\n${sections.slice(0, 10).map((s: string, i: number) => `${i}: ${s.slice(0, 150)}`).join('\n')}`,
      }],
    }),
  });

  const data = await response.json();
  let resultText = data.content?.[0]?.text ?? '{"classified":[]}';
  resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const { classified } = JSON.parse(resultText);
    const categorized = sections.map((s: string, i: number) => ({
      text: s,
      category: classified.find((c: any) => c.index === i)?.category ?? 'その他',
    }));
    return NextResponse.json({ categorized });
  } catch {
    return NextResponse.json({ categorized: sections.map((s: string) => ({ text: s, category: 'その他' })) });
  }
}
