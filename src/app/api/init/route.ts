import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      mode TEXT DEFAULT 'blog',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      metadata TEXT,
      is_favorite INTEGER DEFAULT 0,
      tags TEXT DEFAULT '',
      group_name TEXT DEFAULT '未分類',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      frequency TEXT DEFAULT 'weekly',
      last_run TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      industry TEXT,
      role TEXT,
      system_prompt TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    // 既存テーブルにカラム追加（エラーは無視）
    try { await sql`ALTER TABLE library ADD COLUMN is_favorite INTEGER DEFAULT 0`; } catch {}
    try { await sql`ALTER TABLE library ADD COLUMN tags TEXT DEFAULT ''`; } catch {}
    try { await sql`ALTER TABLE library ADD COLUMN group_name TEXT DEFAULT '未分類'`; } catch {}

    // クリニックマネジメント用カラム・テーブル
    try { await sql`ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false`; } catch {}

    await sql`CREATE TABLE IF NOT EXISTS clinic_philosophy (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE TABLE IF NOT EXISTS grade_levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level_number INTEGER NOT NULL,
      description TEXT,
      requirements_promotion TEXT,
      requirements_demotion TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE TABLE IF NOT EXISTS action_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee_name TEXT,
      due_date TIMESTAMP,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      category TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    // Phase B-1: スタッフ��理テーブル
    await sql`CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      name_kana TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      position TEXT,
      department TEXT,
      hired_at TIMESTAMP,
      status TEXT DEFAULT 'active',
      current_grade_id TEXT,
      photo_url TEXT,
      memo TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS staff_documents (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT,
      extracted_text TEXT,
      ai_analysis TEXT,
      uploaded_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS staff_notes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      type TEXT DEFAULT 'other',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS grade_histories (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      from_grade TEXT,
      to_grade TEXT NOT NULL,
      reason TEXT,
      changed_by TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    )`;

    // Phase B-2: アンケート・試験テーブル
    await sql`CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL,
      target_role TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS staff_survey_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      answers TEXT NOT NULL,
      ai_summary TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL,
      passing_score INTEGER DEFAULT 70,
      target_role TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS staff_exam_results (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      score FLOAT NOT NULL,
      passed BOOLEAN NOT NULL,
      answers TEXT,
      ai_comment TEXT,
      taken_at TIMESTAMP DEFAULT NOW()
    )`;

    // Phase B-3: 評価基準テーブル
    await sql`CREATE TABLE IF NOT EXISTS evaluation_criteria (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      grade_id TEXT NOT NULL,
      categories TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // ハンドブック
    await sql`CREATE TABLE IF NOT EXISTS handbooks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS handbook_chapters (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      handbook_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      ai_suggestions TEXT,
      last_edited_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    return NextResponse.json({ success: true, message: '全テーブル初期化完了' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
