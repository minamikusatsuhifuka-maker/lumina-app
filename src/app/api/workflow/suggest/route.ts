import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const AVAILABLE_FUNCTIONS = `
【xLUMINAで使える機能一覧】
1. web_search: Web情報収集（最新情報・ニュース・競合調査）
2. deep_research: ディープリサーチ（3段階の深掘り調査）
3. literature_search: 文献検索（学術論文1.38億件）
4. intelligence_hub: Intelligence Hub（8モード・市場/SNS/採用等）
5. ai_analysis: AI分析エンジン（SWOT・競合・市場分析等）
6. business_intelligence: 経営インテリジェンス（戦略立案）
7. industry_report: 業界レポート自動生成
8. brainstorm: AIブレインストーミング（発散→収束→評価）
9. writing: 文章作成（14モード・ブログ/SNS/レポート等）
10. minutes: AI議事録整理
11. genspark: Gensparkへ出力（プレゼン資料作成）
12. persona: AIペルソナ（業界専門家として分析）
`;

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

  const { goal } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  try {
    const data = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `あなたはxLUMINAのワークフロー設計AIです。
ユーザーの目的に対して最適な機能の使用順序を提案してください。
必ずJSON形式のみで返してください。マークダウンや前置きは不要です。

${AVAILABLE_FUNCTIONS}

出力形式：
{
  "title": "ワークフロータイトル（20字以内）",
  "description": "このワークフローで何が得られるか（50字以内）",
  "estimatedMinutes": 数字,
  "steps": [
    {
      "stepNumber": 1,
      "functionKey": "機能キー（上記一覧のキー）",
      "functionName": "機能名（日本語）",
      "icon": "絵文字1文字",
      "purpose": "このステップの目的（30字以内）",
      "inputPrompt": "この機能に入力するプロンプト・クエリ（具体的に）",
      "outputDescription": "得られる成果物（20字以内）"
    }
  ]
}

ルール：
- ステップ数は3〜6個
- 前のステップの成果を次のステップで活用する流れにする
- 最後のステップは文章作成やレポート生成など成果物を作る
- inputPromptはユーザーの目的を具体的に反映した内容にする`,
      messages: [{ role: 'user', content: `以下の目的に最適なワークフローを提案してください：\n\n${goal}` }],
    });

    let text = data.content?.[0]?.text ?? '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(text);
    return Response.json(parsed);
  } catch (e: any) {
    console.error('[workflow/suggest]', e.message);
    return Response.json({ error: '提案の生成に失敗しました' }, { status: 502 });
  }
}
