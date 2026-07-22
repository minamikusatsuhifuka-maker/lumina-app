// AIメモ機能(目標逆算で仕分け→第2象限提案→TODO化)のDB層 + triageロジック。
// xLUMINA(Neon)。scheduling.ts の ensureSchedulingTables 方式に倣い冪等にテーブル作成。
// AIは既存共通関数(generateWithModel + robustJsonParse)を流用し、新規lib/新キーは作らない。
//
// 設計思想(院長の理念):
//   - 重要度 = 目標(memo_goals)への寄与度(インサイドアウト=自分の目標起点)
//   - 緊急度 = 締切/時間感応
//   - 第2象限(重要×非緊急)を埋もれさせず明確に拾う
//   - AIは提案、確定は人(human-in-the-loop)

import { neon } from '@neondatabase/serverless';
import { generateWithModel } from '@/lib/ai-client';
import { robustJsonParse } from '@/lib/ai-json-parser';
import {
  buildTriagePrompt,
  deriveQuadrant,
  TRIAGE_FAIL_FALLBACK,
  FIELD_DEFAULT,
} from '@/lib/memo-triage-config';
import { ensureQuadrantCriteria, listEnabledCriteria, formatCriteriaForPrompt } from '@/lib/quadrant-criteria';

type Sql = ReturnType<typeof neon<false, false>>;

// ============================================================
// 日時ヘルパ(JST / Asia/Tokyo)
//   Vercel実行環境はUTCのため、相対日時(明日/今週金曜 等)の解決基準として
//   必ずJSTに明示変換してプロンプトへ渡す。
// ============================================================
const pad2 = (n: number) => String(n).padStart(2, '0');

// 現在日時をJSTの人間可読文字列で返す(プロンプトの基準)。
function nowJstText(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()];
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}(${wd}) ${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())} JST(Asia/Tokyo, UTC+9)`;
}

// 任意のDate(UTC内部表現)をJSTの 'YYYY-MM-DD' に変換(due_date橋渡し用)。
function jstDateStr(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
}

// AIが返した due_at(ISO8601, 通常 +09:00 付き)を検証し、保存用の絶対ISO(UTC)とJST日付に正規化。
// 解析できなければ両方 null(=日時指定なし扱い)。
function parseDueAt(raw: unknown): { dueAtIso: string | null; dueDate: string | null } {
  if (typeof raw !== 'string' || !raw.trim()) return { dueAtIso: null, dueDate: null };
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) return { dueAtIso: null, dueDate: null };
  const d = new Date(t);
  return { dueAtIso: d.toISOString(), dueDate: jstDateStr(d) };
}

// ============================================================
// 型
// ============================================================
export type MemoStatus = 'inbox' | 'triaged' | 'done' | 'archived';
export type MemoKind = 'task' | 'idea' | 'note' | 'reference';
export type QuadrantNum = 1 | 2 | 3 | 4;

export interface MemoGoal {
  id: string;
  owner: string;
  title: string;
  domain: string | null;
  detail: string | null;
  created_at: string;
}

export interface MemoCategory {
  id: string;
  owner: string;
  name: string;
  color: string | null;
  is_auto: boolean;
  created_at: string;
}

export interface Memo {
  id: string;
  owner: string;
  raw_text: string;
  status: MemoStatus;
  kind: MemoKind | null;
  category_id: string | null;
  importance: number | null;
  urgency: number | null;
  quadrant: QuadrantNum | null;
  goal_ref: string | null;
  ai_summary: string | null;
  ai_reason: string | null;
  due_at: string | null;          // AI抽出の絶対日時(timestamptz)。終日は has_time=false
  has_time: boolean;              // 時刻指定の有無(false=終日)
  completed_at: string | null;    // 完了印の時刻(status='done'時にセット。未完了化でNULL)
  quadrant_locked: boolean;       // 象限を人手修正でロック。再triageでAIに上書きさせない
  created_at: string;
  triaged_at: string | null;
}

export interface MemoTodo {
  id: string;
  memo_id: string;
  owner: string;
  title: string;
  done: boolean;
  sort_order: number;
  due_date: string | null;        // 締切(date)
  scheduled_date: string | null;  // 実行予定日(締切と分離。Q2を「予定に落とす」用)
  due_at: string | null;          // 時刻つき締切(timestamptz)。due_date と整合
  has_time: boolean;              // 時刻指定の有無(false=終日)
  quadrant: QuadrantNum | null;   // 由来メモの象限を引き継ぎ。TODO単位で上書き可
  completed_at: string | null;    // 完了印の時刻(done=true時にセット。未完了化でNULL)
  created_at: string;
}

// AI出力(triage)の生形
interface TriageRaw {
  kind: MemoKind;
  category: string;
  is_new_category: boolean;
  importance: number;
  urgency: number;
  quadrant: QuadrantNum;
  goal_ref: string; // 目標の title(AIが返す)
  summary: string;
  reason: string;
  todos: string[];
  due_at?: string | null; // ISO8601(+09:00) or null
  has_time?: boolean;
}

// ============================================================
// 冪等テーブル作成(scheduling方式)
// FK順: memo_goals / memo_categories → memos → memo_todos
// ============================================================
export async function ensureMemoTables(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS memo_goals (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner       text NOT NULL,
    title       text NOT NULL,
    domain      text,
    detail      text,
    created_at  timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_goals_owner ON memo_goals(owner)`;

  await sql`CREATE TABLE IF NOT EXISTS memo_categories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner      text NOT NULL,
    name       text NOT NULL,
    color      text,
    is_auto    boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_categories_owner ON memo_categories(owner)`;

  await sql`CREATE TABLE IF NOT EXISTS memos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner       text NOT NULL,
    raw_text    text NOT NULL,
    status      text NOT NULL DEFAULT 'inbox',
    kind        text,
    category_id uuid REFERENCES memo_categories(id) ON DELETE SET NULL,
    importance  int,
    urgency     int,
    quadrant    int,
    goal_ref    uuid REFERENCES memo_goals(id) ON DELETE SET NULL,
    ai_summary  text,
    ai_reason   text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    triaged_at  timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memos_owner ON memos(owner, status, quadrant)`;

  await sql`CREATE TABLE IF NOT EXISTS memo_todos (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    memo_id    uuid NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
    owner      text NOT NULL,
    title      text NOT NULL,
    done       boolean NOT NULL DEFAULT false,
    sort_order int NOT NULL DEFAULT 0,
    due_date   date,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_todos_memo ON memo_todos(memo_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_todos_owner ON memo_todos(owner)`;

  // Phase2: TODOに象限引き継ぎ・実行予定日を追加(冪等)
  await sql`ALTER TABLE memo_todos ADD COLUMN IF NOT EXISTS scheduled_date date`;
  await sql`ALTER TABLE memo_todos ADD COLUMN IF NOT EXISTS quadrant int`;

  // 115: AIによる日時抽出。時刻つき絶対日時を保持(has_time=false は終日扱い)。
  //   既存の due_date(date)/scheduled_date(date) と整合させ、due_at があれば日付部分を due_date にも反映。
  await sql`ALTER TABLE memos ADD COLUMN IF NOT EXISTS due_at timestamptz`;
  await sql`ALTER TABLE memos ADD COLUMN IF NOT EXISTS has_time boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE memo_todos ADD COLUMN IF NOT EXISTS due_at timestamptz`;
  await sql`ALTER TABLE memo_todos ADD COLUMN IF NOT EXISTS has_time boolean NOT NULL DEFAULT false`;

  // 122: 完了フォルダ。完了印の時刻を保持(完了日順の一覧・元に戻す/削除用)。
  //   完了状態は既存の status='done'(memos) / done=true(memo_todos) を活用し、
  //   チェック時に completed_at=now() をセット、未完了化で NULL に戻す(冪等ALTER)。
  await sql`ALTER TABLE memos ADD COLUMN IF NOT EXISTS completed_at timestamptz`;
  await sql`ALTER TABLE memo_todos ADD COLUMN IF NOT EXISTS completed_at timestamptz`;

  // 126: 象限の人手修正ロック。D&D/セレクトで象限を手修正したら true にし、
  //   再triageでAIに上書きさせない(human-in-the-loop / 手修正が消える事故を防ぐ)。
  await sql`ALTER TABLE memos ADD COLUMN IF NOT EXISTS quadrant_locked boolean NOT NULL DEFAULT false`;

  // 122: 期限アラートの二重送信防止。due_at の 7d/3d/1d 閾値ごとに1回だけ送る記録。
  //   UNIQUE(memo_id, threshold) で同一閾値の重複通知を防ぐ。
  await sql`CREATE TABLE IF NOT EXISTS memo_alerts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner      text NOT NULL,
    memo_id    uuid NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
    threshold  text NOT NULL,
    sent_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE(memo_id, threshold)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_alerts_owner ON memo_alerts(owner)`;

  // 127: 週次Q2レビューで「今週フォーカスに選んだメモ」を記録(任意・件数表示/可視化用)。
  //   week は週初(月曜)の 'YYYY-MM-DD'。同一週・同一メモの重複は UNIQUE で防止。
  await sql`CREATE TABLE IF NOT EXISTS memo_focus_picks (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner      text NOT NULL,
    memo_id    uuid NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
    week       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner, memo_id, week)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memo_focus_picks_owner_week ON memo_focus_picks(owner, week)`;
}

// ============================================================
// triage
// ============================================================
function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

// 象限しきい値・ルブリック・少数事例・プロンプト組み立ては
// src/lib/memo-triage-config.ts に集約(以後のチューニングはそちらで完結)。

export interface TriagePersisted {
  memo: Memo;
  category_id: string | null;
  todos_created: number;
  fallback: boolean;
}

/**
 * 1件のメモを triage して memos / memo_categories / memo_todos に保存。
 * GEMINI未設定・AI失敗時は status=inbox のまま暫定値を保存し、後追いtriage可能にする。
 */
export async function triageMemo(
  sql: Sql,
  owner: string,
  memo: { id: string; raw_text: string },
): Promise<TriagePersisted> {
  const goals = (await sql`SELECT id, owner, title, domain, detail, created_at FROM memo_goals WHERE owner = ${owner} ORDER BY created_at`) as unknown as MemoGoal[];
  const cats = (await sql`SELECT id, name FROM memo_categories WHERE owner = ${owner}`) as unknown as { id: string; name: string }[];

  // 126: このメモ自身の象限ロック状態(再triageで象限を保護する判定に使用)。
  const cur = (await sql`SELECT quadrant, quadrant_locked FROM memos WHERE id = ${memo.id} AND owner = ${owner}`) as unknown as { quadrant: number | null; quadrant_locked: boolean }[];
  const isLocked = Boolean(cur[0]?.quadrant_locked);
  const lockedQuadrant = cur[0]?.quadrant ?? null;

  // 126: このユーザーが手修正した象限の直近例を動的few-shotとして注入(件数上限はconfig側)。
  const corrRows = (await sql`
    SELECT raw_text, quadrant FROM memos
    WHERE owner = ${owner} AND quadrant_locked = true AND quadrant IS NOT NULL
    ORDER BY triaged_at DESC NULLS LAST, created_at DESC
    LIMIT 5
  `) as unknown as { raw_text: string; quadrant: number }[];
  const corrections = corrRows
    .filter((r) => r.raw_text !== memo.raw_text) // 自分自身は除外
    .map((r) => ({ rawText: r.raw_text, quadrant: r.quadrant as 1 | 2 | 3 | 4 }));

  // 象限の判断基準(編集可能ナレッジ)を“上乗せ”材料としてプロンプトに注入。
  // 0件・取得失敗でも従来通り動く(非回帰)よう、失敗は握りつぶして注入を省略。
  let criteriaBlock = '';
  try {
    await ensureQuadrantCriteria(sql);
    criteriaBlock = formatCriteriaForPrompt(await listEnabledCriteria(sql, owner));
  } catch (e) {
    console.error('[triage] quadrant_criteria load failed (continuing without):', e);
  }

  const prompt = buildTriagePrompt(memo.raw_text, goals, cats.map((c) => c.name), nowJstText(), corrections, criteriaBlock);

  let parsed: TriageRaw | null = null;
  let fallback = false;
  try {
    // responseMimeType:'application/json' で本文をJSONに固定。
    // Gemini 3.x は思考が既定ONでトークンを消費し、枠が小さいとJSONが途中で切れて
    // importance/goal_ref が欠落→FIELD_DEFAULT(3)・目標未設定に落ちる症状が出るため、
    // JSON固定 + 枠を 4096 に拡張して欠落を防ぐ(判定方針自体は不変)。
    // 178以降は generateWithModel 既定の thinkingLevel:low も効くためさらに安全側。
    const raw = await generateWithModel('gemini', prompt, undefined, 4096, { responseMimeType: 'application/json' });
    parsed = robustJsonParse<TriageRaw>(raw);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    fallback = true;
    parsed = {
      kind: 'note',
      category: '未分類',
      is_new_category: true,
      importance: TRIAGE_FAIL_FALLBACK.importance,
      urgency: TRIAGE_FAIL_FALLBACK.urgency,
      quadrant: 2,
      goal_ref: '',
      summary: memo.raw_text.slice(0, 40),
      reason: 'AI判定に失敗したため暫定値です。再整理してください。',
      todos: [],
    };
  }

  const importance = clamp(parsed.importance, 1, 5, FIELD_DEFAULT.importance);
  const urgency = clamp(parsed.urgency, 1, 5, FIELD_DEFAULT.urgency);
  // 126: 人手ロック済みなら象限はユーザー値を維持(AIに上書きさせない)。未ロックはAI判定。
  const quadrant = (isLocked && lockedQuadrant) ? (lockedQuadrant as QuadrantNum) : deriveQuadrant(importance, urgency);
  const kind: MemoKind = (['task', 'idea', 'note', 'reference'] as const).includes(parsed.kind) ? parsed.kind : 'note';

  // AI抽出の日時(任意)。解析できれば絶対ISO+JST日付に正規化。時刻はAIのhas_timeに従う。
  const due = parseDueAt(parsed.due_at);
  const hasTime = due.dueAtIso ? Boolean(parsed.has_time) : false;

  // カテゴリ解決(既存に寄せる / 新規なら作成)
  let categoryId: string | null = null;
  const catName = (parsed.category || '').trim();
  if (catName) {
    const found = cats.find((c) => c.name === catName);
    if (found) {
      categoryId = found.id;
    } else {
      const ins = (await sql`INSERT INTO memo_categories (owner, name, is_auto) VALUES (${owner}, ${catName}, true) RETURNING id`) as unknown as { id: string }[];
      categoryId = ins[0]?.id ?? null;
    }
  }

  // goal_ref(title)→ goal id 解決
  let goalId: string | null = null;
  const goalTitle = (parsed.goal_ref || '').trim();
  if (goalTitle) {
    goalId = goals.find((g) => g.title === goalTitle)?.id ?? null;
  }

  const newStatus: MemoStatus = fallback ? 'inbox' : 'triaged';
  const triagedAt = fallback ? null : new Date().toISOString();

  const updated = (await sql`
    UPDATE memos SET
      status = ${newStatus},
      kind = ${kind},
      category_id = ${categoryId},
      importance = ${importance},
      urgency = ${urgency},
      quadrant = ${quadrant},
      goal_ref = ${goalId},
      ai_summary = ${parsed.summary || null},
      ai_reason = ${parsed.reason || null},
      due_at = ${due.dueAtIso},
      has_time = ${hasTime},
      triaged_at = ${triagedAt}
    WHERE id = ${memo.id} AND owner = ${owner}
    RETURNING *
  `) as unknown as Memo[];

  // todos 生成(task のときのみ)。既存は付け替え。
  let todosCreated = 0;
  if (kind === 'task' && Array.isArray(parsed.todos) && parsed.todos.length > 0) {
    await sql`DELETE FROM memo_todos WHERE memo_id = ${memo.id} AND owner = ${owner}`;
    const items = parsed.todos.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8);
    for (let i = 0; i < items.length; i++) {
      // 由来メモの象限をTODOへ引き継ぎ(横断ビューの象限優先ソート用)。
      // メモに日時があれば各ステップにも締切として反映(due_at/due_date/has_time)。カレンダー/計画に時刻つきで出る。
      await sql`INSERT INTO memo_todos (memo_id, owner, title, sort_order, quadrant, due_at, due_date, has_time)
        VALUES (${memo.id}, ${owner}, ${items[i].trim()}, ${i}, ${quadrant}, ${due.dueAtIso}, ${due.dueDate}, ${hasTime})`;
    }
    todosCreated = items.length;
  }

  return { memo: updated[0], category_id: categoryId, todos_created: todosCreated, fallback };
}
