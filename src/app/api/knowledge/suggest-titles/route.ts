import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

// 関連検索タイトル案をClaude Sonnet 4.6で生成するAPI
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 });
  }

  try {
    const { topic, researchText, depth = 0 } = await req.json();
    if (!topic || !researchText) {
      return NextResponse.json({ error: 'topic と researchText が必要です' }, { status: 400 });
    }

    const depthGuide =
      depth === 0
        ? '入門〜基礎レベルの関連トピックを含める'
        : depth === 1
        ? '応用・実践レベルのトピックを中心にする'
        : depth === 2
        ? '専門家・上級者向けの深いトピックを中心にする'
        : 'プロ・研究者レベルの最先端・ニッチなトピックを提案する';

    const prompt = `あなたは知識の体系化と学習設計の専門家です。

以下のリサーチ結果を読んで、このトピックをさらに深く理解するための「次に調べるべき関連検索タイトル案」を8件生成してください。

【現在のトピック】
${topic}

【深さレベル】
現在の探求深度: ${depth}（0=入門、1=基礎、2=応用、3=専門、4=プロ）
方針: ${depthGuide}

【リサーチ結果（抜粋）】
${String(researchText).slice(0, 2000)}

以下のJSON形式のみで回答してください（前後の説明・コードブロック不要）:
{
  "titles": [
    {
      "title": "検索タイトル（具体的で実用的な30字以内）",
      "reason": "なぜこれを調べると理解が深まるか（50字以内）",
      "category": "基礎知識|応用実践|ツール活用|事例研究|最新動向|隣接分野|深掘り|自動化",
      "level": "入門|基礎|応用|専門|プロ"
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[knowledge/suggest-titles] Anthropic エラー:', response.status, errBody);
      return NextResponse.json({ error: `Anthropic APIエラー: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return NextResponse.json({ error: 'AI応答が空でした', titles: [] }, { status: 500 });
    }

    // JSONパース（コードブロック除去）
    const cleaned = text.replace(/```(?:json)?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[knowledge/suggest-titles] JSON抽出失敗:', cleaned.slice(0, 300));
      return NextResponse.json({ error: 'AI応答のJSON解析に失敗', titles: [] }, { status: 500 });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ titles: parsed.titles ?? [] });
    } catch (e: any) {
      console.error('[knowledge/suggest-titles] JSON.parse失敗:', e?.message);
      return NextResponse.json({ error: 'JSONパースに失敗', titles: [] }, { status: 500 });
    }
  } catch (e: any) {
    console.error('[knowledge/suggest-titles] エラー:', e);
    return NextResponse.json({ error: e?.message || 'エラー' }, { status: 500 });
  }
}
