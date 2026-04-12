import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, currentFollowers, targetIncome } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!avatarName) {
    return NextResponse.json({ error: 'アバター名は必須です' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: `あなたはSNSマネタイズの専門家です。アバターアカウントの収益化ロードマップを策定してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "roadmap_phases": [
    {
      "phase": "Phase 1: 基盤構築",
      "followers_needed": 1000,
      "revenue_sources": ["収益源1", "収益源2"],
      "monthly_income": 30000,
      "timeline": "1〜3ヶ月"
    }
  ],
  "recommended_first_product": "最初に作るべき商品の詳細説明",
  "income_simulation": [
    {
      "month": 1,
      "income": 10000,
      "source": "主な収益源"
    }
  ],
  "action_items": ["アクション1", "アクション2", "アクション3"]
}

roadmap_phasesは3〜5フェーズ、income_simulationは12ヶ月分、action_itemsは5〜8個生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の条件で収益化ロードマップを作成してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
現在のフォロワー数: ${currentFollowers || 0}
目標月収: ${targetIncome || 300000}円`,
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `収益化ロードマップ生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
