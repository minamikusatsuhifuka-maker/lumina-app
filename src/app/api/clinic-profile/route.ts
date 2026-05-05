import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// クリニック背景情報プロファイル管理API（user_id分離）

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const featureKey = searchParams.get('feature');

  if (featureKey) {
    const settingRows = await sql`
      SELECT cp.* FROM feature_profile_settings fps
      LEFT JOIN clinic_profiles cp ON fps.profile_id = cp.id
      WHERE fps.user_id = ${userId}
        AND fps.feature_key = ${featureKey}
        AND fps.is_enabled = TRUE
      LIMIT 1
    `;
    if (settingRows[0]) return NextResponse.json({ profile: settingRows[0] });

    const defaultRows = await sql`
      SELECT * FROM clinic_profiles
      WHERE user_id = ${userId} AND is_default = TRUE
      LIMIT 1
    `;
    return NextResponse.json({ profile: defaultRows[0] ?? null });
  }

  if (id) {
    const [profile] = await sql`
      SELECT * FROM clinic_profiles
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ profile });
  }

  const profiles = await sql`
    SELECT * FROM clinic_profiles
    WHERE user_id = ${userId}
    ORDER BY is_default DESC, created_at ASC
  `;
  const settings = await sql`
    SELECT * FROM feature_profile_settings
    WHERE user_id = ${userId}
  `;
  return NextResponse.json({ profiles, settings });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { name, description, content, sections, isDefault } = await req.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'プロファイル名が必要です' }, { status: 400 });
  }

  if (isDefault) {
    await sql`UPDATE clinic_profiles SET is_default = FALSE WHERE user_id = ${userId}`;
  }

  const [profile] = await sql`
    INSERT INTO clinic_profiles (user_id, name, description, content, sections, is_default)
    VALUES (
      ${userId},
      ${name},
      ${description ?? null},
      ${content ?? ''},
      ${JSON.stringify(sections ?? [])}::jsonb,
      ${!!isDefault}
    )
    RETURNING *
  `;
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const body = await req.json();
  const { id, featureKey, profileId, isEnabled, ...fields } = body;

  // 機能別設定の更新
  if (featureKey !== undefined) {
    await sql`
      INSERT INTO feature_profile_settings (user_id, feature_key, profile_id, is_enabled)
      VALUES (${userId}, ${featureKey}, ${profileId ?? null}, ${isEnabled ?? true})
      ON CONFLICT (user_id, feature_key) DO UPDATE
        SET profile_id = ${profileId ?? null},
            is_enabled = ${isEnabled ?? true},
            updated_at = NOW()
    `;
    return NextResponse.json({ success: true });
  }

  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  // プロファイル更新
  if (fields.isDefault) {
    await sql`UPDATE clinic_profiles SET is_default = FALSE WHERE user_id = ${userId}`;
  }

  const [profile] = await sql`
    UPDATE clinic_profiles SET
      name = COALESCE(${fields.name ?? null}, name),
      description = COALESCE(${fields.description ?? null}, description),
      content = COALESCE(${fields.content ?? null}, content),
      sections = COALESCE(${fields.sections ? JSON.stringify(fields.sections) : null}::jsonb, sections),
      is_default = COALESCE(${fields.isDefault ?? null}, is_default),
      updated_at = NOW()
    WHERE id = ${parseInt(String(id), 10)} AND user_id = ${userId}
    RETURNING *
  `;
  if (!profile) return NextResponse.json({ error: 'プロファイルが見つかりません' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  await sql`
    DELETE FROM clinic_profiles
    WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
  `;
  return NextResponse.json({ success: true });
}
