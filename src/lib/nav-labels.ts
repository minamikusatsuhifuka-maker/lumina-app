// 251: サイドバーのメニュー名・アイコンの変更（院長が自由に付け替える）。
//
// 反映範囲は**サイドバーの表示だけ**。ページ内の見出し(h1)や、他画面の案内文
// （例:「生成時にAIへ参照させたいものは 🧠 AI参照素材 へ」）は既定名のまま変えない。
// 理由: 既定名は文中で多数の画面から参照されており（「AI参照素材」だけで29ファイル）、
// h1 を可変にすると案内文だけが旧名で残って食い違いが起きる。サイドバーは自分の導線の
// ラベルなので、そこだけ変えても他の文と矛盾しない。対応が分かるよう、変更した項目には
// 「既定名」をツールチップで併記する。
//
// 保存は localStorage（テーマ・文字サイズ・追従ボタンと同じく ThemeProvider が一元管理）。
// 壊れた値・未設定はすべて既定名に倒す（243の方式）。DBに入れないので sanitizeForDb は不要。

/** 1項目ぶんの上書き。未指定のキーは既定値をそのまま使う */
export type NavLabelOverride = { label?: string; icon?: string };

export type NavLabelState = {
  /** href をキーにしたメニュー項目の上書き */
  items: Record<string, NavLabelOverride>;
  /** 既定のカテゴリ名をキーにしたカテゴリ見出しの上書き */
  categories: Record<string, string>;
};

export const NAV_LABELS_STORAGE_KEY = 'lumina_nav_labels';

export const NAV_LABELS_DEFAULT: NavLabelState = { items: {}, categories: {} };

/**
 * 表示名の最大文字数。サイドバー幅220px・fontSize 13px では日本語で14文字前後が限界だが、
 * 文字サイズ4段階（最大140%）でも1行に収める必要があるため12文字に切る。
 * これを超える入力は保存時に切り詰める（入力自体は maxLength でも止める）。
 */
export const MAX_NAV_LABEL_LENGTH = 12;

/** アイコンの最大文字数。絵文字は2コードユニット消費するものがあるため少し余裕を持たせる */
export const MAX_NAV_ICON_LENGTH = 4;

/**
 * ユーザー入力の表示名を正規化する。
 * - 前後の空白を落とし、連続空白を1つに詰める
 * - 改行・タブは空白として扱う（サイドバーが崩れるため）
 * - 空文字になったら null（＝上書きせず既定名を使う）
 */
export function normalizeNavLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return [...s].slice(0, MAX_NAV_LABEL_LENGTH).join('');
}

/**
 * アイコン（絵文字）を正規化する。空なら null（＝既定アイコンを使う）。
 * 絵文字かどうかの判定はしない——院長が「◆」や英字1文字を使いたい場合もあるため、
 * 長さだけを制限する（サロゲートペアで切らないようコードポイント単位で数える）。
 */
export function normalizeNavIcon(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, '').trim();
  if (!s) return null;
  return [...s].slice(0, MAX_NAV_ICON_LENGTH).join('');
}

/**
 * localStorage から読んだ値を安全な形に均す。
 * 型が違う・壊れている・空文字のキーは黙って捨てる（既定名に倒れる）。
 */
export function parseNavLabels(raw: unknown): NavLabelState {
  if (!raw || typeof raw !== 'object') return NAV_LABELS_DEFAULT;
  const src = raw as Partial<NavLabelState>;
  const items: Record<string, NavLabelOverride> = {};
  if (src.items && typeof src.items === 'object') {
    for (const [href, v] of Object.entries(src.items)) {
      if (!href || typeof v !== 'object' || v === null) continue;
      const label = normalizeNavLabel((v as NavLabelOverride).label);
      const icon = normalizeNavIcon((v as NavLabelOverride).icon);
      if (label === null && icon === null) continue; // 中身が無い上書きは持たない
      items[href] = {
        ...(label !== null ? { label } : {}),
        ...(icon !== null ? { icon } : {}),
      };
    }
  }
  const categories: Record<string, string> = {};
  if (src.categories && typeof src.categories === 'object') {
    for (const [key, v] of Object.entries(src.categories)) {
      if (!key) continue;
      const label = normalizeNavLabel(v);
      if (label !== null) categories[key] = label;
    }
  }
  return { items, categories };
}

/** 表示に使う名前（上書きが無ければ既定名） */
export function navLabelOf(
  state: NavLabelState,
  href: string,
  defaultLabel: string,
): string {
  return state.items[href]?.label || defaultLabel;
}

/** 表示に使うアイコン（上書きが無ければ既定アイコン） */
export function navIconOf(
  state: NavLabelState,
  href: string,
  defaultIcon: string,
): string {
  return state.items[href]?.icon || defaultIcon;
}

/** 表示に使うカテゴリ見出し（上書きが無ければ既定名） */
export function navCategoryLabelOf(state: NavLabelState, category: string): string {
  return state.categories[category] || category;
}

/** その項目が既定から変更されているか（「元に戻す」ボタンの出し分けに使う） */
export function isNavItemRenamed(state: NavLabelState, href: string): boolean {
  const o = state.items[href];
  return !!o && (!!o.label || !!o.icon);
}

/** 変更されている項目とカテゴリの合計数（「すべて既定に戻す」の出し分け・件数表示に使う） */
export function countNavRenames(state: NavLabelState): number {
  return Object.keys(state.items).length + Object.keys(state.categories).length;
}
