import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  // ログインユーザーのメールからスタッフ情報を取得
  const staffRows = await sql`
    SELECT s.*,
      gl.name AS grade_name,
      gl.level_number AS grade_level,
      gl.position AS grade_position,
      gl.description AS grade_description,
      gl.requirements_promotion
    FROM staff s
    LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
    WHERE s.email = ${session.user.email}
       OR s.name = ${session.user.name || ''}
    LIMIT 1
  `;

  if (staffRows.length === 0) {
    // スタッフ未登録の場合はG1の情報を返す
    const g1 = await sql`SELECT * FROM grade_levels WHERE level_number = 1 ORDER BY position ASC LIMIT 1`;
    return NextResponse.json({ current: null, next: g1[0] || null, name: session.user.name });
  }

  const staff = staffRows[0];
  const currentLevel = staff.grade_level || 0;

  // 次の等級を取得
  const nextRows = await sql`
    SELECT * FROM grade_levels
    WHERE level_number = ${currentLevel + 1}
    AND (position = ${staff.grade_position || ''} OR position IS NULL)
    LIMIT 1
  `;

  return NextResponse.json({
    name: staff.name,
    current: {
      name: staff.grade_name,
      level: currentLevel,
      position: staff.grade_position,
      description: staff.grade_description,
    },
    next: nextRows[0] || null,
  });
}
