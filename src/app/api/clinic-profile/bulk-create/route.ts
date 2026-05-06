import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

interface FileText {
  fileName: string;
  text: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  const { fileTexts } = (await req.json()) as { fileTexts: FileText[] };
  if (!Array.isArray(fileTexts) || fileTexts.length === 0) {
    return NextResponse.json({ error: 'fileTextsが必要です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const created: { id: number; name: string }[] = [];
  for (const { fileName, text } of fileTexts) {
    if (!text || !text.trim()) continue;
    const profileName = (fileName ?? '無題').replace(/\.(pdf|docx?|doc|txt|md)$/i, '');
    const [profile] = await sql`
      INSERT INTO clinic_profiles
        (user_id, name, description, content, sections, is_default)
      VALUES (
        ${userId},
        ${profileName},
        ${'ファイルから自動インポート'},
        ${text},
        ${'[]'}::jsonb,
        ${false}
      )
      RETURNING id, name
    `;
    created.push({ id: profile.id, name: profile.name });
  }

  return NextResponse.json({ created, count: created.length });
}
