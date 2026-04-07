import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { evaluationId, staffName, approvedGrade } = await req.json();

  if (!evaluationId || !staffName || !approvedGrade) {
    return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 1. 評価を承認済みに更新
    await sql`
      UPDATE staff_evaluations SET
        promotion_approved = true,
        approved_at = NOW(),
        approved_grade = ${approvedGrade},
        updated_at = NOW()
      WHERE id = ${evaluationId}
    `;

    // 2. staffテーブルのcurrent_grade_idを自動更新
    const staffRows = await sql`
      SELECT id, current_grade_id FROM staff WHERE name = ${staffName} LIMIT 1
    `;

    if (staffRows.length > 0) {
      const staffId = staffRows[0].id;
      const fromGrade = staffRows[0].current_grade_id;

      // grade_levelsからIDを取得（nurse_g3等）
      const gradeRow = await sql`
        SELECT id FROM grade_levels
        WHERE name LIKE ${approvedGrade + '%'}
        LIMIT 1
      `;
      const gradeId = gradeRow[0]?.id || null;

      if (gradeId) {
        await sql`
          UPDATE staff SET current_grade_id = ${gradeId}, updated_at = NOW()
          WHERE id = ${staffId}
        `;
      }

      // 3. grade_historiesに記録
      try {
        await sql`
          INSERT INTO grade_histories (staff_id, from_grade, to_grade, reason, changed_at)
          VALUES (
            ${staffId},
            ${fromGrade || ''},
            ${gradeId || approvedGrade},
            ${'評価スコアによる昇格承認'},
            NOW()
          )
        `;
      } catch (histErr) {
        console.error('grade_histories insert error:', histErr);
      }
    } else {
      console.warn('staff not found for name:', staffName);
    }

    return NextResponse.json({
      success: true,
      message: `${staffName}さんを${approvedGrade}に昇格しました`,
    });

  } catch (e: any) {
    console.error('approve error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
