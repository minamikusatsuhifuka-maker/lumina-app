import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

interface ProfileRow {
  id: number;
  name: string;
  content: string;
  sections: { title?: string; category?: string; content?: string }[] | null;
  description: string | null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  const { profileIds, mergedName, mergedDescription, deleteOriginals } = await req.json();
  if (!Array.isArray(profileIds) || profileIds.length < 2) {
    return NextResponse.json({ error: '2件以上のプロファイルを選択してください' }, { status: 400 });
  }

  const ids = profileIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  const sql = neon(process.env.DATABASE_URL!);

  const rows = (await sql`
    SELECT id, name, content, sections, description
    FROM clinic_profiles
    WHERE id = ANY(${ids}) AND user_id = ${userId}
    ORDER BY created_at ASC
  `) as unknown as ProfileRow[];

  if (rows.length === 0) {
    return NextResponse.json({ error: 'プロファイルが見つかりません' }, { status: 404 });
  }

  // テキストを結合（プロファイル名ヘッダー付き）
  const mergedContent = rows
    .map((p) => `## ${p.name}\n\n${p.content ?? ''}`)
    .join('\n\n---\n\n');

  // セクションも統合（タイトルに元プロファイル名を付加）
  const mergedSections = rows.flatMap((p) => {
    const secs = Array.isArray(p.sections) ? p.sections : [];
    return secs.map((s) => ({
      ...s,
      title: `[${p.name}] ${s.title ?? ''}`,
    }));
  });

  const finalName = mergedName?.trim() || `統合プロファイル（${rows.length}件）`;
  const finalDescription =
    mergedDescription?.trim() || `${rows.map((p) => p.name).join('、')} を統合`;

  const [merged] = await sql`
    INSERT INTO clinic_profiles
      (user_id, name, description, content, sections, is_default)
    VALUES (
      ${userId},
      ${finalName},
      ${finalDescription},
      ${mergedContent},
      ${JSON.stringify(mergedSections)}::jsonb,
      ${false}
    )
    RETURNING *
  `;

  if (deleteOriginals) {
    await sql`
      DELETE FROM clinic_profiles
      WHERE id = ANY(${ids}) AND user_id = ${userId}
    `;
  }

  return NextResponse.json({
    merged,
    sourceCount: rows.length,
    deletedOriginals: !!deleteOriginals,
  });
}
