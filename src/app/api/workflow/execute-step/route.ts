import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 機能別のシステムプロンプト
const FUNCTION_PROMPTS: Record<string, string> = {
  web_search: 'あなたはWeb情報収集の専門家です。与えられたテーマについて、最新のWeb情報を整理して詳細にまとめてください。出典があれば記載してください。',
  deep_research: 'あなたは徹底的なリサーチの専門家です。与えられたテーマについて複数の視点から深掘り調査し、包括的なレポートを作成してください。',
  literature_search: 'あなたは学術文献の専門家です。与えられたテーマに関連する研究や論文の知見をまとめ、エビデンスベースの分析を提供してください。',
  intelligence_hub: 'あなたはビジネスインテリジェンスの専門家です。与えられたテーマについてニュース・市場動向・競合情報を総合的に分析してまとめてください。',
  ai_analysis: 'あなたはビジネス分析の専門家です。SWOT分析、競合分析、トレンド分析、アクションプランなどのフレームワークを使って分析してください。',
  business_intelligence: 'あなたは経営コンサルタントです。MVV策定、マーケ戦略、採用戦略、組織設計など経営課題を構造的に分析し、具体的な施策を提案してください。',
  industry_report: 'あなたは業界アナリストです。与えられた業界について市場規模・トレンド・主要プレーヤー・将来展望を含む包括的な業界レポートを作成してください。',
  brainstorm: 'あなたはブレインストーミングのファシリテーターです。与えられたテーマについてアイデアを発散→収束→評価の流れで整理してください。',
  writing: 'あなたはプロのライターです。与えられたテーマについて、読みやすく説得力のある文章を作成してください。構成を明確にし、具体例を交えてください。',
  minutes: 'あなたは議事録整理の専門家です。与えられた内容を、決定事項・アクションアイテム・議論のポイントに整理してください。',
  genspark: 'あなたはプレゼン資料の専門家です。与えられた内容をスライド構成にまとめ、各スライドの見出しと箇条書きを作成してください。',
  persona: 'あなたは業界専門家です。専門的な知見と経験に基づいて、与えられたテーマについて深い分析と提言を行ってください。',
};

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 529) && i < retries) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { functionKey, inputPrompt, previousResults } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const systemPrompt = FUNCTION_PROMPTS[functionKey] || 'あなたは優秀なAIアシスタントです。';

  // 前のステップの結果をコンテキストとして追加
  const contextualPrompt = previousResults?.length > 0
    ? `${inputPrompt}\n\n【前のステップの調査結果（参考）】\n${previousResults.slice(-1)[0]?.slice(0, 1500) ?? ''}`
    : inputPrompt;

  try {
    const data = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: `${systemPrompt}\n\n回答は日本語で、具体的かつ詳細にまとめてください。`,
      messages: [{ role: 'user', content: contextualPrompt }],
    });

    const result = data.content?.[0]?.text ?? '結果を取得できませんでした';
    return Response.json({ result });
  } catch (e: any) {
    console.error('[workflow/execute-step]', e.message);
    return Response.json({ error: `ステップの実行に失敗しました: ${e.message}` }, { status: 502 });
  }
}
