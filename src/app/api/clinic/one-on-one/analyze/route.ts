import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 30;

// GETリクエストを明示的に拒否（プリフェッチ対策）
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが未設定' }, { status: 500 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 });
  }

  const { meetingId, staffName, goals, discussion, achievements, challenges } = body;

  if (!meetingId || !staffName) {
    return NextResponse.json({ error: 'meetingIdとstaffNameは必須です' }, { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 過去履歴を取得
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
          `${m.meeting_date}: ${(m.goals || '').slice(0, 50)}`
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

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return NextResponse.json({ error: `AI APIエラー: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    let result: any = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      result = {
        dominant_needs: ['love_belonging'],
        growth_stage: 'Lv3行う',
        mindset_score: 70,
        motivation_level: 70,
        ai_analysis: '分析データを取得できませんでした。',
        next_agenda: ['前回のアクションの振り返り', '課題の深掘り', '次のステップの確認'],
      };
    }

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
