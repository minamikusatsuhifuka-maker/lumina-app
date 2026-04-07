import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { callAI } from '@/lib/call-ai';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meetingId, staffName, goals, discussion, achievements, challenges, model } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  // 過去のミーティング履歴を取得
  let history = '';
  try {
    const past = await sql`
      SELECT meeting_date, goals, achievements, challenges, ai_analysis
      FROM one_on_one_meetings
      WHERE staff_name = ${staffName}
        AND id != ${meetingId}
      ORDER BY meeting_date DESC
      LIMIT 3
    `;
    if (past.length > 0) {
      history = past.map((m: any) =>
        `${m.meeting_date}: 目標=${m.goals?.slice(0, 100)} 達成=${m.achievements?.slice(0, 100)}`
      ).join('\n');
    }
  } catch {}

  const prompt = `スタッフ「${staffName}」との1on1ミーティング内容を分析してください。

【今回の内容】
目標・テーマ: ${goals || '未記入'}
話し合った内容: ${discussion || '未記入'}
達成・成長: ${achievements || '未記入'}
課題・悩み: ${challenges || '未記入'}

${history ? `【過去の履歴】\n${history}` : ''}

以下のJSON形式のみで返してください：
{
  "dominant_needs": ["love_belonging", "power"],
  "growth_stage": "Lv1知る|Lv2わかる|Lv3行う|Lv4できる|Lv5分かち合う",
  "mindset_score": 1-100の数値,
  "motivation_level": 1-100の数値,
  "ai_analysis": "3〜5文の分析コメント（強み・課題・成長の観察）",
  "next_agenda": ["次回の議題1", "次回の議題2", "次回の議題3"]
}`;

  try {
    const response = await callAI({
      model: model || 'claude',
      system: `あなたはLUMINAクリニックの1on1サポートAIです。
院長の哲学：リードマネジメント（内発的動機）・5大欲求・先払い・ティール組織・実評価。
スタッフの成長を主役として捉え、内発的動機を引き出す視点で分析してください。
JSONのみ返してください。`,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
    });

    const clean = response.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    const result = JSON.parse(match ? match[0] : clean);

    // DBに保存
    await sql`
      UPDATE one_on_one_meetings SET
        ai_analysis = ${result.ai_analysis || ''},
        next_agenda = ${JSON.stringify(result.next_agenda || [])},
        dominant_needs = ${JSON.stringify(result.dominant_needs || [])},
        mindset_score = ${result.mindset_score || null},
        motivation_level = ${result.motivation_level || null},
        growth_stage = ${result.growth_stage || null},
        updated_at = NOW()
      WHERE id = ${meetingId}
    `;

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('1on1 analyze error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
