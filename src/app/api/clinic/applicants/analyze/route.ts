import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { callAI } from '@/lib/call-ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    let text = '';
    let position = '';
    let aiModel: 'claude' | 'gemini' = 'claude';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      text = (body.text || '').slice(0, 2000);
      position = body.position || '';
      aiModel = body.model || 'claude';
    } else {
      const formData = await req.formData();
      text = (formData.get('text') as string || '').slice(0, 2000);
      position = formData.get('position') as string || '';
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    console.log('analyze: start', { position, textLen: text.length, model: aiModel });

    const rawText = await callAI({
      model: aiModel,
      system: `あなたはLUMINAクリニックの採用AIです。
4つの「実」で採点：実行（やると言ったことをやる）・実績（数字の成果）・実力（本物の力）・誠実（正直）各25点満点。
5大欲求で性格分析：生存・愛所属・力・自由・楽しみ。
必ずJSONのみ返してください。前置き不要。`,
      messages: [{
        role: 'user',
        content: `応募職種：${position}

応募者情報：
${text}

以下のJSON形式のみで返してください：
{
  "extracted_data": {
    "name": "氏名",
    "age": 年齢,
    "experience_years": 経験年数,
    "current_job": "現職",
    "education": "学歴",
    "qualifications": ["資格"],
    "motivation": "志望動機要約",
    "strengths": ["強み1", "強み2"],
    "concerns": ["懸念点1"]
  },
  "scores": {
    "jitsukou": {"score": 0-25, "reason": "理由"},
    "jisseki": {"score": 0-25, "reason": "理由"},
    "jitsuryoku": {"score": 0-25, "reason": "理由"},
    "seijitsu": {"score": 0-25, "reason": "理由"}
  },
  "dominant_needs": ["love_belonging"],
  "personality_summary": "性格・欲求の要約（2文）",
  "recommendation": "採用推奨|要検討|不採用",
  "ai_comment": "総合コメント（2〜3文）",
  "interview_points": ["確認ポイント1", "確認ポイント2", "確認ポイント3"]
}`,
      }],
      maxTokens: 1500,
    });

    console.log('analyze: AI response received, parsing...');

    const clean = rawText.replace(/```json|```/g, '').trim();
    let result: any = {};
    try {
      const match = clean.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : clean);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'raw:', clean.slice(0, 200));
      result = {
        extracted_data: { name: '解析エラー' },
        scores: {
          jitsukou: { score: 0, reason: '解析失敗' },
          jisseki: { score: 0, reason: '解析失敗' },
          jitsuryoku: { score: 0, reason: '解析失敗' },
          seijitsu: { score: 0, reason: '解析失敗' },
        },
        dominant_needs: [],
        personality_summary: '',
        recommendation: '要検討',
        ai_comment: '解析に失敗しました。再度お試しください。',
        interview_points: [],
      };
    }

    const totalScore = result.scores
      ? Object.values(result.scores).reduce((sum: number, s: any) => sum + (s.score || 0), 0)
      : 0;

    // DBに保存（JSONB列にはJSON文字列をそのまま渡す）
    const sql = neon(process.env.DATABASE_URL!);
    const saved = await sql`
      INSERT INTO applicants (
        name, position, raw_text, extracted_data, scores,
        total_score, ai_comment, interview_points,
        dominant_needs, personality_summary, recommendation
      ) VALUES (
        ${result.extracted_data?.name || '名前未取得'},
        ${position},
        ${text},
        ${JSON.stringify(result.extracted_data || {})},
        ${JSON.stringify(result.scores || {})},
        ${totalScore},
        ${result.ai_comment || ''},
        ${JSON.stringify(result.interview_points || [])},
        ${JSON.stringify(result.dominant_needs || [])},
        ${result.personality_summary || ''},
        ${result.recommendation || '要検討'}
      )
      RETURNING id
    `;

    console.log('analyze: saved to DB, id:', saved[0].id);

    return NextResponse.json({
      id: saved[0].id,
      ...result,
      total_score: totalScore,
    });

  } catch (e: any) {
    console.error('analyze error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
