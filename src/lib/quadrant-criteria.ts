// 象限別「判断基準」ナレッジ(編集可能)のDB層 + AI分類プロンプト注入用フォーマッタ。
// xLUMINA(Neon)。memo-db.ts / scheduling.ts と同様に ensureTable()(CREATE/ALTER/INDEX IF NOT EXISTS)で冪等。
// owner はセッション由来(IDOR防止・per-account 分離)。AIは提案、確定は人(human-in-the-loop)。
// 設計: 各象限の「一般的な判断基準」を保持し、AI分類のたびにプロンプトへ注入する“上乗せ”材料。
//        既存の重要度=目標逆算 / 緊急度=期限 は変更しない(置換でなく加味)。
// is_default: seed由来の既定行を示す。ユーザーが追加/編集した行(is_default=false)は「再読込(置換)」で保護する。

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
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

type DefaultItem = { quadrant: Quadrant; title: string; body: string };

// 旧・汎用デフォルト(初版 seed)。移行マーク(is_default=true)用に title+body の署名として保持。
// owner がこの文字列のまま持っている行＝「あなたが入れた既定」なので置換対象、編集済みは署名不一致で保護される。
const LEGACY_DEFAULTS: DefaultItem[] = [
  { quadrant: 'q1', title: '第1象限の目安', body: '期限が迫り、放置すると損失・トラブル・安全/法令/患者対応に直結するもの。即着手。' },
  { quadrant: 'q2', title: '第2象限の目安', body: '目標達成に効く準備・仕組み化・教育・予防・改善。期限は緩いが価値が大きい(最優先で時間確保=代価の先払い)。' },
  { quadrant: 'q3', title: '第3象限の目安', body: '締切はあるが成果への寄与が小さい。委譲・定型化・断る候補。' },
  { quadrant: 'q4', title: '第4象限の目安', body: '価値が薄く惰性で続けているもの。停止・削減候補。' },
  { quadrant: 'common', title: '共通の見方', body: '重要度は「7つの分野の目標」との整合で測る。緊急度は「期限の近さ・時間的制約」で測る。' },
];

// クリニック向け(皮膚科＋美容皮膚科・自費診療)の既定土台。院長が後でUIで編集・追加・削除できる前提の一般論。
const CLINIC_DEFAULTS: DefaultItem[] = [
  // q1 — 重要 × 緊急
  { quadrant: 'q1', title: '患者安全・有害事象', body: '施術後の合併症・熱傷・色素異常・感染兆候・アレルギー/アナフィラキシーなど健康被害に直結するもの。最優先で即対応。' },
  { quadrant: 'q1', title: '医療安全・法令リスク', body: '医薬品/医療機器の不具合・回収、自費広告の表現(薬機法・景品表示法)に触れうる事項、個人情報の漏洩。放置で重大化。' },
  { quadrant: 'q1', title: '当日診療の停止要因', body: '電子カルテ・予約システム・レーザー等機器の停止、滅菌不全、必須の消耗品/外用薬/注射薬の枯渇。' },
  { quadrant: 'q1', title: '紛糾しうる患者クレーム', body: '施術結果・料金・予約に関する苦情で、初動が遅れると拡大するもの。' },
  // q2 — 重要 × 非緊急
  { quadrant: 'q2', title: 'スタッフ育成・教育', body: 'カウンセリング/施術トレーニング、グレード別学習、新人教育、理念(A.I.R.)の浸透。' },
  { quadrant: 'q2', title: '標準化・仕組み化', body: '施術プロトコル・同意説明・問診/カウンセリング様式・マニュアル整備、ヒヤリハット予防。' },
  { quadrant: 'q2', title: '自費診療の質と導線', body: '新メニュー/料金設計、カウンセリング品質、満足度・リピート向上、ドクターズコスメ等の事業準備。' },
  { quadrant: 'q2', title: '集患・ブランディング基盤', body: '中長期のマーケ戦略、紹介/口コミの仕組み、SNS/コンテンツの計画的運用。' },
  { quadrant: 'q2', title: '設備・経営の中長期', body: '機器更新計画、採算/財務分析、組織文化づくり。' },
  // q3 — 非重要 × 緊急
  { quadrant: 'q3', title: '定型連絡・案内', body: '予約確認、WEB予約/デジタル診察券の案内、施術空き状況の発信、メール返信、紹介状・書類処理。' },
  { quadrant: 'q3', title: '補充・発注の実務', body: '日用品/医療消耗品/院内販売品の発注、レジロール交換、両替補充。' },
  { quadrant: 'q3', title: 'ルーティン運用', body: '機器の定例メンテ・滅菌・物品補充など、担当者へ委譲して回るもの。' },
  // q4 — 非重要 × 非緊急
  { quadrant: 'q4', title: '形骸化した作業', body: '誰も使わない資料、形だけの報告/会議、過剰な手作業。' },
  { quadrant: 'q4', title: '価値の薄い情報収集', body: '無目的なSNS閲覧、重複した記録、優先度の低い雑タスク。' },
  // common — 共通の測り方
  { quadrant: 'common', title: '重要度の測り方', body: '7つの分野の目標・理念(A.I.R.)・患者安全・自費診療の質と採算に効くほど高い。' },
  { quadrant: 'common', title: '緊急度の測り方', body: '期限の近さと、放置時の悪化速度。患者安全・医療安全・法令は緊急度が跳ね上がる。' },
  { quadrant: 'common', title: '自費診療の勘所', body: '集患・満足度・リピートに効く第2象限(重要×非緊急)を意図的に確保する＝代価の先払い。' },
  { quadrant: 'common', title: '安全・法令の優先', body: '患者安全・医療安全・法令遵守に関わるものは、重要度を常に一段引き上げる。' },
];

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
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  // 既存テーブルへの列追加(冪等)。初版には is_default が無いため。
  await sql`ALTER TABLE quadrant_criteria ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS idx_quadrant_criteria_owner ON quadrant_criteria(owner)`;
}

async function insertDefaults(sql: Sql, owner: string, items: DefaultItem[]): Promise<void> {
  let i = 0;
  for (const d of items) {
    await sql`INSERT INTO quadrant_criteria (owner, quadrant, title, body, sort_order, is_default)
      VALUES (${owner}, ${d.quadrant}, ${d.title}, ${d.body}, ${i}, true)`;
    i += 1;
  }
}

// owner が1件も持たない時だけ、編集可能なクリニック向け既定を投入(per-account・冪等)。
export async function seedDefaultsIfEmpty(sql: Sql, owner: string): Promise<void> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM quadrant_criteria WHERE owner = ${owner}`) as unknown as { n: number }[];
  if ((rows[0]?.n ?? 0) > 0) return;
  await insertDefaults(sql, owner, CLINIC_DEFAULTS);
}

// 旧・汎用デフォルトのまま残っている行(title+body 署名一致)を is_default=true にマーク。編集済み(署名不一致)は触らない。
async function markLegacyDefaults(sql: Sql, owner: string): Promise<void> {
  for (const d of LEGACY_DEFAULTS) {
    await sql`UPDATE quadrant_criteria SET is_default = true
      WHERE owner = ${owner} AND is_default = false AND title = ${d.title} AND body = ${d.body}`;
  }
}

// is_default=true かつ「旧・汎用署名」のままの行が残っているか(=まだクリニック向けに置換していない owner かの判定)。
async function countLegacyDefaultRows(sql: Sql, owner: string): Promise<number> {
  let total = 0;
  for (const d of LEGACY_DEFAULTS) {
    const rows = (await sql`SELECT COUNT(*)::int AS n FROM quadrant_criteria
      WHERE owner = ${owner} AND is_default = true AND title = ${d.title} AND body = ${d.body}`) as unknown as { n: number }[];
    total += rows[0]?.n ?? 0;
  }
  return total;
}

// 既定(is_default=true)を全削除して §3 のクリニック向けを再投入。ユーザー追加/編集分(is_default=false)は保持。
export async function replaceDefaults(sql: Sql, owner: string): Promise<void> {
  await sql`DELETE FROM quadrant_criteria WHERE owner = ${owner} AND is_default = true`;
  await insertDefaults(sql, owner, CLINIC_DEFAULTS);
}

// 一度きりの移行: 旧・汎用既定をマーク→残っていればクリニック向けへ置換。クリニック既定は署名不一致なので二度目以降は no-op(冪等)。
export async function migrateDefaults(sql: Sql, owner: string): Promise<void> {
  await markLegacyDefaults(sql, owner);
  if ((await countLegacyDefaultRows(sql, owner)) > 0) {
    await replaceDefaults(sql, owner);
  }
}

export async function listCriteria(sql: Sql, owner: string): Promise<QuadrantCriterion[]> {
  return (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, is_default, created_at, updated_at
    FROM quadrant_criteria WHERE owner = ${owner}
    ORDER BY quadrant, sort_order, created_at
  `) as unknown as QuadrantCriterion[];
}

export async function listEnabledCriteria(sql: Sql, owner: string): Promise<QuadrantCriterion[]> {
  return (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, is_default, created_at, updated_at
    FROM quadrant_criteria WHERE owner = ${owner} AND enabled = true
    ORDER BY quadrant, sort_order, created_at
  `) as unknown as QuadrantCriterion[];
}

function normQuadrant(q: unknown): Quadrant {
  return QUADRANTS.includes(q as Quadrant) ? (q as Quadrant) : 'common';
}

// ユーザー追加は is_default=false(=再読込の置換から保護)。
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
    INSERT INTO quadrant_criteria (owner, quadrant, title, body, sort_order, is_default)
    VALUES (${owner}, ${quadrant}, ${title}, ${body}, ${sortOrder}, false)
    RETURNING id, owner, quadrant, title, body, enabled, sort_order, is_default, created_at, updated_at
  `) as unknown as QuadrantCriterion[];
  return rows[0];
}

// id は必ず owner スコープで操作(IDOR防止・他人のレコードに触れない)。指定フィールドのみ更新。
// 編集された行は is_default=false にし、以後の「既定の再読込(置換)」から保護する。
export async function updateCriterion(
  sql: Sql,
  owner: string,
  id: string,
  patch: { quadrant?: string; title?: string; body?: string; enabled?: boolean; sort_order?: number },
): Promise<QuadrantCriterion | null> {
  const rows = (await sql`
    SELECT id, owner, quadrant, title, body, enabled, sort_order, is_default, created_at, updated_at
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
    SET quadrant = ${quadrant}, title = ${title}, body = ${body}, enabled = ${enabled}, sort_order = ${sortOrder}, is_default = false, updated_at = now()
    WHERE id = ${id} AND owner = ${owner}
    RETURNING id, owner, quadrant, title, body, enabled, sort_order, is_default, created_at, updated_at
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
