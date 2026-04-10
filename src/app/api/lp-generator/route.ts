import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const FRAMEWORKS: Record<string, string> = {
  PASONA: `PASONA法則で構成：P（Problem）悩み明確化→A（Affinity）共感→S（Solution）解決策提示→O（Offer）特典→N（Narrow down）限定性→A（Action）CTA`,
  AIDA: `AIDA法則で構成：A（Attention）注目→I（Interest）興味→D（Desire）欲求→A（Action）行動`,
  PAB: `PAB法則で構成：P（Problem）問題提示→A（Agitate）深掘り→B（Benefit）ベネフィット訴求`,
  QUEST: `QUEST法則で構成：Q（Qualify）絞込→U（Understand）共感→E（Educate）教育→S（Stimulate）刺激→T（Transition）行動`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { productName, target, problem, solution, price, framework, cta } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `あなたは日本トップクラスのセールスコピーライターです。
マーケティング心理学・行動経済学を活用して高転換率のLPを生成してください。
${FRAMEWORKS[framework] ?? FRAMEWORKS.PASONA}

JSON形式のみで返答。マークダウン不要：
{
  "headline": "メインキャッチコピー（20字以内）",
  "subheadline": "サブキャッチ（40字以内）",
  "problem_section": { "title": "問題提起タイトル", "points": ["悩み1", "悩み2", "悩み3"] },
  "solution_section": { "title": "解決策タイトル", "description": "説明（100字以内）", "benefits": [{ "title": "名前", "description": "説明", "icon": "絵文字" }] },
  "social_proof": { "title": "実績タイトル", "points": ["実績1", "実績2", "実績3"] },
  "offer": { "title": "オファータイトル", "description": "内容", "price_text": "価格訴求文", "guarantee": "保証" },
  "faq": [{ "question": "質問", "answer": "回答" }],
  "cta_sections": [{ "position": "位置", "text": "CTAテキスト", "subtext": "補足" }],
  "meta_description": "メタディスクリプション（120字以内）"
}`,
      messages: [{ role: 'user', content: `商品名：${productName}\nターゲット：${target}\n悩み：${problem}\n解決策：${solution}\n価格：${price}\nCTA：${cta ?? '今すぐ無料で試す'}\n\n高転換率のLPコンテンツを生成してください。社会的証明・希少性・権威性・返報性を最大限活用。` }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
  try { return NextResponse.json(JSON.parse(text)); } catch { return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 }); }
}
