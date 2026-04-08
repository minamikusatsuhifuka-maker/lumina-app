import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { criteriaId, instruction, currentContent } = await req.json();
  if (!criteriaId || !instruction || !currentContent) {
    return NextResponse.json({ error: 'criteriaId, instruction, currentContent は必須です' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemPrompt = await buildSystemContext('あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。', 'evaluation');

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
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下の評価基準を、指示に従って修正してください。

現在の評価基準：
${JSON.stringify(currentContent, null, 2)}

修正指示：
${instruction}

修正後の評価基準を以下のJSON形式で返してください：
{
  "categories": [
    {
      "name": "カテゴリ名",
      "weight": 30,
      "criteria": [
        {
          "name": "評価項目名",
          "description": "評価項目の説明",
          "indicators": {
            "5": "卓越している状態の具体的な行動指標",
            "4": "期待以上の状態の具体的な行動指標",
            "3": "期待通りの状態の具体的な行動指標",
            "2": "改善が必要な状態の具体的な行動指標",
            "1": "大幅な改善が必要な状態の具体的な行動指標"
          }
        }
      ]
    }
  ],
  "changeLog": "変更内容の要約"
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
