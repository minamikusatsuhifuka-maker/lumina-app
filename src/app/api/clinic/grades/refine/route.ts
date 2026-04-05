import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeId, instruction, currentContent } = await req.json();
  if (!gradeId || !instruction || !currentContent) {
    return NextResponse.json({ error: 'gradeId, instruction, currentContent は必須です' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

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
      system: 'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `以下の等級情報を、指示に従って修正してください。

現在の等級情報：
${JSON.stringify(currentContent, null, 2)}

修正指示：
${instruction}

修正後の等級情報を以下のJSON形式で返してください：
{
  "levelNumber": 1,
  "name": "等級名",
  "description": "等級の説明",
  "requirementsPromotion": "昇格要件",
  "requirementsDemotion": "降格要件",
  "salaryMin": 200000,
  "salaryMax": 250000,
  "keyCompetencies": ["能力1", "能力2"],
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
