import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const [staffRows, docRows, noteRows, gradeRows] = await Promise.all([
    sql`SELECT * FROM staff WHERE id = ${id}`,
    sql`SELECT * FROM staff_documents WHERE staff_id = ${id} ORDER BY uploaded_at DESC`,
    sql`SELECT * FROM staff_notes WHERE staff_id = ${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM grade_histories WHERE staff_id = ${id} ORDER BY changed_at DESC`,
  ]);

  if (!staffRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...staffRows[0],
    documents: docRows,
    notes: noteRows,
    gradeHistories: gradeRows,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  const fields: string[] = [];
  const vals: unknown[] = [];
  const allowedFields: Record<string, string> = {
    name: 'name', nameKana: 'name_kana', email: 'email', phone: 'phone',
    position: 'position', department: 'department', hiredAt: 'hired_at',
    status: 'status', currentGradeId: 'current_grade_id', memo: 'memo',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (body[key] !== undefined) { fields.push(col); vals.push(body[key]); }
  }

  if (fields.length > 0) {
    // Neon doesn't support dynamic column names in tagged templates, so build individual updates
    for (let i = 0; i < fields.length; i++) {
      const col = fields[i];
      const val = vals[i];
      // 各カラムを個別に更新
      if (col === 'name') await sql`UPDATE staff SET name = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'name_kana') await sql`UPDATE staff SET name_kana = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'email') await sql`UPDATE staff SET email = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'phone') await sql`UPDATE staff SET phone = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'position') await sql`UPDATE staff SET position = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'department') await sql`UPDATE staff SET department = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'hired_at') await sql`UPDATE staff SET hired_at = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'status') await sql`UPDATE staff SET status = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'current_grade_id') await sql`UPDATE staff SET current_grade_id = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
      else if (col === 'memo') await sql`UPDATE staff SET memo = ${val as string}, updated_at = NOW() WHERE id = ${id}`;
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE staff SET status = 'retired', updated_at = NOW() WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
