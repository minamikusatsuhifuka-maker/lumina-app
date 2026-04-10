import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { docType, theme, audience, slides, purpose } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: `あなたはビジネス資料作成のエキスパートです。
指定資料を作成するための最適なプロンプトを生成してください。
このプロンプトをClaude・ChatGPTに貼り付ければ高品質な資料が作成できます。

JSON形式のみで返答：
{
  "overview_prompt": "全体構成プロンプト",
  "slide_prompts": [{ "slide_num": 1, "title": "タイトル", "prompt": "プロンプト", "design_tips": "デザインコツ" }],
  "design_prompt": "デザイン指示プロンプト",
  "data_visualization_prompt": "グラフ・図表作成プロンプト",
  "review_prompt": "見直し・改善プロンプト",
  "tips": ["ポイント1", "ポイント2"]
}`,
      messages: [{ role: 'user', content: `資料種類：${docType}\nテーマ：${theme}\n対象読者：${audience}\nスライド枚数：${slides}枚\n目的：${purpose}\n\n最適なプロンプトセットを生成してください。` }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return NextResponse.json(JSON.parse(text)); } catch { return NextResponse.json({ error: 'パース失敗' }, { status: 500 }); }
}
