import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { callAI } from '@/lib/call-ai';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { evaluationId, staffName, knowledgeScore, skillScore, mindsetScore,
          totalScore, currentGrade, recommendedGrade, mindsetDetails, model } = await req.json();

  const latestMeeting = mindsetDetails?.[0];

  const prompt = `スタッフ「${staffName}」の評価データを分析してください。

評価スコア：
- 知識評価（25点満点）: ${knowledgeScore}点
- スキル評価（25点満点）: ${skillScore}点
- マインド評価（50点満点）: ${mindsetScore}点
- 総合: ${totalScore}点 / 100点

現在の等級: ${currentGrade || '未設定'}
推奨等級: ${recommendedGrade}

最新1on1メモ:
${latestMeeting ? `成長段階: ${latestMeeting.stage} / マインド: ${latestMeeting.score}点` : 'なし'}

以下のJSONのみ返してください：
{
  "ai_evaluation": "総合評価コメント（3〜4文）院長の哲学（実評価・先払い・ティール）を反映",
  "strengths": ["強み1", "強み2"],
  "improvements": ["改善点1", "改善点2"],
  "promotion_eligible": true または false,
  "promotion_reason": "昇格可否の理由（1〜2文）"
}`;

  try {
    const response = await callAI({
      model: model || 'claude',
      system: 'あなたはxLUMINAクリニックの人事評価AIです。4つの実（実行・実績・実力・誠実）で評価します。JSONのみ返してください。',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
    });

    const clean = response.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    let result: any = {};

    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          ai_evaluation: clean.slice(0, 200),
          strengths: ['データ取得中'],
          improvements: ['データ取得中'],
          promotion_eligible: false,
          promotion_reason: '評価データが不足しています',
        };
      }
    } else {
      result = {
        ai_evaluation: response.slice(0, 300),
        strengths: [],
        improvements: [],
        promotion_eligible: false,
        promotion_reason: '評価データが不足しています',
      };
    }

    try {
      const sql = neon(process.env.DATABASE_URL!);
      await sql`
        UPDATE staff_evaluations SET ai_evaluation = ${result.ai_evaluation || ''}, updated_at = NOW()
        WHERE id = ${evaluationId}
      `;
    } catch (dbErr) {
      console.error('DB update error:', dbErr);
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('ai-comment error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
