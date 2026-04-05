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
    const gradeCount = Number(body.count) || 5;

    const sql = neon(process.env.DATABASE_URL!);

    // コンテキスト並行取得
    const [philRows, growthRows] = await Promise.all([
      sql`SELECT content FROM clinic_philosophy LIMIT 1`,
      sql`SELECT win_win_vision, lead_management_philosophy
          FROM growth_philosophy LIMIT 1`,
    ]);
    const philosophy = (philRows[0]?.content as string)?.slice(0, 1000) ?? '';
    const growth = growthRows[0];

    const gradeNames = [
      '', 'G1 ルーキー', 'G2 コア', 'G3 エキスパート',
      'G4 パートナー', 'G5 アンバサダー', 'G6 マスター',
    ];
    const salaryMins = [0, 220000, 240000, 280000, 340000, 420000, 520000];
    const salaryMaxs = [0, 240000, 280000, 340000, 420000, 520000, 650000];
    const salaryRanges = ['', '22〜24万', '24〜28万', '28〜34万', '34〜42万', '42〜52万', '52〜65万'];

    const systemPrompt = `あなたはクリニックの等級制度設計の専門家です。
必ずJSON形式のみで返してください。前置き・説明・コードブロックは不要です。

クリニックの理念：${philosophy}
ビジョン：${(growth?.win_win_vision as string)?.slice(0, 300) ?? ''}
評価方針：マインド50%・知識25%・スキル25%。実行・実績・実力・誠実の「実」を見て評価。
等級モデル：ピラミッドではなく同心円。G1ルーキー〜G5アンバサダー。`;

    const savedGrades = [];

    // 1等級ずつ生成（JSON切れ防止）
    for (let level = 1; level <= gradeCount; level++) {
      const gradeName = gradeNames[level] ?? `G${level}`;
      const salaryRange = salaryRanges[level] ?? '';

      const userPrompt = `職種：${position}（${role}）
等級：${gradeName}（全${gradeCount}段階中 第${level}段階）
給与目安：月${salaryRange}（皮膚科クリニック・滋賀県）

以下のJSON形式のみで返してください：
{
  "levelNumber": ${level},
  "name": "${gradeName}",
  "description": "この等級の役割と期待（2〜3文）",
  "skills": ["スキル①", "スキル②", "スキル③"],
  "knowledge": ["知識①", "知識②", "知識③"],
  "mindset": ["マインド①", "マインド②", "マインド③"],
  "continuousLearning": ["継続学習①", "継続学習②"],
  "requiredCertifications": ["必須資格①"],
  "promotionExam": {
    "description": "昇格試験の概要",
    "format": "形式",
    "passingCriteria": "合格基準",
    "examContent": ["試験内容①", "試験内容②"]
  },
  "requirementsPromotion": "昇格条件（箇条書き）",
  "requirementsDemotion": "降格条件",
  "salaryMin": ${salaryMins[level] ?? 0},
  "salaryMax": ${salaryMaxs[level] ?? 0}
}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
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

      const grade = JSON.parse(clean);

      // DBに保存（UPSERT）
      const existing = await sql`
        SELECT id FROM grade_levels
        WHERE level_number = ${level} AND position = ${position}
        LIMIT 1
      `;

      let saved;
      if (existing.length > 0) {
        [saved] = await sql`
          UPDATE grade_levels SET
            name = ${grade.name},
            role = ${role},
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
            ${level}, ${grade.name}, ${position}, ${role},
            ${grade.description ?? ''},
            ${JSON.stringify(grade.skills ?? [])},
            ${JSON.stringify(grade.knowledge ?? [])},
            ${JSON.stringify(grade.mindset ?? [])},
            ${JSON.stringify(grade.continuousLearning ?? [])},
            ${JSON.stringify(grade.requiredCertifications ?? [])},
            ${JSON.stringify(grade.promotionExam ?? {})},
            ${grade.requirementsPromotion ?? ''},
            ${grade.requirementsDemotion ?? ''},
            ${grade.salaryMin ?? 0},
            ${grade.salaryMax ?? 0}
          ) RETURNING *
        `;
      }
      savedGrades.push(saved);
    }

    return Response.json({ success: true, grades: savedGrades });

  } catch (e) {
    console.error('Grade generate error:', e);
    return Response.json(
      { error: `生成エラー: ${String(e)}` },
      { status: 500 }
    );
  }
}
