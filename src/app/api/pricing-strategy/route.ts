import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 価格戦略セッション一覧
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const sessions = await sql`
    SELECT * FROM pricing_sessions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 30
  `;
  return NextResponse.json({ sessions });
}

// 価格戦略セッションを保存
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const body = await req.json();
  const {
    treatmentName,
    treatmentCategory,
    region,
    bedCostPerHour,
    treatmentTimeMinutes,
    competitorData,
    famousClinicData,
    analysisResult,
    recommendedPrice,
    priceRangeMin,
    priceRangeMax,
  } = body;

  const rows = await sql`
    INSERT INTO pricing_sessions (
      user_id, treatment_name, treatment_category, region,
      bed_cost_per_hour, treatment_time_minutes,
      competitor_data, famous_clinic_data,
      analysis_result, recommended_price,
      price_range_min, price_range_max, status
    ) VALUES (
      ${userId}, ${treatmentName}, ${treatmentCategory ?? null}, ${region},
      ${bedCostPerHour ?? 0}, ${treatmentTimeMinutes ?? 30},
      ${JSON.stringify(competitorData ?? {})}::jsonb,
      ${JSON.stringify(famousClinicData ?? [])}::jsonb,
      ${analysisResult ?? null}, ${recommendedPrice ?? null},
      ${priceRangeMin ?? null}, ${priceRangeMax ?? null}, 'completed'
    )
    RETURNING *
  `;
  return NextResponse.json({ session: rows[0] });
}
