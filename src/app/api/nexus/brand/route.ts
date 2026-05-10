import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface BrandPostBody {
  brandName?: string;
  tagline?: string;
  description?: string;
  ownerName?: string;
  ownerProfile?: string;
  services?: unknown[];
  achievements?: unknown[];
  testimonials?: unknown[];
  snsLinks?: Record<string, string>;
  colorTheme?: string;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const rows = await sql`
      SELECT * FROM nexus_brand WHERE user_id = ${userId}
    `;
    return NextResponse.json({ brand: rows[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';
  if (!userId) {
    return NextResponse.json(
      { error: 'ユーザーIDが取得できません' },
      { status: 400 },
    );
  }

  try {
    const body = (await req.json()) as BrandPostBody;

    const rows = await sql`
      INSERT INTO nexus_brand (
        user_id, brand_name, tagline, description, owner_name,
        owner_profile, services, achievements, testimonials,
        sns_links, color_theme
      ) VALUES (
        ${userId},
        ${body.brandName ?? 'nexus'},
        ${body.tagline ?? null},
        ${body.description ?? null},
        ${body.ownerName ?? null},
        ${body.ownerProfile ?? null},
        ${JSON.stringify(body.services ?? [])}::jsonb,
        ${JSON.stringify(body.achievements ?? [])}::jsonb,
        ${JSON.stringify(body.testimonials ?? [])}::jsonb,
        ${JSON.stringify(body.snsLinks ?? {})}::jsonb,
        ${body.colorTheme ?? 'dark'}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        tagline = EXCLUDED.tagline,
        description = EXCLUDED.description,
        owner_name = EXCLUDED.owner_name,
        owner_profile = EXCLUDED.owner_profile,
        services = EXCLUDED.services,
        achievements = EXCLUDED.achievements,
        testimonials = EXCLUDED.testimonials,
        sns_links = EXCLUDED.sns_links,
        color_theme = EXCLUDED.color_theme,
        updated_at = NOW()
      RETURNING *
    `;
    return NextResponse.json({ brand: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
