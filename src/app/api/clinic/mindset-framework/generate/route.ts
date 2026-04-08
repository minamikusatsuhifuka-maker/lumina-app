import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 300;

async function generateForGrade(
  gradeLevel: number,
  positions: string,
  philosophy: string,
  apiKey: string,
  systemPrompt: string
): Promise<any[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}
職種：${positions}

G${gradeLevel}（等級${gradeLevel}）の4つのコア価値について、マインド成長フレームワークを作成してください。

以下のJSON形式のみで返してください（説明文不要）：
{
  "items": [
    {
      "gradeLevel": ${gradeLevel},
      "coreValue": "self_growth",
      "stageDescription": "この等級でのこのコア価値に対する段階説明（1〜2文）",
      "behavioralIndicators": ["行動指標①", "行動指標②", "行動指標③"],
      "growthActions": ["成長アクション①", "成長アクション②"],
      "assessmentCriteria": "評価基準の説明（1文）"
    },
    {
      "gradeLevel": ${gradeLevel},
      "coreValue": "social_contribution",
      "stageDescription": "...",
      "behavioralIndicators": ["...", "...", "..."],
      "growthActions": ["...", "..."],
      "assessmentCriteria": "..."
    },
    {
      "gradeLevel": ${gradeLevel},
      "coreValue": "continuous_learning",
      "stageDescription": "...",
      "behavioralIndicators": ["...", "...", "..."],
      "growthActions": ["...", "..."],
      "assessmentCriteria": "..."
    },
    {
      "gradeLevel": ${gradeLevel},
      "coreValue": "sharing",
      "stageDescription": "...",
      "behavioralIndicators": ["...", "...", "..."],
      "growthActions": ["...", "..."],
      "assessmentCriteria": "..."
    }
  ]
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  // JSONを抽出
  let jsonStr = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  } else {
    const objMatch = text.match(/(\{[\s\S]*\})/);
    if (objMatch) jsonStr = objMatch[1];
  }
  jsonStr = jsonStr.trim().replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(jsonStr);
  return parsed.items || [];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeCount, positions } = await req.json();
  if (!gradeCount || !positions) {
    return NextResponse.json({ error: 'gradeCount と positions は必須です' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const systemPrompt = await buildSystemContext(
    `あなたはクリニックの人材育成専門家です。
4つのコア価値（自己成長・社会貢献・学びの継続・分かち合い）を軸に、
等級ごとの段階的なマインド成長を設計してください。
必ずJSON形式のみで返してください。説明文や前置きは不要です。`,
    'mindset'
  );

  // 等級ごとに順番に生成
  const allItems: any[] = [];
  const errors: string[] = [];

  for (let grade = 1; grade <= gradeCount; grade++) {
    try {
      const items = await generateForGrade(
        grade, positions, philosophy, apiKey, systemPrompt
      );
      allItems.push(...items);
    } catch (e) {
      console.error(`Grade ${grade} generation error:`, e);
      errors.push(`G${grade}の生成に失敗`);
    }
  }

  if (allItems.length === 0) {
    return NextResponse.json(
      { error: '生成に失敗しました。再度お試しください。', errors },
      { status: 500 }
    );
  }

  // 既存の形式に合わせてレスポンスを返す
  const framework = Array.from({ length: gradeCount }, (_, i) => ({
    gradeLevel: i + 1,
    coreValues: allItems
      .filter(item => item.gradeLevel === i + 1)
      .reduce((acc, item) => {
        acc[item.coreValue] = {
          stageDescription: item.stageDescription,
          behavioralIndicators: item.behavioralIndicators,
          growthActions: item.growthActions,
          assessmentCriteria: item.assessmentCriteria,
        };
        return acc;
      }, {} as Record<string, any>),
  }));

  return NextResponse.json({ framework, totalItems: allItems.length, errors });
}
