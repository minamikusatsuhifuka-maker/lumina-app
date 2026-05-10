import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface MemberPostBody {
  name: string;
  role?: string | null;
  department?: string | null;
  joinDate?: string | null;
  currentLevel?: string | null;
  targetLevel?: string | null;
  notes?: string | null;
}

interface MemberPatchBody {
  id: number;
  name?: string | null;
  role?: string | null;
  department?: string | null;
  currentLevel?: string | null;
  targetLevel?: string | null;
  strengths?: unknown[];
  challenges?: unknown[];
  goals?: unknown[];
  notes?: string | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    if (id) {
      const memberRows = await sql`
        SELECT * FROM hr_members
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      const recordRows = await sql`
        SELECT * FROM hr_records
        WHERE member_id = ${parseInt(id, 10)} AND user_id = ${userId}
        ORDER BY recorded_at DESC
      `;
      return NextResponse.json({
        member: memberRows[0] ?? null,
        records: recordRows,
      });
    }

    const members = await sql`
      SELECT * FROM hr_members
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `;
    return NextResponse.json({ members });
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

  try {
    const body = (await req.json()) as MemberPostBody;
    const {
      name,
      role,
      department,
      joinDate,
      currentLevel,
      targetLevel,
      notes,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'nameは必須です' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO hr_members
        (name, role, department, join_date, current_level, target_level, notes, user_id)
      VALUES (
        ${name}, ${role ?? null}, ${department ?? null}, ${joinDate ?? null},
        ${currentLevel ?? null}, ${targetLevel ?? null}, ${notes ?? null}, ${userId}
      )
      RETURNING *
    `;
    return NextResponse.json({ member: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as MemberPatchBody;
    const {
      id,
      name,
      role,
      department,
      currentLevel,
      targetLevel,
      strengths,
      challenges,
      goals,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    const strJson = strengths !== undefined ? JSON.stringify(strengths) : null;
    const chJson = challenges !== undefined ? JSON.stringify(challenges) : null;
    const glJson = goals !== undefined ? JSON.stringify(goals) : null;

    const rows = await sql`
      UPDATE hr_members SET
        name = COALESCE(${name ?? null}, name),
        role = COALESCE(${role ?? null}, role),
        department = COALESCE(${department ?? null}, department),
        current_level = COALESCE(${currentLevel ?? null}, current_level),
        target_level = COALESCE(${targetLevel ?? null}, target_level),
        strengths = COALESCE(${strJson}::jsonb, strengths),
        challenges = COALESCE(${chJson}::jsonb, challenges),
        goals = COALESCE(${glJson}::jsonb, goals),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    return NextResponse.json({ member: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    await sql`
      DELETE FROM hr_members
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
