import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TOOL_GUIDES: Record<string, string> = {
  midjourney: 'Midjourneyに最適化。--ar（アスペクト比）--v 6.1 --stylize パラメータを末尾に追加。',
  stable_diffusion: 'Stable Diffusionに最適化。positive/negative prompt分離。品質タグ（masterpiece, best quality等）を先頭に。',
  dalle: 'DALL-E 3に最適化。自然な英語文章形式。詳細な描写と構図を含める。',
  firefly: 'Adobe Fireflyに最適化。スタイルと雰囲気重視。商用利用可能な表現で。',
  nano_banana: 'Nano Banana 2に最適化。日本語キーワードも含めた日英混合プロンプトで出力。シンプルで直感的な表現を優先。LoRAタグは不要。',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { description, tool, style, mood, usage } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `あなたはAI画像生成の専門家です。日本語のイメージ説明を指定ツール向けの最適化された英語プロンプトに変換してください。
${TOOL_GUIDES[tool] ?? TOOL_GUIDES.midjourney}

JSON形式のみで返答：
{
  "main_prompt": "メインプロンプト（英語）",
  "negative_prompt": "ネガティブプロンプト（SD用、他は空文字）",
  "style_tags": ["タグ1", "タグ2"],
  "technical_params": "技術パラメータ",
  "tips": ["コツ1", "コツ2"],
  "variations": [{ "label": "バリエーション名", "prompt": "変化プロンプト" }]
}`,
      messages: [{ role: 'user', content: `画像イメージ（日本語）：${description}\n使用ツール：${tool}\nスタイル：${style ?? 'リアル'}\n雰囲気：${mood ?? '明るく'}\n用途：${usage ?? '一般'}` }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
  try { return NextResponse.json(JSON.parse(text)); } catch { return NextResponse.json({ error: 'パース失敗', raw: text.slice(0, 100) }, { status: 500 }); }
}
