import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { avatarName, expertise, currentFollowers, targetFollowers, platforms, monthsToGoal } = await req.json();
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
        system: `あなたはSNSグロース戦略の専門家です。アバターアカウントの成長戦略を策定してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "current_analysis": "現状分析（200文字程度）",
  "growth_projections": [
    {
      "month": 1,
      "followers": 500,
      "strategy": "この月の主な成長戦略"
    }
  ],
  "weekly_actions": ["週次アクション1", "週次アクション2", "週次アクション3"],
  "collaboration_ideas": ["コラボアイデア1", "コラボアイデア2", "コラボアイデア3"],
  "hashtag_strategy": "ハッシュタグ戦略の詳細説明",
  "content_pillars": ["コンテンツの柱1", "コンテンツの柱2", "コンテンツの柱3"]
}

growth_projectionsは目標月数分（最大12ヶ月）生成してください。weekly_actionsは5〜7個、collaboration_ideasは3〜5個、content_pillarsは3〜5個生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の条件で成長戦略を策定してください。

アバター名: ${avatarName}
専門分野: ${expertise || '指定なし'}
現在のフォロワー数: ${currentFollowers || 0}
目標フォロワー数: ${targetFollowers || 10000}
使用プラットフォーム: ${platforms || 'Instagram, X'}
目標達成期間: ${monthsToGoal || 6}ヶ月`,
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
    return NextResponse.json({ error: `成長戦略生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
