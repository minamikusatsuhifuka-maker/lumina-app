import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 30;
const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  try {
    const { meetingId, staffName, goals, discussion, achievements, challenges } = await req.json();

    // 過去のミーティング履歴を取得（軽量に）
    let history = '';
    try {
      const past = await sql`
        SELECT meeting_date, goals, achievements
        FROM one_on_one_meetings
        WHERE staff_name = ${staffName}
          AND id != ${meetingId}
        ORDER BY meeting_date DESC
        LIMIT 2
      `;
      if (past.length > 0) {
        history = past.map((m: any) =>
          `${m.meeting_date}: ${m.goals?.slice(0, 50)} / 達成:${m.achievements?.slice(0, 50)}`
        ).join('\n');
      }
    } catch {}

    const prompt = `スタッフ「${staffName}」の1on1を分析してください。

テーマ: ${(goals || '').slice(0, 200)}
内容: ${(discussion || '').slice(0, 300)}
達成: ${(achievements || '').slice(0, 200)}
課題: ${(challenges || '').slice(0, 200)}
${history ? `過去: ${history}` : ''}

以下のJSONのみ返してください：
{
  "dominant_needs": ["love_belonging"],
  "growth_stage": "Lv3行う",
  "mindset_score": 75,
  "motivation_level": 80,
  "ai_analysis": "分析コメント（2〜3文）",
  "next_agenda": ["議題1", "議題2", "議題3"]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'あなたはクリニックの1on1サポートAIです。リードマネジメント・5大欲求・ティール組織の視点で分析してください。JSONのみ返してください。前置き不要。',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // 堅牢なJSON抽出
    let result: any = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('JSONが見つかりません');
      }
    } catch {
      result = {
        dominant_needs: ['love_belonging'],
        growth_stage: 'Lv3行う',
        mindset_score: 70,
        motivation_level: 70,
        ai_analysis: rawText.slice(0, 200) || '分析データを取得できませんでした。',
        next_agenda: ['前回のアクションの振り返り', '課題の深掘り', '次のステップの確認'],
      };
    }

    // DBに保存
    try {
      await sql`
        UPDATE one_on_one_meetings SET
          ai_analysis = ${result.ai_analysis || ''},
          next_agenda = ${JSON.stringify(result.next_agenda || [])},
          dominant_needs = ${JSON.stringify(result.dominant_needs || [])},
          mindset_score = ${result.mindset_score || 70},
          motivation_level = ${result.motivation_level || 70},
          growth_stage = ${result.growth_stage || 'Lv3行う'},
          updated_at = NOW()
        WHERE id = ${meetingId}
      `;
    } catch (dbErr) {
      console.error('DB update error:', dbErr);
    }

    return NextResponse.json(result);

  } catch (e: any) {
    console.error('analyze error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
