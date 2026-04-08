import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { theme, phase } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const prompts: Record<string, string> = {
    expand: `「${theme}」について、あらゆる角度からアイデアを20個以上発散させてください。
常識にとらわれず、大胆・ユニーク・逆転の発想も含めてください。
各アイデアを1行で、番号付きリストで出力してください。`,

    converge: `「${theme}」についての以下の発散アイデアから、特に有望な上位10個を選び、それぞれについて詳しく説明してください。

選定基準：実現可能性・インパクト・独自性・市場性

各アイデアについて：
・アイデア名
・概要（2〜3文）
・強み
・実現に必要なこと`,

    evaluate: `「${theme}」の各アイデアを以下のマトリクスで評価してください。

| アイデア | 実現可能性(1-5) | インパクト(1-5) | 独自性(1-5) | 総合スコア |
|---------|---------------|--------------|------------|---------|

上位3つのアイデアを「最終推奨」として詳しく解説してください。`,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompts[phase] || prompts.expand }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return NextResponse.json({ result, phase });
}
