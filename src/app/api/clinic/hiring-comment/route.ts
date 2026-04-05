import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffId, resumeAnalysis, aptitudeAnalysis } = await req.json();

  const sql = neon(process.env.DATABASE_URL!);

  // 理念を取得
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  // staffId がある場合は書類から解析結果を取得
  let resume = resumeAnalysis || '';
  let aptitude = aptitudeAnalysis || '';
  if (staffId) {
    const docs = await sql`SELECT type, ai_analysis FROM staff_documents WHERE staff_id = ${staffId}`;
    for (const doc of docs) {
      if (doc.type === 'resume' && doc.ai_analysis) resume = doc.ai_analysis;
      if (doc.type === 'aptitude_test' && doc.ai_analysis) aptitude = doc.ai_analysis;
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'あなたはクリニックの採用担当責任者です。理念との適合性を重視して判断してください。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}

履歴書解析：${typeof resume === 'string' ? resume : JSON.stringify(resume)}
適性試験解析：${typeof aptitude === 'string' ? aptitude : JSON.stringify(aptitude)}

上記をもとに、採用担当として以下のJSONで採用所見を生成してください：
{
  "recommendation": "採用推奨 / 条件付き採用 / 再検討",
  "reasons": ["推奨理由"],
  "expectedRole": "期待される役割・配置",
  "onboardingPoints": ["入職時に重点的に伝えるべき点"],
  "developmentPlan": "3ヶ月・6ヶ月・1年の育成方針",
  "overallComment": "総合採用所見（5〜8文）"
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const analysis = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
