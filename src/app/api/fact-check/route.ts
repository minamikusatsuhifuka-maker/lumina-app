import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { sources } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!sources || !Array.isArray(sources) || sources.length < 2) {
    return NextResponse.json({ error: '2つ以上の情報源が必要です' }, { status: 400 });
  }

  try {
    const sourcesText = sources.map((s: { title: string; content: string }, i: number) =>
      `【情報源${i + 1}】\nタイトル: ${s.title}\n内容: ${s.content}`
    ).join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: `あなたはファクトチェックの専門家です。
複数の情報源を比較分析し、事実関係を検証してください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "summary": "全体のファクトチェック要約",
  "agreed_facts": ["複数の情報源で一致している事実の配列"],
  "contradictions": [
    {
      "topic": "矛盾のテーマ",
      "source_a": "情報源Aの主張",
      "source_b": "情報源Bの主張",
      "analysis": "どちらが正しいかの分析"
    }
  ],
  "unverified": ["検証できなかった主張の配列"],
  "overall_reliability": "高" | "中" | "低",
  "recommendation": "情報の活用に関する推奨コメント"
}`,
        messages: [{
          role: 'user',
          content: `以下の複数情報源をファクトチェックしてください。\n\n${sourcesText}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '{}';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI応答のパースに失敗しました' }, { status: 500 });
    }
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `ファクトチェックに失敗しました: ${msg}` }, { status: 500 });
  }
}
