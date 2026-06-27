// 象限別「判断基準」ナレッジ(編集可能)のDB層 + AI分類プロンプト注入用フォーマッタ。
// xLUMINA(Neon)。memo-db.ts / scheduling.ts と同様に ensureTable()(CREATE/INDEX IF NOT EXISTS)で冪等。
// owner はセッション由来(IDOR防止・per-account 分離)。AIは提案、確定は人(human-in-the-loop)。
// 設計: 各象限の「一般的な判断基準」を保持し、AI分類のたびにプロンプトへ注入する“上乗せ”材料。
//        既存の重要度=目標逆算 / 緊急度=期限 は変更しない(置換でなく加味)。

import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon<false, false>>;

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4' | 'common';
export const QUADRANTS: Quadrant[] = ['q1', 'q2', 'q3', 'q4', 'common'];

export interface QuadrantCriterion {
  id: string;
  owner: string;
  quadrant: Quadrant;
  title: string;
  body: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 冪等テーブル作成(手動SQL不要)。q1=重要×緊急 / q2=重要×非緊急 / q3=非重要×緊急 / q4=非重要×非緊急 / common=全象限共通。
export async function ensureQuadrantCriteria(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS quadrant_criteria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner text NOT NULL,
    quadrant text NOT NULL DEFAULT 'common',
    title text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT true,
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_quadrant_criteria_owner ON quadrant_criteria(owner)`;
}

// 初期値(一般論)。院長が後で自由に編集・削除できる前提。
const DEFAULTS: { quadrant: Quadrant; title: string; body: string }[] = [
  { quadrant: 'q1', title: '第1象限の目安', body: '期限が迫り、放置すると損失・トラブル・安全/法令/患者対応に直結するもの。即着手。' },
  { quadrant: 'q2', title: '第2象限の目安', body: '目標達成に効く準備・仕組み化・教育・予防・改善。期限は緩いが価値が大きい(最優先で時間確保=代価の先払い)。' },
  { quadrant: 'q3', title: '第3象限の目安', body: '締切はあるが成果への寄与が小さい。委譲・定型化・断る候補。' },
  { quadrant: 'q4', title: '第4象限の目安', body: '価値が薄く惰性で続けているもの。停止・削減候補。' },
  { quadrant: 'common', title: '共通の見方', body: '重要度は「7つの分野の目標」との整合で測る。緊急度は「期限の近さ・時間的制約」で測る。' },
];

// owner が1件も持たない時だけ、編集可能なデフォルトを投入(per-account・冪等)。
export async function seedDefaultsIfEmpty(sql: Sql, owner: string): Promise<void> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM quadrant_criteria WHERE owner = ${owner}`) as unknown as { n: number }[];
  if ((rows[0]?.n ?? 0) > 0) return;
  let i = 0;
  for (const d of DEFAULTS) {
    await sql`INSERT INTO quadrant_criteria (owner, quadrant, title, body, sort_order)
      VALUES (${owner}, ${d.quadrant}, ${d.title}, ${d.body}, ${i})`;
    i += 1;
  }
}

export async function listCriteria(sql: Sql, owner: string): Promise<QuadrantCriterion[]> {
  return (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, created_at, updated_at
    FROM quadrant_criteria WHERE owner = ${owner}
    ORDER BY quadrant, sort_order, created_at
  `) as unknown as QuadrantCriterion[];
}

export async function listEnabledCriteria(sql: Sql, owner: string): Promise<QuadrantCriterion[]> {
  return (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, created_at, updated_at
    FROM quadrant_criteria WHERE owner = ${owner} AND enabled = true
    ORDER BY quadrant, sort_order, created_at
  `) as unknown as QuadrantCriterion[];
}

function normQuadrant(q: unknown): Quadrant {
  return QUADRANTS.includes(q as Quadrant) ? (q as Quadrant) : 'common';
}

export async function createCriterion(
  sql: Sql,
  owner: string,
  input: { quadrant?: string; title?: string; body?: string; sort_order?: number },
): Promise<QuadrantCriterion> {
  const quadrant = normQuadrant(input.quadrant);
  const title = (input.title ?? '').toString().slice(0, 200);
  const body = (input.body ?? '').toString().slice(0, 2000);
  const sortOrder = Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0;
  const rows = (await sql`
    INSERT INTO quadrant_criteria (owner, quadrant, title, body, sort_order)
    VALUES (${owner}, ${quadrant}, ${title}, ${body}, ${sortOrder})
    RETURNING id, owner, quadrant, title, body, enabled, sort_order, created_at, updated_at
  `) as unknown as QuadrantCriterion[];
  return rows[0];
}

// id は必ず owner スコープで操作(IDOR防止・他人のレコードに触れない)。指定フィールドのみ更新。
export async function updateCriterion(
  sql: Sql,
  owner: string,
  id: string,
  patch: { quadrant?: string; title?: string; body?: string; enabled?: boolean; sort_order?: number },
): Promise<QuadrantCriterion | null> {
  const rows = (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, created_at, updated_at
    FROM quadrant_criteria WHERE id = ${id} AND owner = ${owner}
  `) as unknown as QuadrantCriterion[];
  if (rows.length === 0) return null;
  const cur = rows[0];
  const quadrant = patch.quadrant !== undefined ? normQuadrant(patch.quadrant) : cur.quadrant;
  const title = patch.title !== undefined ? patch.title.toString().slice(0, 200) : cur.title;
  const body = patch.body !== undefined ? patch.body.toString().slice(0, 2000) : cur.body;
  const enabled = patch.enabled !== undefined ? !!patch.enabled : cur.enabled;
  const sortOrder =
    patch.sort_order !== undefined && Number.isFinite(Number(patch.sort_order)) ? Number(patch.sort_order) : cur.sort_order;
  const updated = (await sql`
    UPDATE quadrant_criteria
    SET quadrant = ${quadrant}, title = ${title}, body = ${body}, enabled = ${enabled}, sort_order = ${sortOrder}, updated_at = now()
    WHERE id = ${id} AND owner = ${owner}
    RETURNING id, owner, quadrant, title, body, enabled, sort_order, created_at, updated_at
  `) as unknown as QuadrantCriterion[];
  return updated[0] ?? null;
}

export async function deleteCriterion(sql: Sql, owner: string, id: string): Promise<boolean> {
  const rows = (await sql`DELETE FROM quadrant_criteria WHERE id = ${id} AND owner = ${owner} RETURNING id`) as unknown as {
    id: string;
  }[];
  return rows.length > 0;
}

const QLABEL: Record<Quadrant, string> = {
  q1: '第1象限 重要×緊急',
  q2: '第2象限 重要×非緊急',
  q3: '第3象限 非重要×緊急',
  q4: '第4象限 非重要×非緊急',
  common: '共通',
};

// AI分類プロンプトに差し込む整形文字列。enabled な基準を象限ごとに列挙。0件なら空文字(=注入ブロックを省略=従来通り)。
export function formatCriteriaForPrompt(criteria: QuadrantCriterion[]): string {
  const enabled = criteria.filter((c) => c.enabled && (c.title.trim() || c.body.trim()));
  if (enabled.length === 0) return '';
  const order: Quadrant[] = ['q1', 'q2', 'q3', 'q4', 'common'];
  const blocks: string[] = [];
  for (const q of order) {
    const items = enabled.filter((c) => c.quadrant === q);
    if (items.length === 0) continue;
    const lines = items.map((c) => `・${c.title ? `${c.title}: ` : ''}${c.body}`.trim()).join('\n');
    const note = q === 'q2' ? '   ← 最優先で確保すべき領域' : '';
    blocks.push(`■${QLABEL[q]}:${note}\n${lines}`);
  }
  if (blocks.length === 0) return '';
  return `\n# 象限の判断基準(参考・編集可能。重要度=目標逆算、緊急度=期限 と併用して判定)\n${blocks.join(
    '\n',
  )}\n上記の判断基準も加味して象限を判定してください。ただし最終確定は人が行うため、AIは提案に留めること。\n`;
}
