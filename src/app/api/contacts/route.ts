import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const rows = await sql`
      SELECT id, log_date, web_bookings, phone_bookings, line_inquiries, other_inquiries, memo, created_at, updated_at
      FROM contact_logs
      ORDER BY log_date DESC
      LIMIT 365
    `;
    return NextResponse.json({ logs: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[contacts GET] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const body = await req.json();
    const {
      log_date,
      web_bookings = 0,
      phone_bookings = 0,
      line_inquiries = 0,
      other_inquiries = 0,
      memo = null,
    } = body;

    if (!log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
      return NextResponse.json({ error: '日付(log_date)が必要です' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO contact_logs (log_date, web_bookings, phone_bookings, line_inquiries, other_inquiries, memo)
      VALUES (${log_date}, ${web_bookings}, ${phone_bookings}, ${line_inquiries}, ${other_inquiries}, ${memo})
      ON CONFLICT (log_date) DO UPDATE SET
        web_bookings = EXCLUDED.web_bookings,
        phone_bookings = EXCLUDED.phone_bookings,
        line_inquiries = EXCLUDED.line_inquiries,
        other_inquiries = EXCLUDED.other_inquiries,
        memo = EXCLUDED.memo,
        updated_at = NOW()
      RETURNING *
    `;
    return NextResponse.json({ success: true, log: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[contacts POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    await sql`DELETE FROM contact_logs WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
