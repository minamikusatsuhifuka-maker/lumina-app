import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const FRAMEWORKS: Record<string, string> = {
  PASONA: 'PASONA法則：P（Problem）共感できる問題提起→A（Affinity）寄り添い→S（Solution）解決策→O（Offer）限定オファー→N（Narrow）緊急性・限定性→A（Action）行動喚起',
  AIDA: 'AIDA法則：A（Attention）注目を集めるインパクト→I（Interest）興味を持たせるストーリー→D（Desire）欲求を刺激するベネフィット→A（Action）具体的な行動喚起',
  PAB: 'PAB法則：P（Problem）問題を明確化→A（Agitate）問題を深掘りして不安を煽る→B（Benefit）圧倒的なベネフィットで解決',
  QUEST: 'QUEST法則：Q（Qualify）ターゲットを絞り込む→U（Understand）共感・理解→E（Educate）教育・価値提供→S（Stimulate）刺激・欲求喚起→T（Transition）行動への転換',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { product, target, problem, benefit, framework, copyType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `あなたは日本トップクラスのセールスコピーライターです。
マーケティング心理学・行動経済学・神経言語プログラミングを駆使して、
高転換率のマーケティングコピーを生成してください。

フレームワーク：${FRAMEWORKS[framework] ?? FRAMEWORKS.PASONA}
コピー用途：${copyType || 'LP・HP全般'}

JSON形式のみで返答。マークダウン不要：
{
  "headline": "メインキャッチコピー（20字以内、強烈なインパクト）",
  "subheadline": "サブキャッチコピー（40字以内、ベネフィット訴求）",
  "body": "ボディコピー（200字程度、${FRAMEWORKS[framework] ?? FRAMEWORKS.PASONA}に沿った構成）",
  "cta": "CTAボタンテキスト（行動を促す具体的な文言）",
  "tagline": "タグライン（ブランドの本質を一言で、10字以内）",
  "hooks": ["SNSオープニング文1（共感型）", "SNSオープニング文2（疑問型）", "SNSオープニング文3（衝撃型）"],
  "psychology_used": ["使用した心理テクニック1", "使用した心理テクニック2", "使用した心理テクニック3"],
  "improvement_tips": ["改善アドバイス1", "改善アドバイス2", "改善アドバイス3"]
}`,
      messages: [{
        role: 'user',
        content: `商品・サービス名：${product}\nターゲット：${target}\n悩み・課題：${problem}\nベネフィット・強み：${benefit}\n\n上記の情報をもとに、${copyType || 'LP・HP全般'}向けの高転換率マーケティングコピーを生成してください。\n希少性・社会的証明・権威性・返報性・損失回避を最大限活用してください。`,
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
}
