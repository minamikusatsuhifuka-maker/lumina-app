// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 303: サイドバーのメニュー検索（A）・追加順表示（B）・新着の印（B §4-3）の判断（DB 非依存・純関数・R-108）
//
// - 検索は名前の部分一致だけ（AI・曖昧一致・履歴なし・決定的・R-74）。一致対象は「表示名」と「元の名前」の両方
//   （🎛で改名した項目が元の名前でも見つかる）。パスは対象外
// - 正規化は normalizeNavQuery 1本: NFKC（全角半角・大文字小文字の統一は lib/library-filters と同じ考え方）＋
//   小文字化＋カタカナ→ひらがな＋空白除去
// - 追加順の正本は nav-items の addedAt（推定しない）。新しい順・同日は定義順
// - 新着の印: 追加から NAV_NEW_DAYS 日以内（JST の日付差・R-86）。14日以内は付き、15日目に消える
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { NavCategory, NavItem } from '@/lib/nav-items';

/** 並び順の保存先（ホームの並び sidebar_home_items と同じ localStorage） */
export const NAV_ORDER_STORAGE_KEY = 'sidebar_nav_order';
export type NavOrder = 'standard' | 'added';
export const NAV_ORDER_DEFAULT: NavOrder = 'standard';
export function parseNavOrder(raw: string | null | undefined): NavOrder {
  return raw === 'added' ? 'added' : NAV_ORDER_DEFAULT;
}

/** 新着とみなす日数（追加当日を0日目として、この日数以内） */
export const NAV_NEW_DAYS = 14;
/** 新着の印の語（R-57: 12文字以内） */
export const NAV_NEW_LABEL = '新';
/** 検索結果で「ホームから外している（サイドバーに出ていない）」項目に付ける印（R-109: 幅固定） */
export const NAV_HIDDEN_LABEL = '非表示';

/**
 * 検索語・名前の正規化。大文字小文字・全角半角・カタカナ／ひらがなを同一視し、空白を落とす。
 * 例: 'ﾏﾝﾀﾞﾗ' → 'まんだら'、'Ａｉ メモ' → 'aiめも'
 */
export function normalizeNavQuery(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

/** 1項目が検索語に一致するか（表示名 or 元の名前の部分一致）。空の検索語は全件一致 */
export function matchesNavItem(item: Pick<NavItem, 'label'>, displayLabel: string, q: string): boolean {
  const needle = normalizeNavQuery(q);
  if (!needle) return true;
  return normalizeNavQuery(displayLabel).includes(needle) || normalizeNavQuery(item.label).includes(needle);
}

export type NavSearchHit = { item: NavItem; hidden: boolean };

/**
 * カテゴリごとの絞り込み。一致項目のあるカテゴリだけ残す（見出しも一致項目のあるものだけ）。
 * hiddenHrefs＝サイドバーに出ていない項目（ホームから外した定義上のホーム項目）。検索では印付きで出す。
 * 「ホーム」は実並び（homeHrefs）で置き換える＝表示と同じ景色で絞る。
 */
export function filterNavCategories(
  categories: readonly NavCategory[],
  q: string,
  labelOf: (item: NavItem) => string,
  homeHrefs: readonly string[],
  itemByHref: ReadonlyMap<string, NavItem>,
): { category: string; hits: NavSearchHit[] }[] {
  const out: { category: string; hits: NavSearchHit[] }[] = [];
  for (const cat of categories) {
    let hits: NavSearchHit[];
    if (cat.category === 'ホーム') {
      const shown = homeHrefs.map((h) => itemByHref.get(h)).filter((x): x is NavItem => !!x);
      const hidden = cat.items.filter((i) => !homeHrefs.includes(i.href));
      hits = [...shown.map((item) => ({ item, hidden: false })), ...hidden.map((item) => ({ item, hidden: true }))];
    } else {
      hits = cat.items.map((item) => ({ item, hidden: false }));
    }
    hits = hits.filter((h) => matchesNavItem(h.item, labelOf(h.item), q));
    if (hits.length > 0) out.push({ category: cat.category, hits });
  }
  return out;
}

/** 追加順（新しい順）。同日は定義順（ALL_NAV_ITEMS の順＝安定）。入力配列は変えない */
export function sortByAddedDesc(items: readonly NavItem[]): NavItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.addedAt < b.item.addedAt ? 1 : a.item.addedAt > b.item.addedAt ? -1 : a.index - b.index))
    .map((x) => x.item);
}

/** 'YYYY-MM-DD' を日数（UTC 日）に。形式が不正なら NaN */
function dayNumber(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return Number.NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** addedAt が実在する日付の 'YYYY-MM-DD' か（U74 で全項目を判定） */
export function isValidAddedAt(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * 新着か。todayYmd は JST の今日（lib/jst.ts の jstDateString）。追加当日=0日、14日目まで true、15日目から false。
 * 未来の日付（時計ずれ）は 0 日扱い＝新着。形式が不正なら false
 */
export function isNewMenu(addedAt: string, todayYmd: string, days: number = NAV_NEW_DAYS): boolean {
  const a = dayNumber(addedAt);
  const t = dayNumber(todayYmd);
  if (Number.isNaN(a) || Number.isNaN(t)) return false;
  const diff = t - a;
  return diff <= days;
}

/** 追加日の短い表記（例: 2026-09-08 → '9/8'）。日付だけの値なので TZ 変換は挟まない */
export function formatAddedShort(addedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(addedAt);
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** ツールチップ用（例: '追加: 2026/9/8'） */
export function formatAddedTitle(addedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(addedAt);
  if (!m) return '';
  return `追加: ${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}
