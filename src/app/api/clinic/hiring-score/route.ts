import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffId, resumeText, aptitudeText, memoText } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  // 理念取得
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  // staffId指定時はDBから書類取得
  let resume = resumeText || '';
  let aptitude = aptitudeText || '';
  let memo = memoText || '';
  if (staffId) {
    const docs = await sql`SELECT type, extracted_text, ai_analysis FROM staff_documents WHERE staff_id = ${staffId}`;
    for (const doc of docs) {
      if (doc.type === 'resume') resume = doc.extracted_text || doc.ai_analysis || resume;
      if (doc.type === 'aptitude_test') aptitude = doc.extracted_text || doc.ai_analysis || aptitude;
    }
    const notes = await sql`SELECT content FROM staff_notes WHERE staff_id = ${staffId}`;
    if (notes.length > 0) memo = notes.map((n: any) => n.content).join('\n');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemPrompt = await buildSystemContext('あなたはクリニック採用評価の専門家です。必ずJSON形式のみで返答してください。JSONのみを返し、それ以外のテキストは含めないでください。', 'hiring');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下のクリニック理念と候補者情報をもとに、採用評価スコアを算出してください。

【クリニック理念】
${philosophy}

【候補者情報】
履歴書・経歴：${resume}
適性試験結果：${aptitude}
その他メモ：${memo}

【採用評価の大原則：「実」で判断】
言葉・印象・態度ではなく「実」で判断してください：
・実行：やると決めたことを実際にやってきたか（資格取得・学習継続・プロジェクト完遂）
・実績：具体的な成果・数字・事実があるか
・実力：経験・スキル・知識が実際に発揮できるか
・誠実：経歴に一貫性があるか / 転職理由が誠実か
・コミットメント：これまでの仕事に本気で取り組んだ証拠があるか

以下のJSON形式で、各評価軸を0〜100点で採点し、必ず根拠コメントも記載してください：
{
  "scores": {
    "philosophyAlignment": { "score": 85, "label": "理念適合度", "comment": "具体的な根拠" },
    "communicationSkill": { "score": 72, "label": "コミュニケーション力", "comment": "具体的な根拠" },
    "professionalSkill": { "score": 80, "label": "専門スキル・経験", "comment": "具体的な根拠" },
    "growthPotential": { "score": 78, "label": "成長ポテンシャル", "comment": "具体的な根拠" },
    "teamworkFit": { "score": 68, "label": "チームワーク適性", "comment": "具体的な根拠" },
    "patientOrientation": { "score": 90, "label": "患者志向性", "comment": "具体的な根拠" },
    "reliability": { "score": 75, "label": "誠実さ・信頼性", "comment": "具体的な根拠" },
    "clinicCultureFit": { "score": 82, "label": "クリニック文化適合", "comment": "具体的な根拠" },
    "prepaymentAttitude": { "score": 75, "label": "先払い・自己投資姿勢", "comment": "時間・お金・エネルギーを自己成長に先払いしてきたか。学びへの投資意欲と行動。見返りを求めず先に与える姿勢" },
    "challengeSpirit": { "score": 80, "label": "求める心・挑戦意欲", "comment": "成長への強い意欲。チャンスに飛び込む勇気。困難を楽しめる精神" }
  },
  "totalScore": 79,
  "rank": "A",
  "rankLabel": "採用推奨",
  "summary": "総合評価コメント（5〜8文、具体的に）",
  "strengths": ["具体的な強み①", "②", "③"],
  "risks": ["採用後のリスク・注意点①", "②"],
  "onboardingAdvice": "入職後の育成・フォローアップ方針（3〜5文）"
}

rankの基準：
- S（90点以上）：即戦力・強く推奨
- A（80〜89点）：採用推奨
- B（70〜79点）：条件付き採用
- C（60〜69点）：要検討
- D（60点未満）：見送り推奨`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const result = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
