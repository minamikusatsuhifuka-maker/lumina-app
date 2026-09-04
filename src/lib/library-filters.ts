// 293: 📚リサーチ保存と🗂テキスト分析の保存一覧で共有する「検索とフィルタ」の判断（純関数・決定的 R-74）。
//
// 置くもの:
//   §3-1 検索範囲（タイトルのみ／すべて）。既定は「すべて」＝従来の検索対象（現状維持）。画面ごとに保存先キー
//   §2-2 検索語の正規化（小文字化＋NFKC＝全角英数・半角カナの揺れを吸収）と一致判定
//   §4-1 種別フィルタ（📚は成果物の種別 research/summary/detail/advice）と件数（決定的・件＝成果物）
//   §5   AIカテゴリの値（📚は metadata.subCategory・未分類は空）と件数
//   §6   適用中の条件（ラベル＋解除）を組み立てる型と、0件のときの文言
//
// 表示・保存・削除・グルーピング（lib/library-groups.ts）には触れない（§7）。
// 🗂テキスト分析はサーバー側で絞り込む（/api/text-analysis/saves）ため、ここからはクエリ文字列に写すだけ。

import type { LibraryArtifactKind, LibraryCard, LibraryLike } from '@/lib/library-groups';
import { ARTIFACT_LABEL, ARTIFACT_ORDER } from '@/lib/library-groups';

// ───────────────────────────────────────────────────────────────────────────
// §3-1 検索範囲
// ───────────────────────────────────────────────────────────────────────────

export type SearchScope = 'all' | 'title';
export const SEARCH_SCOPES: SearchScope[] = ['all', 'title'];
export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = { all: 'すべて', title: 'タイトルのみ' };
/** 既定は従来どおり「すべて」（現状維持・§3-1） */
export const SEARCH_SCOPE_DEFAULT: SearchScope = 'all';
export const LIBRARY_SEARCH_SCOPE_KEY = 'lumina_library_search_scope';
export const TA_SEARCH_SCOPE_KEY = 'lumina_ta_search_scope';
/** 295: 🧠AI参照素材の検索範囲の保存先（判断・選択肢は📚🗂と共有） */
export const CL_SEARCH_SCOPE_KEY = 'lumina_cl_search_scope';

export function loadSearchScope(key: string): SearchScope {
  try {
    if (typeof window === 'undefined') return SEARCH_SCOPE_DEFAULT;
    const v = window.localStorage.getItem(key);
    return v === 'title' || v === 'all' ? v : SEARCH_SCOPE_DEFAULT;
  } catch {
    return SEARCH_SCOPE_DEFAULT;
  }
}
export function saveSearchScope(scope: SearchScope, key: string): void {
  try {
    window.localStorage.setItem(key, scope);
  } catch {}
}

/**
 * §3-2 検索欄の説明文は「実際に検索している対象」と一致させる（実装していない対象を書かない）。
 * 📚: すべて＝タイトル・本文・タグ（従来どおり）／タイトルのみ。
 * 🗂: すべて＝タイトル・ファイル名・本文（/api/text-analysis/saves の ILIKE 対象）／タイトルのみ（タイトル・ファイル名）。
 */
export const SEARCH_PLACEHOLDER: Record<'library' | 'ta' | 'cl', Record<SearchScope, string>> = {
  library: { all: '🔍 タイトル・本文・タグで検索...', title: '🔍 タイトルで検索（本文・タグは対象外）...' },
  ta: { all: '🔍 タイトル・ファイル名・本文で検索', title: '🔍 タイトル・ファイル名で検索（本文は対象外）' },
  // 295: 🧠AI参照素材。/api/context-saves の ILIKE 対象は topic と context_text（タグは対象外）。従来文言「トピック名・内容」を保つ
  cl: { all: '🔍 トピック名・内容で検索...', title: '🔍 トピック名で検索（内容は対象外）...' },
};

// ───────────────────────────────────────────────────────────────────────────
// §2-2 検索語の正規化と一致
// ───────────────────────────────────────────────────────────────────────────

/** 小文字化＋NFKC（全角英数字・半角カナ・互換文字の揺れを吸収）。決定的 */
export function normalizeSearchText(s: string | null | undefined): string {
  if (!s) return '';
  try {
    return String(s).normalize('NFKC').toLowerCase();
  } catch {
    return String(s).toLowerCase();
  }
}

export type SearchableRow = {
  title?: string | null;
  content?: string | null;
  tags?: string | string[] | null;
};

/**
 * 📚（クライアント側全件保持）の一致判定。空の検索語は常に一致（絞らない）。
 * 'all' の対象はタイトル・本文・タグ＝従来の filterBySearch と同じ範囲（既定＝現状維持）。
 */
export function matchesSearch(row: SearchableRow, q: string, scope: SearchScope): boolean {
  const needle = normalizeSearchText(q).trim();
  if (!needle) return true;
  if (normalizeSearchText(row.title).includes(needle)) return true;
  if (scope === 'title') return false;
  if (normalizeSearchText(row.content).includes(needle)) return true;
  const tags = Array.isArray(row.tags) ? row.tags.join(',') : row.tags;
  return normalizeSearchText(tags).includes(needle);
}

// ───────────────────────────────────────────────────────────────────────────
// §4 種別フィルタ（📚: 成果物の種別）
// ───────────────────────────────────────────────────────────────────────────

export type KindFilter = 'all' | LibraryArtifactKind;
export const KIND_FILTERS: KindFilter[] = ['all', ...ARTIFACT_ORDER];
export const KIND_FILTER_LABEL: Record<KindFilter, string> = { all: 'すべて', ...ARTIFACT_LABEL };

/**
 * 種別ごとの件数（件＝成果物＝行。カード枚数ではない・§4-3）。
 * 入力は「他の条件を通った行」。同じ入力なら同じ数（Map の挿入順も ARTIFACT_ORDER で固定）。
 */
export function kindCounts<T extends LibraryLike>(
  rows: T[],
  kindOf: (row: T) => LibraryArtifactKind,
): Record<LibraryArtifactKind, number> {
  const out: Record<LibraryArtifactKind, number> = { research: 0, summary: 0, detail: 0, advice: 0 };
  for (const r of rows) out[kindOf(r)] += 1;
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 AIカテゴリ（📚: metadata.subCategory・自由文だが保存済みの値から選ぶ。未分類＝空）
// ───────────────────────────────────────────────────────────────────────────

/** 未分類を表す予約値（UIの選択値。保存データには存在しない） */
export const UNCATEGORIZED = '__uncategorized__';
export const UNCATEGORIZED_LABEL = '未分類';

/** metadata（TEXT/JSON どちらでも）から subCategory を取り出す。無ければ '' */
export function subCategoryOf(metadata: unknown): string {
  let m: unknown = metadata;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return '';
    }
  }
  if (!m || typeof m !== 'object') return '';
  const v = (m as Record<string, unknown>).subCategory;
  return typeof v === 'string' ? v.trim() : '';
}

/** 行の AIカテゴリが選択値と一致するか（UNCATEGORIZED は空のもの） */
export function matchesCategory(rowCategory: string, selected: string | null): boolean {
  if (selected === null) return true;
  if (selected === UNCATEGORIZED) return rowCategory === '';
  return rowCategory === selected;
}

export type CategoryCount = { value: string; label: string; count: number };

/**
 * AIカテゴリごとの件数（件＝行）。並びは件数の多い順→名前順（決定的）。未分類は末尾に固定で必ず出す（0件でも）。
 * 上限を超える種類は末尾を落とし、落とした種類数を overflow で返す（一覧が長くなりすぎるのを防ぐ）。
 */
export function categoryCounts(categories: string[], max = 40): { items: CategoryCount[]; overflow: number } {
  const counts = new Map<string, number>();
  let uncategorized = 0;
  for (const c of categories) {
    if (!c) {
      uncategorized += 1;
      continue;
    }
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([value, count]) => ({ value, label: value, count }));
  const overflow = Math.max(0, sorted.length - max);
  const items = sorted.slice(0, max);
  items.push({ value: UNCATEGORIZED, label: UNCATEGORIZED_LABEL, count: uncategorized });
  return { items, overflow };
}

// ───────────────────────────────────────────────────────────────────────────
// §6 適用中の条件
// ───────────────────────────────────────────────────────────────────────────

/** 1条件＝ラベル＋個別解除。表示は ActiveConditionChips（192のタグ条件チップと同じ形） */
export type ActiveCondition = { key: string; label: string; onRemove: () => void };

/** 0件のときの文言（「条件に一致するものがありません」だけで終わらせない・§6-2） */
export function zeroResultMessage(conditionCount: number): string {
  if (conditionCount <= 0) return '条件に一致するものがありません';
  return `条件に一致するものがありません。${conditionCount}件の条件が絞りすぎている可能性があります——上の ✕ で条件を外すか「すべて解除」を押してください`;
}

/** 📚のカード表示: 種別で絞ったときも「1件でもヒットすればカードを出し、ヒットした成果物に印」（283 §4-5 に揃える） */
export function cardHasMatch<T extends LibraryLike>(card: LibraryCard<T>, matchedIds: Set<string>): boolean {
  return card.artifacts.some((a) => matchedIds.has(String(a.item.id)));
}
