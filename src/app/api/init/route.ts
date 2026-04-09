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
      folder_name TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    // 既存テーブルにfolder_nameカラムを追加（既にある場合は無視）
    await sql`ALTER TABLE library ADD COLUMN IF NOT EXISTS folder_name TEXT DEFAULT NULL`;
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

    // grade_levels拡張カラム
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS position TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS role TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS skills TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS knowledge TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS mindset TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS continuous_learning TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS required_certifications TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS promotion_exam TEXT`; } catch {}
    try { await sql`ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS ai_chat_history TEXT`; } catch {}

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

    // AI対話セッション
    await sql`CREATE TABLE IF NOT EXISTS ai_dialogue_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      context_type TEXT NOT NULL,
      context_id TEXT,
      context_label TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      extracted_insights TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS clinic_decision_criteria (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      category TEXT NOT NULL,
      criterion TEXT NOT NULL,
      source_session_id TEXT,
      priority INTEGER DEFAULT 5,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Phase C: 経営戦略
    await sql`CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      goal TEXT,
      background TEXT,
      status TEXT DEFAULT 'draft',
      priority TEXT DEFAULT 'medium',
      start_date DATE,
      target_date DATE,
      ai_chat_history TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    try { await sql`ALTER TABLE action_tasks ADD COLUMN IF NOT EXISTS strategy_id TEXT`; } catch {}
    try { await sql`ALTER TABLE action_tasks ADD COLUMN IF NOT EXISTS start_date DATE`; } catch {}
    try { await sql`ALTER TABLE action_tasks ADD COLUMN IF NOT EXISTS target_date DATE`; } catch {}
    try { await sql`ALTER TABLE action_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`; } catch {}
    try { await sql`ALTER TABLE action_tasks ADD COLUMN IF NOT EXISTS memo TEXT`; } catch {}

    // 成長哲学システム
    await sql`CREATE TABLE IF NOT EXISTS growth_philosophy (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL DEFAULT 'クリニック成長哲学',
      core_values TEXT,
      growth_model TEXT,
      win_win_vision TEXT,
      power_partner_definition TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS personal_growth_plans (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      life_vision TEXT,
      personal_mission TEXT,
      core_values TEXT,
      self_love_notes TEXT,
      strength_discovery TEXT,
      short_term_goals TEXT,
      long_term_goals TEXT,
      organization_alignment TEXT,
      power_partners TEXT,
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS self_management_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      log_date DATE NOT NULL,
      daily_goal TEXT,
      achievement TEXT,
      reflection TEXT,
      gratitude TEXT,
      tomorrow_intention TEXT,
      mood_score INTEGER,
      growth_score INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // 職種・役職定義 + マインド成長
    await sql`CREATE TABLE IF NOT EXISTS position_definitions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      responsibilities TEXT,
      required_base_skills TEXT,
      career_path TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS role_definitions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL UNIQUE,
      level_order INTEGER,
      description TEXT,
      responsibilities TEXT,
      authority TEXT,
      leadership_requirements TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS mindset_growth_framework (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      grade_level INTEGER NOT NULL,
      position TEXT,
      core_value TEXT NOT NULL,
      stage_description TEXT,
      behavioral_indicators TEXT,
      growth_actions TEXT,
      assessment_criteria TEXT,
      created_at TIMESTAMP DEFAULT NOW()
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

    await sql`CREATE TABLE IF NOT EXISTS glossary_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      reading TEXT,
      definition TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT 'general',
      level TEXT NOT NULL DEFAULT 'beginner',
      tags TEXT NOT NULL DEFAULT '',
      source_text TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS writing_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      style TEXT NOT NULL,
      length TEXT NOT NULL,
      audience TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // AIメモリ
    await sql`CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source_type TEXT NOT NULL DEFAULT 'library',
      source_title TEXT,
      keywords TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_memory_items_user ON memory_items (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_memory_items_user_cat ON memory_items (user_id, category)`;

    // GA Analytics
    await sql`CREATE TABLE IF NOT EXISTS ga_properties (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      property_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, property_id)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS ga_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      property_id TEXT NOT NULL,
      fetched_at TIMESTAMP DEFAULT NOW(),
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      sessions INTEGER DEFAULT 0,
      users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      pageviews INTEGER DEFAULT 0,
      bounce_rate FLOAT DEFAULT 0,
      engagement_rate FLOAT DEFAULT 0,
      avg_session_duration FLOAT DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      conversion_rate FLOAT DEFAULT 0,
      channel_breakdown TEXT DEFAULT '{}',
      top_pages TEXT DEFAULT '[]'
    )`;

    await sql`CREATE TABLE IF NOT EXISTS ga_metric_history (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      snapshot_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value FLOAT NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ga_mh_snapshot ON ga_metric_history (snapshot_id, metric_name)`;

    // 会話履歴
    await sql`CREATE TABLE IF NOT EXISTS chat_histories (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      messages JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_histories_user ON chat_histories(user_id)`;

    // 共有アイテム
    await sql`CREATE TABLE IF NOT EXISTS shared_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      library_item_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMP,
      view_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // 通知センター
    await sql`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'info',
      is_read BOOLEAN DEFAULT false,
      href TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`;

    await sql`CREATE TABLE IF NOT EXISTS ga_insights (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      snapshot_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      analysis TEXT NOT NULL,
      advice TEXT NOT NULL,
      priority INTEGER DEFAULT 5,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    return NextResponse.json({ success: true, message: '全テーブル初期化完了' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
