// 201: 新カテゴリ抽出のキーワード辞書（AI不使用・文字列一致）。
// 「ニナファーム」「ミトコンドリア」は固有名詞であり、AIの意味理解を必要としない。
// SQLの文字列一致で判定すれば無料・即時・確定的（169モードA・192マージマップと同じ
// 「機械変換にAIを使わない」原則）。無料なので対象を全件に広げられる。
//
// 運用ルール:
// - キーは正規カテゴリ（category-vocabulary.ts の CANONICAL_CATEGORIES）に
//   存在する名前のみとする（語彙統制を壊さない）
// - キーワードの追加・削除は院長判断でこのファイルだけを編集する
//   （ハードコード散らばり禁止。API・ドライランスクリプトの両方がここを参照）

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'ニナファーム': [
    'ニナファーム',
    'NINAFARM',
    'NINAPHARM',
    'NINA PHARM',
    'サンテアージュ',
    'オキシリア',
  ],
  'ミトコンドリア・抗酸化': [
    'ミトコンドリア',
    '抗酸化',
    'SOD',
    '活性酸素',
    'ROS',
    '酸化ストレス',
  ],
};

// 短い英字キーワード（SOD / ROS 等）を部分一致(ILIKE)にかけると
// episode の「sod」・roster の「ros」など英文の一部に誤爆するため、
// 単語境界つき正規表現（Postgres の ~* と \y）で判定する。
// 日本語文中の「SOD」も前後が非英数字なので \y 境界が効く。
export function isWordBoundaryKeyword(kw: string): boolean {
  return /^[A-Za-z0-9]{2,5}$/.test(kw);
}

// ILIKE 用パターン（% _ をエスケープ。キーワードは定数だが作法として）
export function toIlikePattern(kw: string): string {
  return `%${kw.replace(/([%_\\])/g, '\\$1')}%`;
}

// ~* 用の単語境界パターン（英数字キーワード専用。正規表現メタ文字は含まない前提）
export function toWordBoundaryPattern(kw: string): string {
  return `\\y${kw}\\y`;
}
