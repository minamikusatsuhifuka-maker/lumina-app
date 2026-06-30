import { neon } from '@neondatabase/serverless';
import type { PlacesData } from '@/lib/places-reviews';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GBP最適化チェッカー（147A）共通ロジック
// - Places API（既存 fetchPlacesData）で取れる基礎情報を「自動診断」
// - APIで取れない項目（写真/カテゴリ/属性/説明文/投稿頻度/返信率）は「手入力チェック」
// - しきい値は編集可（owner ごとに gbp_settings に保存）、未保存は DEFAULT_THRESHOLDS
// マイグレーションフレームワーク無し方針：CREATE TABLE/INDEX IF NOT EXISTS で冪等運用。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Sql = ReturnType<typeof neon<false, false>>;

// 編集可能なしきい値（合否判定の基準値）
export interface GbpThresholds {
  minReviews: number; // 口コミ件数の目標
  minRating: number; // 星平均の目標
  reviewFreshnessDays: number; // 直近口コミの鮮度（日以内に新着）
  minPhotos: number; // 写真枚数の目標（手入力で確認）
  postFreshnessDays: number; // 投稿頻度（日以内に投稿）（手入力で確認）
  minReplyRate: number; // 口コミ返信率（%）（手入力で確認）
}

export const DEFAULT_THRESHOLDS: GbpThresholds = {
  minReviews: 30,
  minRating: 4.0,
  reviewFreshnessDays: 30,
  minPhotos: 20,
  postFreshnessDays: 30,
  minReplyRate: 80,
};

// しきい値の正規化（不正値・欠損を既定で埋める。フロントからの保存時に使用）
export function normalizeThresholds(input: unknown): GbpThresholds {
  const o = (input ?? {}) as Partial<Record<keyof GbpThresholds, unknown>>;
  const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    minReviews: num(o.minReviews, DEFAULT_THRESHOLDS.minReviews),
    minRating: num(o.minRating, DEFAULT_THRESHOLDS.minRating),
    reviewFreshnessDays: num(o.reviewFreshnessDays, DEFAULT_THRESHOLDS.reviewFreshnessDays),
    minPhotos: num(o.minPhotos, DEFAULT_THRESHOLDS.minPhotos),
    postFreshnessDays: num(o.postFreshnessDays, DEFAULT_THRESHOLDS.postFreshnessDays),
    minReplyRate: num(o.minReplyRate, DEFAULT_THRESHOLDS.minReplyRate),
  };
}

// 診断項目1件
export interface AuditItem {
  key: string;
  label: string;
  category: string; // 表示用カテゴリ（基本情報/口コミ/写真 等）
  group: 'auto' | 'manual';
  status: 'pass' | 'warn' | 'fail' | 'todo' | 'na' | 'done';
  detail: string; // 現状値・取得値の説明
  advice: string; // 改善提案テンプレ
}

// 手入力チェック項目の定義（API で取得できない／OAuth が要る項目）
export interface ManualItemDef {
  key: string;
  label: string;
  category: string;
  hint: string; // 何を確認するか
  advice: string; // 改善提案テンプレ
}

export const MANUAL_ITEMS: ManualItemDef[] = [
  {
    key: 'photos',
    label: '写真の充実度',
    category: '写真',
    hint: '外観・院内・スタッフ・施術風景などの写真が十分か（GBP管理画面で枚数確認）',
    advice: '院内・受付・施術風景などの写真を追加し、定期的に更新しましょう。',
  },
  {
    key: 'category',
    label: 'カテゴリ設定',
    category: '基本情報',
    hint: 'メインカテゴリ「皮膚科」＋関連サブカテゴリが適切に設定されているか',
    advice: '主要な診療・施術に合うメイン/サブカテゴリを設定しましょう。',
  },
  {
    key: 'attributes',
    label: '属性（駐車場/バリアフリー/予約/支払い）',
    category: '基本情報',
    hint: '駐車場・バリアフリー・予約方法・支払い方法などの属性が網羅されているか',
    advice: '該当する属性をすべて登録し、来院前の不安を減らしましょう。',
  },
  {
    key: 'description',
    label: 'ビジネス説明文',
    category: '基本情報',
    hint: '説明文が十分な情報量で、医療広告ガイドラインに適合しているか',
    advice: '診療方針・対応症状を簡潔に記載（効果保証・誇大表現は避ける）。',
  },
  {
    key: 'post_frequency',
    label: '投稿頻度',
    category: '投稿',
    hint: '最新情報の投稿が直近で行われているか（GBP投稿）',
    advice: '「② GBP投稿下書き」で休診・季節注意喚起などを定期投稿しましょう。',
  },
  {
    key: 'reply_rate',
    label: '口コミ返信率',
    category: '口コミ',
    hint: '寄せられた口コミに十分返信できているか',
    advice: '「口コミ管理」の返信AIで未返信の口コミに丁寧に対応しましょう。',
  },
];

// PlacesData から自動診断項目を算出
export function evaluateAutoItems(data: PlacesData, t: GbpThresholds): AuditItem[] {
  const items: AuditItem[] = [];

  // 基本情報（NAP＋website）の登録
  const napOk = !!(data.name && data.address && data.phone);
  items.push({
    key: 'nap',
    label: '基本情報（名称・住所・電話）',
    category: '基本情報',
    group: 'auto',
    status: napOk && data.website ? 'pass' : napOk ? 'warn' : 'fail',
    detail: `名称:${data.name ? '◯' : '✕'} 住所:${data.address ? '◯' : '✕'} 電話:${data.phone ? '◯' : '✕'} サイト:${data.website ? '◯' : '✕'}`,
    advice: 'ホームページ（HP）の表記と完全に一致させ、NAP情報を統一しましょう。',
  });

  // 営業時間（weekday_text が7日分そろっているか）
  const days = data.openingHours?.length ?? 0;
  items.push({
    key: 'hours',
    label: '営業時間の登録',
    category: '基本情報',
    group: 'auto',
    status: days >= 7 ? 'pass' : days > 0 ? 'warn' : 'fail',
    detail: days > 0 ? `${days}日分を登録済み` : '未登録',
    advice: '通常営業時間に加え、祝日・臨時休診も随時更新しましょう。',
  });

  // 口コミ件数
  const total = data.totalReviews ?? 0;
  items.push({
    key: 'review_count',
    label: '口コミ件数',
    category: '口コミ',
    group: 'auto',
    status: total >= t.minReviews ? 'pass' : total >= t.minReviews / 2 ? 'warn' : 'fail',
    detail: `${total}件（目標 ${t.minReviews}件）`,
    advice: '来院時に口コミ投稿のお願い導線（QR・声かけ）を整えましょう。',
  });

  // 星平均
  const rating = data.rating ?? 0;
  items.push({
    key: 'rating',
    label: '星評価の平均',
    category: '口コミ',
    group: 'auto',
    status: rating >= t.minRating ? 'pass' : rating >= t.minRating - 0.5 ? 'warn' : 'fail',
    detail: `${rating.toFixed(1)}（目標 ${t.minRating.toFixed(1)}）`,
    advice: '低評価には口コミ管理の返信AIで誠実に対応し、改善姿勢を示しましょう。',
  });

  // 直近口コミの鮮度（取得した口コミの最新 time から日数を算出）
  const newest = (data.reviews ?? []).reduce((m, r) => (r.time > m ? r.time : m), 0);
  let freshness: AuditItem['status'] = 'warn';
  let freshnessDetail = '取得した口コミに日時情報がありません';
  if (newest > 0) {
    const days = Math.floor((Date.now() / 1000 - newest) / 86400);
    freshnessDetail = `最新の口コミは約${days}日前`;
    freshness = days <= t.reviewFreshnessDays ? 'pass' : days <= t.reviewFreshnessDays * 2 ? 'warn' : 'fail';
  }
  items.push({
    key: 'review_freshness',
    label: '直近の口コミ鮮度',
    category: '口コミ',
    group: 'auto',
    status: freshness,
    detail: freshnessDetail,
    advice: `直近${t.reviewFreshnessDays}日以内に新しい口コミが入る状態を保ちましょう。`,
  });

  return items;
}

// 手入力チェックの保存状態をマージして AuditItem 化
export function buildManualItems(
  saved: Record<string, { status?: string; note?: string }>,
): AuditItem[] {
  return MANUAL_ITEMS.map((def) => {
    const s = saved[def.key];
    const status = (s?.status as AuditItem['status']) || 'todo';
    const note = s?.note ? `（メモ: ${s.note}）` : '';
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      group: 'manual' as const,
      status: ['done', 'todo', 'na'].includes(status) ? status : 'todo',
      detail: def.hint + note,
      advice: def.advice,
    };
  });
}

// スコア算出：pass/done を満点、warn を半分、na は分母から除外、fail/todo は0点
export interface AuditScore {
  total: number; // 0-100
  passed: number;
  counted: number;
}

export function computeScore(items: AuditItem[]): AuditScore {
  let earned = 0;
  let counted = 0;
  let passed = 0;
  for (const it of items) {
    if (it.status === 'na') continue;
    counted += 1;
    if (it.status === 'pass' || it.status === 'done') {
      earned += 1;
      passed += 1;
    } else if (it.status === 'warn') {
      earned += 0.5;
    }
  }
  const total = counted === 0 ? 0 : Math.round((earned / counted) * 100);
  return { total, passed, counted };
}

// やることリスト（未達項目を優先度付きで抽出）
export interface TodoEntry {
  label: string;
  advice: string;
  priority: 'high' | 'medium';
}

export function buildTodos(items: AuditItem[]): TodoEntry[] {
  const todos: TodoEntry[] = [];
  for (const it of items) {
    if (it.status === 'fail' || it.status === 'todo') {
      todos.push({ label: it.label, advice: it.advice, priority: 'high' });
    } else if (it.status === 'warn') {
      todos.push({ label: it.label, advice: it.advice, priority: 'medium' });
    }
  }
  // high を先頭に
  return todos.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

// MEO 関連スキーマ（チェックリスト・しきい値設定・投稿下書き履歴）を冪等に用意
export async function ensureGbpSchema(sql: Sql): Promise<void> {
  // 手入力チェックの状態（owner×item_key で一意）
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_checklist (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      item_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner, item_key)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_checklist_owner ON gbp_checklist(owner)`;

  // 編集したしきい値（owner ごと）
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_settings (
      owner TEXT PRIMARY KEY,
      thresholds JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // 投稿下書き履歴（147B。自動投稿はしない＝下書きの保存・履歴のみ）
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_post_drafts (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      theme TEXT,
      body TEXT NOT NULL,
      ad_check JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_post_drafts_owner ON gbp_post_drafts(owner)`;

  // 投稿テーマ（147B。初期セットを投入しつつ、院長が追加・編集・削除できる＝ハードコードにしない）
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_post_themes (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_post_themes_owner ON gbp_post_themes(owner)`;
}

// 投稿テーマの初期セット（皮膚科・季節性。owner が一件も持たない場合のみ投入）
export const DEFAULT_POST_THEMES: { label: string; description: string }[] = [
  { label: '花粉皮膚炎の注意喚起', description: '春先の花粉による肌のかゆみ・赤み（花粉皮膚炎）の予防と、症状が出たときの受診の呼びかけ' },
  { label: '紫外線・日焼け対策', description: '紫外線が強まる時期の日焼け止め・UVケアの大切さと、シミ・肌トラブルの予防の呼びかけ' },
  { label: '乾燥・冬の保湿ケア', description: '空気が乾燥する季節の保湿ケアの大切さと、乾燥による肌荒れ・かゆみの予防' },
  { label: '汗・あせもの予防', description: '夏場の発汗による あせも・汗トラブルの予防と、悪化したときの受診の呼びかけ' },
  { label: 'ニキビ治療のご案内', description: 'ニキビ・ニキビ跡で悩む方への、皮膚科での相談・治療のご案内（効果の保証はしない）' },
  { label: 'シミ・肝斑のご相談', description: 'シミ・肝斑が気になる方への、皮膚科での相談のご案内（効果の保証・誇大表現はしない）' },
  { label: 'ほくろ・できものの診察', description: 'ほくろ・できもの・気になる できものの診察についてのご案内' },
  { label: '小児皮膚科のご案内', description: 'お子さまの皮膚トラブル（湿疹・とびひ・あせも等）に対応する小児皮膚科のご案内' },
  { label: '休診・診療時間のお知らせ', description: '休診日・診療時間の変更・臨時休診などのお知らせ（具体的な日程は補足情報から反映）' },
  { label: '予約・Web問診のご案内', description: '予約方法・Web問診・待ち時間軽減の取り組みなど、来院をスムーズにする案内' },
];

export interface PostTheme {
  id: number;
  label: string;
  description: string | null;
  sort_order: number;
}

// owner がテーマ未登録なら初期セットを投入し、テーマ一覧を返す
export async function loadOrSeedThemes(sql: Sql, owner: string): Promise<PostTheme[]> {
  const existing = await sql`
    SELECT id, label, description, sort_order FROM gbp_post_themes
    WHERE owner = ${owner} ORDER BY sort_order ASC, id ASC
  `;
  if (existing.length > 0) return existing as PostTheme[];

  // 初期セット投入（番号順）
  for (let i = 0; i < DEFAULT_POST_THEMES.length; i++) {
    const t = DEFAULT_POST_THEMES[i];
    await sql`
      INSERT INTO gbp_post_themes (owner, label, description, sort_order)
      VALUES (${owner}, ${t.label}, ${t.description}, ${i})
    `;
  }
  const seeded = await sql`
    SELECT id, label, description, sort_order FROM gbp_post_themes
    WHERE owner = ${owner} ORDER BY sort_order ASC, id ASC
  `;
  return seeded as PostTheme[];
}

// owner のしきい値を取得（未設定は既定）
export async function loadThresholds(sql: Sql, owner: string): Promise<GbpThresholds> {
  const rows = await sql`SELECT thresholds FROM gbp_settings WHERE owner = ${owner}`;
  const raw = rows[0]?.thresholds;
  return raw ? normalizeThresholds(raw) : { ...DEFAULT_THRESHOLDS };
}

// owner の手入力チェック状態を取得
export async function loadChecklist(
  sql: Sql,
  owner: string,
): Promise<Record<string, { status?: string; note?: string }>> {
  const rows = await sql`SELECT item_key, status, note FROM gbp_checklist WHERE owner = ${owner}`;
  const map: Record<string, { status?: string; note?: string }> = {};
  for (const r of rows as Array<{ item_key: string; status: string; note: string | null }>) {
    map[r.item_key] = { status: r.status, note: r.note ?? undefined };
  }
  return map;
}
