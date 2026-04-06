import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);

  try {
    // テーブル存在チェック
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'grade_evaluation_framework'
      ) AS exists
    `;

    if (!tableCheck[0]?.exists) {
      return NextResponse.json({ error: 'table_not_found' }, { status: 404 });
    }

    // カラム情報取得
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'grade_evaluation_framework'
      ORDER BY ordinal_position
    `;

    // 全データ取得
    const rows = await sql`SELECT * FROM grade_evaluation_framework ORDER BY grade_level ASC`;

    return NextResponse.json({
      columns: columns.map(c => ({ name: c.column_name, type: c.data_type })),
      data: rows,
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
