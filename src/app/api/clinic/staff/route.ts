import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT s.*,
      COALESCE(gl.position, '') || ' G' || COALESCE(gl.level_number::text, '') AS current_grade_label,
      gl.level_number AS grade_level_number
    FROM staff s
    LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
    WHERE s.status = 'active'
    ORDER BY gl.level_number DESC NULLS LAST, s.name ASC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, nameKana, email, phone, position, department, hiredAt, memo } = body;
  if (!name) return NextResponse.json({ error: '名前は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO staff (id, name, name_kana, email, phone, position, department, hired_at, memo)
    VALUES (${id}, ${name}, ${nameKana || null}, ${email || null}, ${phone || null}, ${position || null}, ${department || null}, ${hiredAt || null}, ${memo || null})`;

  // 書類データがあれば保存
  if (body.documents && Array.isArray(body.documents)) {
    for (const doc of body.documents) {
      const docId = uuidv4();
      await sql`INSERT INTO staff_documents (id, staff_id, type, title, extracted_text, ai_analysis)
        VALUES (${docId}, ${id}, ${doc.type}, ${doc.title}, ${doc.extractedText || null}, ${doc.aiAnalysis ? JSON.stringify(doc.aiAnalysis) : null})`;
    }
  }

  return NextResponse.json({ success: true, id });
}
