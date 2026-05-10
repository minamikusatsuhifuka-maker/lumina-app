import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface RecordPostBody {
  memberId: number;
  recordType: string;
  title: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as RecordPostBody;
    const { memberId, recordType, title, content, metadata } = body;

    if (!memberId || !recordType || !title) {
      return NextResponse.json(
        { error: 'memberId・recordType・titleは必須です' },
        { status: 400 },
      );
    }

    const rows = await sql`
      INSERT INTO hr_records (member_id, record_type, title, content, metadata, user_id)
      VALUES (
        ${memberId}, ${recordType}, ${title}, ${content ?? ''},
        ${JSON.stringify(metadata ?? {})}::jsonb, ${userId}
      )
      RETURNING *
    `;
    return NextResponse.json({ record: rows[0] });
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
      DELETE FROM hr_records
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
