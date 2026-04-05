import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// GET: ファイル一覧
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const files = await sql`SELECT * FROM philosophy_files ORDER BY created_at DESC`;
  return NextResponse.json({ files });
}

// POST: ファイルを保存（複数対応・同名ファイルは上書き）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { files } = await req.json();
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'files は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  for (const file of files) {
    const charCount = file.content.length;
    const existing = await sql`SELECT id FROM philosophy_files WHERE name = ${file.name}`;
    if (existing.length > 0) {
      await sql`UPDATE philosophy_files SET content = ${file.content}, char_count = ${charCount} WHERE name = ${file.name}`;
    } else {
      await sql`INSERT INTO philosophy_files (name, content, char_count) VALUES (${file.name}, ${file.content}, ${charCount})`;
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: ファイルを1件削除
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM philosophy_files WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
