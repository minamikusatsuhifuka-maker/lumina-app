import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS near_miss_reports (
      id                  SERIAL PRIMARY KEY,
      report_type         TEXT DEFAULT 'near_miss',
      reporter_name       TEXT NOT NULL,
      department          TEXT NOT NULL,
      occurred_at         TIMESTAMP NOT NULL,
      location            TEXT,
      incident            TEXT NOT NULL,
      direct_cause        TEXT,
      background_cause    TEXT,
      prevention_personal TEXT,
      prevention_team     TEXT,
      reflection          TEXT,
      comment             TEXT,
      admin_comment       TEXT,
      is_read             BOOLEAN DEFAULT FALSE,
      is_shared           BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `;
  // 既存テーブルにreport_typeカラムを追加（既にある場合はスキップ）
  await sql`
    ALTER TABLE near_miss_reports
    ADD COLUMN IF NOT EXISTS report_type TEXT DEFAULT 'near_miss'
  `;
  // notice_categoryカラムを追加（気づきシェアのカテゴリ）
  await sql`
    ALTER TABLE near_miss_reports
    ADD COLUMN IF NOT EXISTS notice_category TEXT
  `;
}

// GET: 一覧取得（部署フィルタ・タイプフィルタ対応）
export async function GET(req: Request) {
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const department = searchParams.get('department');
  const type       = searchParams.get('type');

  let rows;
  if (department && department !== 'all' && type && type !== 'all') {
    rows = await sql`SELECT * FROM near_miss_reports WHERE department = ${department} AND report_type = ${type} ORDER BY created_at DESC`;
  } else if (department && department !== 'all') {
    rows = await sql`SELECT * FROM near_miss_reports WHERE department = ${department} ORDER BY created_at DESC`;
  } else if (type && type !== 'all') {
    rows = await sql`SELECT * FROM near_miss_reports WHERE report_type = ${type} ORDER BY created_at DESC`;
  } else {
    rows = await sql`SELECT * FROM near_miss_reports ORDER BY created_at DESC`;
  }
  return NextResponse.json({ reports: rows });
}

// POST: 新規報告
export async function POST(req: Request) {
  await ensureTable();
  const body = await req.json();
  await sql`
    INSERT INTO near_miss_reports (
      report_type, notice_category,
      reporter_name, department, occurred_at, location,
      incident, direct_cause, background_cause,
      prevention_personal, prevention_team, reflection, comment
    ) VALUES (
      ${body.report_type ?? 'near_miss'}, ${body.notice_category ?? null},
      ${body.reporter_name}, ${body.department}, ${body.occurred_at}, ${body.location ?? ''},
      ${body.incident}, ${body.direct_cause ?? ''}, ${body.background_cause ?? ''},
      ${body.prevention_personal ?? ''}, ${body.prevention_team ?? ''},
      ${body.reflection ?? ''}, ${body.comment ?? ''}
    )
  `;
  return NextResponse.json({ ok: true });
}

// PATCH: 既読・管理者コメント・共有フラグ更新
export async function PATCH(req: Request) {
  await ensureTable();
  const body = await req.json();
  if (body.is_read !== undefined) {
    await sql`UPDATE near_miss_reports SET is_read = ${body.is_read} WHERE id = ${body.id}`;
  }
  if (body.admin_comment !== undefined) {
    await sql`UPDATE near_miss_reports SET admin_comment = ${body.admin_comment} WHERE id = ${body.id}`;
  }
  if (body.is_shared !== undefined) {
    await sql`UPDATE near_miss_reports SET is_shared = ${body.is_shared} WHERE id = ${body.id}`;
  }
  return NextResponse.json({ ok: true });
}
