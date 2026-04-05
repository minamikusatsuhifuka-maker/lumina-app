import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { positions, count, role } = await req.json();
  if (!positions || !count) return NextResponse.json({ error: 'positions と count は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const systemPrompt = await buildSystemContext('あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。', 'grade');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}
職種：${positions} / 役割：${role || '一般〜管理職'} / 等級数：${count}

以下のJSON形式で等級制度の全体案を作成してください。全項目を具体的に記載してください：
{
  "grades": [
    {
      "levelNumber": 1,
      "name": "Grade 1 / ジュニア",
      "position": "${positions}",
      "role": "一般スタッフ",
      "description": "この等級の役割・期待される姿（3〜5文）",
      "skills": ["必要なスキル①（具体的に）", "②"],
      "knowledge": ["必要な知識①", "②"],
      "mindset": ["求めるマインド・姿勢①", "②"],
      "continuousLearning": ["継続学習①", "②"],
      "requiredCertifications": ["必須資格①", "推奨資格②"],
      "promotionExam": {
        "description": "昇格試験の概要",
        "format": "筆記/実技/面接/複合",
        "passingCriteria": "合格基準",
        "examContent": ["試験内容①", "②"],
        "recommendedPreparation": "試験対策・準備方法"
      },
      "requirementsPromotion": "昇格条件まとめ（箇条書き）",
      "requirementsDemotion": "降格条件（具体的に）",
      "salaryMin": 200000,
      "salaryMax": 250000
    }
  ],
  "designComment": "この等級設計の意図・理念との対応"
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
