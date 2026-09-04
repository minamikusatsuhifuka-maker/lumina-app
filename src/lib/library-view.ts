// 291: 📚リサーチ保存の「一覧の見え方」と「選択して比較」の判断を1箇所に集める（表示側のみ・DB無変更）。
//
// ここに置くもの（すべて決定的・R-74。乱数・現在時刻を使わない）:
//   §3-1 一覧の列数（自動／1〜4・タッチ端末は1列固定・Tailwind完全リテラル・R-98 既定は自動）
//   §3-2 表示密度（詳細＝従来／コンパクト＝バッジとタイトルのみ・既定は詳細）
//   §3-3 文字数の段階（閾値はここの CHAR_COUNT_TIERS だけ・同じ文字数は必ず同じ段階）
//   §2-2 比較に出せる件数（BATCH_COMPARE_MAX＝4 を 285/289 と共有・上限超えは無効化して理由を出す）
//   §2-4 比較の列（選択した成果物＝行）に種別ラベルを付ける
//
// グルーピング（lib/library-groups.ts）・保存・削除には触れない（§4-1）。
// 判断はこの純関数に置き、単体テスト（U61）で機械判定する。

import { BATCH_COMPARE_MAX } from '@/lib/batch-compare';
import {
  ARTIFACT_LABEL,
  artifactKindOf,
  type LibraryArtifactKind,
  type LibraryCard,
  type LibraryLike,
} from '@/lib/library-groups';

// ───────────────────────────────────────────────────────────────────────────
// §3-1 一覧の列数
// ───────────────────────────────────────────────────────────────────────────

export type ListColumns = 1 | 2 | 3 | 4;
/** 'auto'（既定）＝従来どおり画面幅で 1〜4 列。1〜4 は院長の指定に従う固定列（289と同じ考え方・R-98） */
export type ListColumnChoice = 'auto' | ListColumns;
export const LIST_COLUMN_CHOICES: ListColumnChoice[] = ['auto', 1, 2, 3, 4];
export const LIST_COLUMN_CHOICE_DEFAULT: ListColumnChoice = 'auto';
export const LIST_COLUMN_KEY = 'lumina_library_cols';

/**
 * 292: 🗂テキスト分析の保存一覧は従来が常に1列（縦積み）なので、既定は 1（現状維持）。
 * 判断関数（resolveListColumns / listGridClass）と選択肢は📚リサーチ保存と同じものを使い、
 * 保存先キーと既定値だけを画面ごとに分ける（同じ列数判定・同じ色分け＝§2-3）。
 */
export const TA_LIST_COLUMN_KEY = 'lumina_ta_cols';
export const TA_LIST_COLUMN_CHOICE_DEFAULT: ListColumnChoice = 1;
export const TA_LIST_DENSITY_KEY = 'lumina_ta_density';

/**
 * 295: 🧠AI参照素材（ContextLibraryPanel）も従来は縦1列固定なので既定は 1（現状維持）。
 * 判断関数・選択肢・文字数の段階（CHAR_COUNT_TIERS）は📚🗂と同じものを使い、保存先キーだけ画面別に分ける。
 */
export const CL_LIST_COLUMN_KEY = 'lumina_cl_cols';
export const CL_LIST_COLUMN_CHOICE_DEFAULT: ListColumnChoice = 1;
export const CL_LIST_DENSITY_KEY = 'lumina_cl_density';

export function loadListColumnChoice(
  key: string = LIST_COLUMN_KEY,
  fallback: ListColumnChoice = LIST_COLUMN_CHOICE_DEFAULT,
): ListColumnChoice {
  try {
    if (typeof window === 'undefined') return fallback;
    const v = window.localStorage.getItem(key);
    if (v === '1' || v === '2' || v === '3' || v === '4') return Number(v) as ListColumns;
    if (v === 'auto') return 'auto';
    return fallback;
  } catch {
    return fallback;
  }
}
export function saveListColumnChoice(choice: ListColumnChoice, key: string = LIST_COLUMN_KEY): void {
  try {
    window.localStorage.setItem(key, String(choice));
  } catch {}
}

/**
 * 実際に使う列指定。タッチ端末（カーソル無し）は常に1列（§3-1・271§4-2と同じ）。
 * カーソルのある端末は指定どおり（'auto' は幅による自動）。
 */
export function resolveListColumns(finePointer: boolean, choice: ListColumnChoice): ListColumnChoice {
  if (!finePointer) return 1;
  return choice;
}

/**
 * 列指定に対応するTailwindクラス（R-17: 完全リテラル。文字列結合しない）。
 * 'auto' は 230【A】から使っている従来のクラスそのもの（既定＝現状維持）。
 * 固定列は幅の段階を持たない（289と同じ。grid-cols-N は minmax(0,1fr) なので横スクロールは出ない）。
 */
export function listGridClass(choice: ListColumnChoice): string {
  if (choice === 1) return 'grid grid-cols-1';
  if (choice === 2) return 'grid grid-cols-2';
  if (choice === 3) return 'grid grid-cols-3';
  if (choice === 4) return 'grid grid-cols-4';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

// ───────────────────────────────────────────────────────────────────────────
// §3-2 表示密度
// ───────────────────────────────────────────────────────────────────────────

/** detail＝従来の表示（成果物タブ・フォルダ・操作ボタン）／compact＝バッジとタイトルのみ */
export type ListDensity = 'detail' | 'compact';
export const LIST_DENSITIES: ListDensity[] = ['detail', 'compact'];
export const LIST_DENSITY_LABEL: Record<ListDensity, string> = { detail: '詳細', compact: 'コンパクト' };
export const LIST_DENSITY_DEFAULT: ListDensity = 'detail';
export const LIST_DENSITY_KEY = 'lumina_library_density';

export function loadListDensity(key: string = LIST_DENSITY_KEY): ListDensity {
  try {
    if (typeof window === 'undefined') return LIST_DENSITY_DEFAULT;
    const v = window.localStorage.getItem(key);
    return v === 'compact' || v === 'detail' ? v : LIST_DENSITY_DEFAULT;
  } catch {
    return LIST_DENSITY_DEFAULT;
  }
}
export function saveListDensity(density: ListDensity, key: string = LIST_DENSITY_KEY): void {
  try {
    window.localStorage.setItem(key, density);
  } catch {}
}

// ───────────────────────────────────────────────────────────────────────────
// §3-3 文字数の段階（濃淡）
// ───────────────────────────────────────────────────────────────────────────

export type CharCountTier = 0 | 1 | 2 | 3;

/**
 * 段階の閾値はここ1箇所。`max` 未満がその段階（昇順・最後は上限なし）。
 * 目安: 要約・X投稿（〜1,000）／短い記事（〜3,000）／通常のDR本文（〜6,000）／長文（6,000〜）。
 * 色だけに意味を持たせない——バッジには必ず数値を併記する（§3-3）。
 */
export const CHAR_COUNT_TIERS: { max: number; label: string }[] = [
  { max: 1000, label: '短め' },
  { max: 3000, label: '標準' },
  { max: 6000, label: '長め' },
  { max: Number.POSITIVE_INFINITY, label: '長文' },
];

/** 文字数 → 段階。同じ文字数なら必ず同じ段階（決定的・R-74）。不正値は最小段階 */
export function charCountTier(n: number): CharCountTier {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  for (let i = 0; i < CHAR_COUNT_TIERS.length; i++) {
    if (v < CHAR_COUNT_TIERS[i].max) return i as CharCountTier;
  }
  return (CHAR_COUNT_TIERS.length - 1) as CharCountTier;
}

/**
 * 段階ごとの濃淡（アクセント #6c63ff の1色相で薄→濃）。R-43: 文字色は背景に対して 4.5:1 以上。
 * 最濃はベタ塗り＋白文字（#5b54d6 と白は約 5.7:1）。他はテーマ変数の上の半透明なので文字はアクセント側。
 */
export const CHAR_COUNT_TIER_STYLE: Record<CharCountTier, { bg: string; color: string; border: string }> = {
  0: { bg: 'rgba(108,99,255,0.06)', color: 'var(--text-muted)', border: '1px solid rgba(108,99,255,0.18)' },
  1: { bg: 'rgba(108,99,255,0.14)', color: '#6c63ff', border: '1px solid rgba(108,99,255,0.28)' },
  2: { bg: 'rgba(108,99,255,0.28)', color: '#5b54d6', border: '1px solid rgba(108,99,255,0.45)' },
  3: { bg: '#5b54d6', color: '#ffffff', border: '1px solid #5b54d6' },
};

/** ツールチップ用「1,234文字（標準）」 */
export function charCountTitle(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return `${v.toLocaleString()}文字（${CHAR_COUNT_TIERS[charCountTier(v)].label}）`;
}

// ───────────────────────────────────────────────────────────────────────────
// §2 選択して比較
// ───────────────────────────────────────────────────────────────────────────

export const LIBRARY_COMPARE_MIN = 2;
export const LIBRARY_COMPARE_MAX = BATCH_COMPARE_MAX;

/**
 * §2-2: 5件目以降を選んでいる状態では比較ボタンを**無効化**する（先頭4件に黙って切らない＝
 * 「選んだのに列が無い」を作らない。Kindle の先頭N件方式は confirm で明示しているので別）。
 * 1件では比較にならないので2件から。
 */
export function libraryCompareState(selectedCount: number): { enabled: boolean; label: string; reason: string | null } {
  if (selectedCount < LIBRARY_COMPARE_MIN) {
    return { enabled: false, label: `⇔ 選択した${selectedCount}件を比較`, reason: `比較は${LIBRARY_COMPARE_MIN}件以上を選んでください` };
  }
  if (selectedCount > LIBRARY_COMPARE_MAX) {
    return {
      enabled: false,
      label: `⇔ 比較（最大${LIBRARY_COMPARE_MAX}件）`,
      reason: `比較できるのは${LIBRARY_COMPARE_MAX}件までです（${selectedCount}件選択中・どれかを外してください）`,
    };
  }
  return { enabled: true, label: `⇔ 選択した${selectedCount}件を比較`, reason: null };
}

/**
 * 比較パネルの1列。種別ラベルは列ヘッダーに出す（§2-4）。
 * 292: kind は画面ごとの体系（📚は本文/要約…の LibraryArtifactKind、🗂テキスト分析は analysis_type）なので文字列。
 * 283/286 のグルーピングはテキスト分析へ持ち込まない（292 §2-5）＝比較の単位は保存された1件そのもの。
 */
export type LibraryCompareEntry<T extends LibraryLike> = { item: T; kind: string; label: string };

/**
 * 選んだ id（選択順）を比較の列に写す。カードのまとめ（283/286）から種別を引き、無ければ行から判定する。
 * 一覧に無くなった id（削除済み）は黙って落とさず呼び出し側が件数差で気づけるよう、返り値は存在分のみ。
 * 上限を超える入力は先頭 LIBRARY_COMPARE_MAX 件（ボタン側で無効化しているので通常は来ない）。
 */
export function libraryCompareEntries<T extends LibraryLike>(
  ids: string[],
  items: T[],
  cards: LibraryCard<T>[],
): LibraryCompareEntry<T>[] {
  const kindOf = new Map<string, LibraryArtifactKind>();
  for (const c of cards) for (const a of c.artifacts) kindOf.set(String(a.item.id), a.kind);
  const byId = new Map<string, T>();
  for (const it of items) byId.set(String(it.id), it);
  const out: LibraryCompareEntry<T>[] = [];
  for (const id of ids) {
    const item = byId.get(String(id));
    if (!item) continue;
    const kind = kindOf.get(String(id)) ?? artifactKindOf(item);
    out.push({ item, kind, label: ARTIFACT_LABEL[kind] });
    if (out.length >= LIBRARY_COMPARE_MAX) break;
  }
  return out;
}
