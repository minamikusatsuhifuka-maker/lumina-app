export const maxDuration = 300;

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const position = body.position || body.positions || '看護師';
    const role = body.role || '一般〜管理職';
    const count = body.count || 5;

    const sql = neon(process.env.DATABASE_URL!);

    // 理念・成長哲学・就業規則を並行取得
    const [philRows, growthRows, rulesRows] = await Promise.all([
      sql`SELECT content FROM clinic_philosophy LIMIT 1`,
      sql`SELECT win_win_vision, power_partner_definition,
              lead_management_philosophy, growth_model, core_values
       FROM growth_philosophy LIMIT 1`,
      sql`SELECT content FROM employment_rules LIMIT 1`.catch(() => []),
    ]);

    const philosophy = philRows[0]?.content ?? '';
    const growth = growthRows[0];
    const rules = (rulesRows[0]?.content as string)?.slice(0, 2000) ?? '';

    const systemPrompt = `あなたはクリニックの等級制度設計の専門家です。必ずJSON形式のみで返してください。前置きや説明は不要です。

【クリニックの理念】
${philosophy}

【院長のビジョン】
${growth?.win_win_vision ?? ''}

【リードマネジメント哲学】
${growth?.lead_management_philosophy ?? ''}

【「実」を見て評価する】
${growth?.core_values ?? ''}

【等級設計の大原則】
・ピラミッドではなく同心円モデル（G1ルーキー〜G5アンバサダー）
・実行・実績・実力・誠実の「実」を見て評価する
・マインド50%・知識25%・スキル25%の配分
・アチーブメント原則：知る→わかる→行う→できる→分かち合う`;

    const userPrompt = `職種：${position}（${role}）
等級数：${count}段階

以下のJSON形式で等級制度を作成してください：
{
  "grades": [
    {
      "levelNumber": 1,
      "name": "G1 ルーキー",
      "position": "${position}",
      "role": "学ぶ人・吸収する人",
      "description": "この等級の役割・期待（3〜5文）",
      "skills": ["必要なスキル①", "スキル②", "スキル③"],
      "knowledge": ["必要な知識①", "知識②"],
      "mindset": ["求めるマインド①", "マインド②"],
      "continuousLearning": ["継続学習①", "継続学習②"],
      "requiredCertifications": ["必須資格①"],
      "promotionExam": {
        "description": "昇格試験の概要",
        "format": "試験形式",
        "passingCriteria": "合格基準",
        "examContent": ["試験内容①", "試験内容②"]
      },
      "requirementsPromotion": "昇格条件まとめ",
      "requirementsDemotion": "降格条件",
      "salaryMin": 220000,
      "salaryMax": 240000
    }
  ],
  "designComment": "この等級設計の意図・特徴"
}

給与目安（皮膚科クリニック・滋賀県）：
G1: 22〜24万 / G2: 24〜28万 / G3: 28〜34万 / G4: 34〜42万 / G5: 42〜52万`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const resultText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    const clean = resultText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(clean);

    // DBに保存
    const savedGrades = [];
    for (const grade of parsed.grades) {
      const existing = await sql`
        SELECT id FROM grade_levels
        WHERE level_number = ${grade.levelNumber}
        AND position = ${position}
        LIMIT 1
      `;

      let saved;
      if (existing.length > 0) {
        [saved] = await sql`
          UPDATE grade_levels SET
            name = ${grade.name},
            role = ${grade.role ?? ''},
            description = ${grade.description ?? ''},
            skills = ${JSON.stringify(grade.skills ?? [])},
            knowledge = ${JSON.stringify(grade.knowledge ?? [])},
            mindset = ${JSON.stringify(grade.mindset ?? [])},
            continuous_learning = ${JSON.stringify(grade.continuousLearning ?? [])},
            required_certifications = ${JSON.stringify(grade.requiredCertifications ?? [])},
            promotion_exam = ${JSON.stringify(grade.promotionExam ?? {})},
            requirements_promotion = ${grade.requirementsPromotion ?? ''},
            requirements_demotion = ${grade.requirementsDemotion ?? ''},
            salary_min = ${grade.salaryMin ?? 0},
            salary_max = ${grade.salaryMax ?? 0},
            updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING *
        `;
      } else {
        [saved] = await sql`
          INSERT INTO grade_levels (
            level_number, name, position, role, description,
            skills, knowledge, mindset, continuous_learning,
            required_certifications, promotion_exam,
            requirements_promotion, requirements_demotion,
            salary_min, salary_max
          ) VALUES (
            ${grade.levelNumber}, ${grade.name}, ${position},
            ${grade.role ?? ''}, ${grade.description ?? ''},
            ${JSON.stringify(grade.skills ?? [])},
            ${JSON.stringify(grade.knowledge ?? [])},
            ${JSON.stringify(grade.mindset ?? [])},
            ${JSON.stringify(grade.continuousLearning ?? [])},
            ${JSON.stringify(grade.requiredCertifications ?? [])},
            ${JSON.stringify(grade.promotionExam ?? {})},
            ${grade.requirementsPromotion ?? ''},
            ${grade.requirementsDemotion ?? ''},
            ${grade.salaryMin ?? 0}, ${grade.salaryMax ?? 0}
          ) RETURNING *
        `;
      }
      savedGrades.push(saved);
    }

    return Response.json({
      success: true,
      grades: savedGrades,
      designComment: parsed.designComment,
    });

  } catch (e) {
    console.error('Grade generate error:', e);
    return Response.json(
      { error: `生成エラー: ${String(e)}` },
      { status: 500 }
    );
  }
}
