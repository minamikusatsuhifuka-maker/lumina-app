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

type Sql = ReturnType<typeof neon<false, false>>;

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
  due_date: string | null;
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
}

// ============================================================
// triage
// ============================================================
function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

// 重要度×緊急度から象限を確定(AIのquadrantとズレても理念を担保)
function deriveQuadrant(importance: number, urgency: number): QuadrantNum {
  const important = importance >= 3;
  const urgent = urgency >= 3;
  if (important && urgent) return 1;
  if (important && !urgent) return 2;
  if (!important && urgent) return 3;
  return 4;
}

function buildPrompt(rawText: string, goals: MemoGoal[], categoryNames: string[]): string {
  const goalLines = goals.length
    ? goals.map((g) => `- ${g.title}${g.domain ? `（分野:${g.domain}）` : ''}${g.detail ? ` … ${g.detail}` : ''}`).join('\n')
    : '（目標が未設定です。一般的な重要度で判断してください）';
  const catList = categoryNames.length ? categoryNames.join(' / ') : '（既存カテゴリなし）';

  return `あなたは「7つの習慣」の時間管理マトリックスに基づき、ユーザーのメモを目標から逆算して仕分けるアシスタントです。

# ユーザーの目標(重要度を逆算する基準)
${goalLines}

# 既存カテゴリ(なるべくこの中から選ぶ。合うものが無ければ新規名を提案)
${catList}

# 判定するメモ
"""
${rawText}
"""

# 判定ルール
- importance(1..5) = 上記の目標をどれだけ前進させるか。目標と無関係なら低い。インサイドアウト=ユーザー自身の目標起点で評価。
- urgency(1..5) = 締切・時間感応(「今日」「期限」「すぐ」等の語や日付があれば高い)。
- quadrant: 重要×緊急=1 / 重要×非緊急=2 / 非重要×緊急=3 / 非重要×非緊急=4。
- 第2象限(重要×非緊急)を見逃さないこと。緊急でなくても目標に資するものは必ず Q2 として拾う。
- kind: 行動が必要=task / 着想=idea / 記録=note / 情報源・資料=reference。
- todos: kind=task のときのみ具体的な実行ステップを2〜5個。それ以外は空配列[]。
- goal_ref: 最も寄与する目標の title をそのまま記載(該当なしは空文字)。
- summary: 後で思い出せる一言要約。reason: 重要度/象限の根拠を短く。

以下のJSONのみを返してください(前後に説明文を付けない):
{"kind":"task|idea|note|reference","category":"カテゴリ名","is_new_category":true,"importance":1,"urgency":1,"quadrant":2,"goal_ref":"目標title","summary":"…","reason":"…","todos":["…"]}`;
}

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

  const prompt = buildPrompt(memo.raw_text, goals, cats.map((c) => c.name));

  let parsed: TriageRaw | null = null;
  let fallback = false;
  try {
    const raw = await generateWithModel('gemini', prompt, undefined, 2048);
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
      importance: 3,
      urgency: 1,
      quadrant: 2,
      goal_ref: '',
      summary: memo.raw_text.slice(0, 40),
      reason: 'AI判定に失敗したため暫定値です。再整理してください。',
      todos: [],
    };
  }

  const importance = clamp(parsed.importance, 1, 5, 3);
  const urgency = clamp(parsed.urgency, 1, 5, 1);
  const quadrant = deriveQuadrant(importance, urgency);
  const kind: MemoKind = (['task', 'idea', 'note', 'reference'] as const).includes(parsed.kind) ? parsed.kind : 'note';

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
      await sql`INSERT INTO memo_todos (memo_id, owner, title, sort_order) VALUES (${memo.id}, ${owner}, ${items[i].trim()}, ${i})`;
    }
    todosCreated = items.length;
  }

  return { memo: updated[0], category_id: categoryId, todos_created: todosCreated, fallback };
}
