// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 278: note記事1本 → 型の異なるX投稿を最大5件、時間差で日程に割り当てる（純関数）。
//
// 生成エンジンは新規に書かない: ③X投稿連動の /api/dr-hub/x-post を**型ごとに1リクエスト**呼ぶ。
// ここにあるのは、③の周りに要る判断だけ:
//   §3-2① 類似度（269の3-gram containment を流用）／§3-2③ 同一記事由来は同日に載せない
//   §4-2 型ごとの既定時間帯（Xの時間帯。noteの時間帯とは共有しない＝R-70）
//   §5-2 URLは既定2件（③議論型・④常識破壊型は既定なし）
// すべて決定的に導出する（R-74）。しきい値・件数・間隔は「仮説」なので画面から変えられる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { X_POST_TYPES, POSTING_TIME_GUIDE, type XPostType } from './x-post-rules';
import { candidateSimilarity, CANDIDATE_SIMILARITY_WARN } from './kindle-note-remix';
import { formatDateLocal, parseDateLocal, toWeekday } from './posting-schedule';

// ── 5型（③の定義をそのまま使う。追加・削除・定義変更はしない＝§7）─────────
export const X_FANOUT_TYPES: readonly XPostType[] = ['knowhow', 'story', 'debate', 'insight', 'infographic'];

export function isXPostType(v: unknown): v is XPostType {
  return typeof v === 'string' && v in X_POST_TYPES;
}

/** 既定は全5型（§2-3）。壊れた入力は既定に倒す */
export function normalizeSelectedTypes(v: unknown): XPostType[] {
  const list = Array.isArray(v) ? v.filter(isXPostType) : [];
  const ordered = X_FANOUT_TYPES.filter((t) => list.includes(t)); // 表示順を型の順に固定
  return ordered.length > 0 ? ordered : [...X_FANOUT_TYPES];
}

// ── §4-2 Xの時間帯（noteの NOTE_SLOTS とは別物。R-70）────────────────────
export type XSlot = 'morning' | 'noon' | 'night';

export const X_SLOTS: Record<XSlot, { label: string; time: string; window: string }> = {
  morning: { label: '朝', time: '7:30', window: POSTING_TIME_GUIDE.x.morning },
  noon: { label: '昼', time: '12:30', window: POSTING_TIME_GUIDE.x.noon },
  night: { label: '夜', time: '19:00', window: POSTING_TIME_GUIDE.x.night },
};

/** 型ごとの既定時間帯（X-09）。①②③=夜、④=朝（思考法の時間帯）、⑤=昼（短文・画像） */
export const DEFAULT_TYPE_SLOT: Record<XPostType, XSlot> = {
  knowhow: 'night',
  story: 'night',
  debate: 'night',
  insight: 'morning',
  infographic: 'noon',
};

// ── §5-2 URLの既定 ────────────────────────────────────────────────
/** 既定でURLを付ける件数（仮説。画面から変更できる） */
export const DEFAULT_URL_COUNT = 2;
/** 会話を狙う型はURLなしを既定にする（③議論型・④常識破壊型） */
export const URL_OPT_OUT_TYPES: readonly XPostType[] = ['debate', 'insight'];

/**
 * URLを付ける投稿を決める。候補（URL既定なしの型を除く）から**先頭と最後**を優先し、
 * 件数が多ければ 2番目・最後から2番目… と外側から埋める（同じ記事のリンクを連続させない）。
 */
export function defaultUrlFlags(
  typesInOrder: readonly XPostType[],
  count = DEFAULT_URL_COUNT,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const t of typesInOrder) flags[t] = false;
  const candidates = typesInOrder.filter((t) => !URL_OPT_OUT_TYPES.includes(t));
  const n = Math.max(0, Math.min(count, candidates.length));
  let head = 0;
  let tail = candidates.length - 1;
  for (let i = 0; i < n; i++) {
    const pick = i % 2 === 0 ? candidates[head++] : candidates[tail--];
    flags[pick] = true;
  }
  return flags;
}

// ── §3-2① 類似度（269の判定を流用。しきい値は初期値0.65・調整可）──────────
export const FANOUT_SIMILARITY_DEFAULT = CANDIDATE_SIMILARITY_WARN;
export const FANOUT_SIMILARITY_MIN = 0.3;
export const FANOUT_SIMILARITY_MAX = 0.95;

export interface SimilarPair {
  a: XPostType;
  b: XPostType;
  score: number;
}

export function normalizeThreshold(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return FANOUT_SIMILARITY_DEFAULT;
  return Math.min(FANOUT_SIMILARITY_MAX, Math.max(FANOUT_SIMILARITY_MIN, n));
}

/** 生成済みの投稿どうしで内容が被っている組を返す（表示のみ・自動で消さない＝R-26） */
export function findSimilarPairs(
  posts: readonly { type: XPostType; text: string }[],
  threshold = FANOUT_SIMILARITY_DEFAULT,
): SimilarPair[] {
  const out: SimilarPair[] = [];
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      if (!posts[i].text.trim() || !posts[j].text.trim()) continue;
      const score = candidateSimilarity(posts[i].text, posts[j].text);
      if (score >= threshold) out.push({ a: posts[i].type, b: posts[j].type, score });
    }
  }
  return out;
}

// ── §4 日程の割り当て ───────────────────────────────────────────────
export const DEFAULT_INTERVAL_DAYS = 3; // 5件を2週間程度に分散（§4-1）
export const INTERVAL_DAYS_MIN = 1;
export const INTERVAL_DAYS_MAX = 7;

export function normalizeInterval(v: unknown): number {
  const n = Math.round(typeof v === 'number' ? v : Number(v));
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_DAYS;
  return Math.min(INTERVAL_DAYS_MAX, Math.max(INTERVAL_DAYS_MIN, n));
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export interface FanoutScheduleRow {
  type: XPostType;
  typeLabel: string;
  date: string;
  weekday: (typeof WEEKDAY_JA)[number];
  slot: XSlot;
  time: string;
  withUrl: boolean;
}

/**
 * 選抜した投稿を開始日から intervalDays おきに割り当てる。
 * - 土日は266と同じく次の平日へ送る（toWeekday を共有）
 * - **同一記事由来の投稿が同じ日に入らない**（§3-2③）: 土日送りで前の行と同じ日になったら翌平日へ
 */
export function buildFanoutSchedule(
  items: readonly { type: XPostType; slot?: XSlot; withUrl?: boolean }[],
  startDate: string,
  intervalDays = DEFAULT_INTERVAL_DAYS,
): FanoutScheduleRow[] {
  const start = parseDateLocal(startDate);
  if (!start || items.length === 0) return [];
  const step = normalizeInterval(intervalDays);
  const rows: FanoutScheduleRow[] = [];
  let cursor = toWeekday(start);
  let prevDate = '';
  items.forEach((item, i) => {
    if (i > 0) {
      cursor = toWeekday(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + step));
    }
    // 同日衝突の保険（間隔1日＋土日送りなどで同じ日に寄ったら、必ず次の平日へ）
    while (formatDateLocal(cursor) === prevDate) {
      cursor = toWeekday(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1));
    }
    const slot = item.slot ?? DEFAULT_TYPE_SLOT[item.type];
    const date = formatDateLocal(cursor);
    rows.push({
      type: item.type,
      typeLabel: `${X_POST_TYPES[item.type].emoji} ${X_POST_TYPES[item.type].label}`,
      date,
      weekday: WEEKDAY_JA[cursor.getDay()],
      slot,
      time: X_SLOTS[slot].time,
      withUrl: item.withUrl ?? false,
    });
    prevDate = date;
  });
  return rows;
}

/** 同じ日が2行以上ないか（E2E・単体の判定にも使う） */
export function hasSameDayCollision(rows: readonly { date: string }[]): boolean {
  return new Set(rows.map((r) => r.date)).size !== rows.length;
}

// ── 出力（リッチコピー用。貼り付け先を限定しない表なので共通の copyRichMarkdown で足りる）──
export function fanoutScheduleToMarkdown(
  articleTitle: string,
  rows: readonly FanoutScheduleRow[],
): string {
  if (rows.length === 0) return '';
  const header = '| 投稿日 | 曜日 | 時間帯 | 型 | URL |\n|---|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.date} | ${r.weekday} | ${X_SLOTS[r.slot].label} ${r.time} | ${r.typeLabel} | ${r.withUrl ? '2通目に付ける' : 'なし'} |`)
    .join('\n');
  return `# X投稿の時間差展開: ${articleTitle.replace(/\|/g, '｜')}\n\n${header}\n${body}\n\n- X朝帯 ${POSTING_TIME_GUIDE.x.morning} ／ 昼帯 ${POSTING_TIME_GUIDE.x.noon} ／ 夜帯 ${POSTING_TIME_GUIDE.x.night}（noteの時間帯とは別）\n- URLは本文に入れず、1つ目のリプライに置く（X-03）\n- 投稿はXのアプリから手動で行う（このアプリからの自動投稿はしない）`;
}

// ── 時間の見積もり（R-73）────────────────────────────────────────────
// 生成は③の /api/dr-hub/x-post を型ごとに呼ぶ。ルートは maxDuration 300秒で、
// 内部のAI呼び出しは最大2回（本番1回＋上限超過時の再生成1回）。
// クライアント側は1リクエストをこの秒数で見切り、失敗した型だけを failed にして次へ進む（R-39）。
export const FANOUT_ROUTE_MAX_DURATION_S = 300;
export const FANOUT_REQUEST_TIMEOUT_MS = FANOUT_ROUTE_MAX_DURATION_S * 1000;
