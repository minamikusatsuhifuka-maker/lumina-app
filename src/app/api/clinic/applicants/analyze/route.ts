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
    const formData = await req.formData();
    const text = formData.get('text') as string || '';
    const position = formData.get('position') as string || '';
    const file = formData.get('file') as File | null;

    let inputText = text;

    // ファイルがある場合はテキスト抽出
    if (file) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mediaType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png';

      const readResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: mediaType === 'application/pdf' ? 'document' : 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: 'このファイルの内容をすべてテキストとして書き出してください。',
              },
            ],
          }],
        }),
      });
      const readData = await readResponse.json();
      inputText = readData.content?.[0]?.text || text;
    }

    if (!inputText.trim()) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    // 採点基準を取得
    let gradeCriteria = '';
    try {
      const grades = await sql`
        SELECT name, level_number, mindset, skills, knowledge
        FROM grade_levels
        WHERE position = ${position}
        ORDER BY level_number
        LIMIT 2
      `;
      gradeCriteria = grades.map((g: any) => `${g.name}: マインド=${g.mindset?.slice(0, 100)}`).join('\n');
    } catch {}

    // AI分析・採点
    const analyzeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `あなたはLUMINAクリニックの採用AIです。
院長の評価哲学：
- 4つの「実」：実行（やると言ったことをやる）・実績（数字で語れる成果）・実力（本物の力）・誠実（正直）
- 5大欲求：生存・愛所属・力・自由・楽しみ（選択理論）
- 同心円成長：自己愛→身近な人→社会貢献
- 先払い哲学：貢献を先にする人が豊かになる
- ティール組織：自律・主体性・全員リーダー

採用で重視する点：
- 素直さ・学ぶ姿勢
- 患者さんへの思いやり
- チームへの貢献意識
- 誠実さ・正直さ
- 成長への意欲

必ずJSON形式のみで返してください。`,
        messages: [{
          role: 'user',
          content: `以下の応募者情報を分析し、採点してください。

【応募職種】${position}

【応募者情報】
${inputText.slice(0, 2000)}

${gradeCriteria ? `【採用基準参考】\n${gradeCriteria}` : ''}

以下のJSON形式で返してください：
{
  "extracted_data": {
    "name": "氏名",
    "age": 年齢(数値),
    "experience_years": 経験年数(数値),
    "current_job": "現職",
    "education": "最終学歴",
    "qualifications": ["資格1", "資格2"],
    "motivation": "志望動機の要約",
    "strengths": ["強み1", "強み2", "強み3"],
    "concerns": ["懸念点1", "懸念点2"]
  },
  "scores": {
    "jitsukou": {"score": 0-25, "reason": "理由"},
    "jisseki": {"score": 0-25, "reason": "理由"},
    "jitsuryoku": {"score": 0-25, "reason": "理由"},
    "seijitsu": {"score": 0-25, "reason": "理由"}
  },
  "dominant_needs": ["love_belonging", "power"],
  "personality_summary": "性格・欲求バランスの要約（3文）",
  "recommendation": "採用推奨|要検討|不採用",
  "ai_comment": "総合コメント（3〜5文）",
  "interview_points": ["面接で確認すべき点1", "面接で確認すべき点2", "面接で確認すべき点3"]
}`,
        }],
      }),
    });

    const analyzeData = await analyzeResponse.json();
    const rawText = analyzeData.content?.[0]?.text || '{}';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    const totalScore = result.scores
      ? Object.values(result.scores).reduce((sum: number, s: any) => sum + (s.score || 0), 0)
      : 0;

    // DBに保存
    const saved = await sql`
      INSERT INTO applicants (
        name, position, raw_text, extracted_data, scores,
        total_score, ai_comment, interview_points,
        dominant_needs, personality_summary, recommendation
      ) VALUES (
        ${result.extracted_data?.name || '未取得'},
        ${position},
        ${inputText.slice(0, 5000)},
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

    return NextResponse.json({
      id: saved[0].id,
      ...result,
      total_score: totalScore,
      raw_text: inputText.slice(0, 500),
    });

  } catch (e: any) {
    console.error('analyze error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
