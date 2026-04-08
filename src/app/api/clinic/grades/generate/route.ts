export const maxDuration = 300;

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

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

    const gradeNames = [
      '', 'G1 ルーキー', 'G2 コア', 'G3 エキスパート',
      'G4 パートナー', 'G5 アンバサダー', 'G6 マスター',
    ];
    const salaryMins = [0, 220000, 240000, 280000, 340000, 420000, 520000];
    const salaryMaxs = [0, 240000, 280000, 340000, 420000, 520000, 650000];
    const salaryRanges = ['', '22〜24万', '24〜28万', '28〜34万', '34〜42万', '42〜52万', '52〜65万'];

    const systemPrompt = await buildSystemContext(
      'クリニックの等級制度設計専門家。必ずJSON形式のみで返答。前置き不要。',
      'grade'
    );

    const savedGrades = [];

    const circleRanges: Record<number, string> = {
      1: '自分自身 → まず自分を整える',
      2: '自分＋チーム → 仲間に貢献できる',
      3: '自分＋チーム＋クリニック → 組織を豊かに',
      4: '上記＋患者さん → 患者人生に貢献',
      5: '上記＋地域・業界 → 外の世界に価値を届ける',
      6: '上記＋業界全体 → 業界をリードする',
    };

    // 1等級ずつ生成（JSON切れ防止）
    for (let level = 1; level <= gradeCount; level++) {
      const gradeName = gradeNames[level] ?? `G${level}`;
      const salaryRange = salaryRanges[level] ?? '';
      const circleRange = circleRanges[level] ?? '';

      const userPrompt = `【非ピラミッド・同心円モデルの原則】
等級は「上下関係」ではなく「影響の輪の広がり」を表します。
G5が偉いのではなく「豊かにできる人の輪が最も広い」のです。

職種：${position} / 等級：${gradeName}（全${gradeCount}段階中第${level}段階）
同心円の範囲：${circleRange}
給与：月${salaryRange}

等級が上がるほど「先払いの量」が増える。基準は「言動として現れる実」で記述すること。
JSON形式のみで返してください（説明不要）：
{
  "name": "${gradeName}",
  "description": "この等級の同心円ミッション（1〜2文）",
  "skills": ["スキル①", "スキル②", "スキル③", "スキル④", "スキル⑤"],
  "knowledge": ["知識①", "知識②", "知識③", "知識④", "知識⑤"],
  "mindset": ["マインド①（言動として現れる形）", "マインド②", "マインド③", "マインド④", "マインド⑤"],
  "continuousLearning": ["学習①", "学習②"],
  "requiredCertifications": ["資格①"],
  "requirementsPromotion": "昇格条件（具体的・測定可能、1〜2文）",
  "requirementsDemotion": "降格条件（1文）",
  "salaryMin": ${salaryMins[level] ?? 0},
  "salaryMax": ${salaryMaxs[level] ?? 0}
}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
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
        const newId = `grade_${Date.now()}_${level}`;
        [saved] = await sql`
          INSERT INTO grade_levels (
            id, level_number, name, position, role, description,
            skills, knowledge, mindset, continuous_learning,
            required_certifications, promotion_exam,
            requirements_promotion, requirements_demotion,
            salary_min, salary_max
          ) VALUES (
            ${newId}, ${level}, ${grade.name}, ${position}, ${role},
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
