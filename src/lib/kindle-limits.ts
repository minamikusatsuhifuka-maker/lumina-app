// Kindleウィザードの素材上限 定数（223でkindle-materials.tsから分離）
// kindle-materials.ts は @neondatabase/serverless に依存するサーバ専用モジュールのため、
// クライアント（ウィザード画面）と共用する定数だけをここに置く。

// 選択上限（note-bundle の MAX_BUNDLE_SOURCES=10 と同根拠）
export const MAX_KINDLE_SOURCES = 10;
// 合計文字数上限（DR実測: 平均4,674字・p90約1万字 → 全件p90級でも安全圏に収める）
export const MAX_KINDLE_TOTAL_CHARS = 150_000;
// 目次生成時の1素材あたり切り詰め（p90の大半をカバーしつつプロンプトを制限）
export const OUTLINE_EXCERPT_CHARS = 8_000;

// 229A: 素材ソース種別（library.type の値と一致させる。上限はDR+note合算で共通）
// サーバ（kindle-materials.ts）とクライアント（①素材タブ）で共用するためここに置く
export type KindleMaterialSource = 'deepresearch' | 'note-article';
export const KINDLE_MATERIAL_SOURCES: KindleMaterialSource[] = ['deepresearch', 'note-article'];
export const KINDLE_MATERIAL_SOURCE_META: Record<KindleMaterialSource, { emoji: string; label: string }> = {
  deepresearch: { emoji: '🗂', label: 'ディープリサーチ' },
  'note-article': { emoji: '📝', label: 'note記事' },
};
