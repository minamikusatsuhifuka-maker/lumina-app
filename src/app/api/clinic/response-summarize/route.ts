import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { surveyId, staffId } = await req.json();
  if (!surveyId || !staffId) return NextResponse.json({ error: 'surveyId と staffId は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  // アンケート情報と回答を取得
  const sql = neon(process.env.DATABASE_URL!);
  const [surveyRows, responseRows] = await Promise.all([
    sql`SELECT * FROM surveys WHERE id = ${surveyId}`,
    sql`SELECT * FROM staff_survey_responses WHERE survey_id = ${surveyId} AND staff_id = ${staffId}`,
  ]);

  const survey = surveyRows[0];
  if (!survey) return NextResponse.json({ error: 'アンケートが見つかりません' }, { status: 404 });

  const staffResponse = responseRows[0];
  if (!staffResponse) return NextResponse.json({ error: '回答が見つかりません' }, { status: 404 });

  const systemContext = await buildSystemContext(
    'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。'
  );

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
      system: systemContext,
      messages: [{
        role: 'user',
        content: `以下のアンケート回答を要約し、強み・課題・育成ポイントをJSON形式で返してください。

アンケートタイトル: ${survey.title}
質問内容: ${survey.questions}

スタッフの回答:
${JSON.stringify(staffResponse.answers, null, 2)}

以下のJSON形式で返してください：
{
  "summary": "回答の全体要約",
  "strengths": ["強み1", "強み2", ...],
  "challenges": ["課題1", "課題2", ...],
  "developmentPoints": ["育成ポイント1", "育成ポイント2", ...],
  "overallScore": "総合的な評価コメント"
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);

    // AI要約をDBに保存
    await sql`UPDATE staff_survey_responses SET ai_summary = ${JSON.stringify(parsed)}, updated_at = NOW() WHERE survey_id = ${surveyId} AND staff_id = ${staffId}`;

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
