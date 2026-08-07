// Kindleウィザードの素材上限 定数（223でkindle-materials.tsから分離）
// kindle-materials.ts は @neondatabase/serverless に依存するサーバ専用モジュールのため、
// クライアント（ウィザード画面）と共用する定数だけをここに置く。

// 選択上限（note-bundle の MAX_BUNDLE_SOURCES=10 と同根拠）
export const MAX_KINDLE_SOURCES = 10;
// 合計文字数上限（DR実測: 平均4,674字・p90約1万字 → 全件p90級でも安全圏に収める）
export const MAX_KINDLE_TOTAL_CHARS = 150_000;
// 目次生成時の1素材あたり切り詰め（p90の大半をカバーしつつプロンプトを制限）
export const OUTLINE_EXCERPT_CHARS = 8_000;

// 229A/231: 素材ソース種別。サーバ（kindle-materials.ts）とクライアント（①素材タブ）で共用。
// 231: 'analysis'（text_analysis_saves・整数ID）を追加。ID空間が異なるため素材IDは
// 「ana-N」名前空間で表し、裸のuuidはlibrary扱い（既存book_metaの後方互換）。
export type KindleMaterialSource = 'deepresearch' | 'note-article' | 'analysis';

// library.type としてSQLに直投入する値（231で 'analysis' を混ぜないこと＝別テーブルのため）
export const KINDLE_LIBRARY_TYPES = ['deepresearch', 'note-article'] as const;
// 旧名互換（既存importを壊さない。意味は「libraryのtype値」のまま）
export const KINDLE_MATERIAL_SOURCES = KINDLE_LIBRARY_TYPES;

// ①素材タブの表示順（library 2種＋テキスト分析）
export const KINDLE_SOURCE_TABS: KindleMaterialSource[] = ['deepresearch', 'note-article', 'analysis'];

export const KINDLE_MATERIAL_SOURCE_META: Record<KindleMaterialSource, { emoji: string; label: string }> = {
  deepresearch: { emoji: '🗂', label: 'ディープリサーチ' },
  'note-article': { emoji: '📝', label: 'note記事' },
  // note-bundle側は🗂=テキスト分析だが、Kindle側は🗂=DRで既出のため別絵文字にする
  analysis: { emoji: '📊', label: 'テキスト分析' },
};

// ── 231: 素材IDの名前空間 ──────────────────────────────────────
// 'ana-N'（Nは正の整数）= text_analysis_saves ／ それ以外 = library の uuid（既定フォールバック）。
// 既存の kindle_books.book_meta（裸uuid）と新規保存の形式は変えず、追加分だけ ana-N を混在させる。
const ANA_KEY_RE = /^ana-(\d+)$/;

export function makeAnalysisSourceKey(id: number): string {
  return `ana-${id}`;
}

export function parseKindleSourceKey(
  key: string,
): { kind: 'analysis'; id: number } | { kind: 'library'; id: string } {
  const m = ANA_KEY_RE.exec(key);
  if (m) {
    const id = Number(m[1]);
    if (Number.isInteger(id) && id > 0) return { kind: 'analysis', id };
  }
  return { kind: 'library', id: key };
}

export function isAnalysisSourceKey(key: string): boolean {
  return parseKindleSourceKey(key).kind === 'analysis';
}
