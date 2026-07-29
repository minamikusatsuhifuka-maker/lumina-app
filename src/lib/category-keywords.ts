// 201: 新カテゴリ抽出のキーワード辞書（AI不使用・文字列一致）。
// 「ニナファーム」「ミトコンドリア」は固有名詞であり、AIの意味理解を必要としない。
// SQLの文字列一致で判定すれば無料・即時・確定的（169モードA・192マージマップと同じ
// 「機械変換にAIを使わない」原則）。無料なので対象を全件に広げられる。
//
// 202: 院長提供の正式な製品名一覧を追加し、辞書を Tier A/B の2層構造にした。
// - primary（Tier A）: 固有性が高く他分野で出現しない語。単独でヒットさせる
// - secondary（Tier B）: 一般名詞・他分野の語と衝突する製品名（ゼウス/ミュー/フローラ等）。
//   単独では判定に使わず、同一文書内（タイトル＋本文）に primary のいずれかが
//   共起する場合のみヒットさせる（誤検出の抑制。特に「フローラ」は腸内フローラ・
//   皮膚フローラの記事が実在するため単独判定に入れてはならない）
//
// 運用ルール:
// - キーは正規カテゴリ（category-vocabulary.ts の CANONICAL_CATEGORIES）に
//   存在する名前のみとする（語彙統制を壊さない）
// - キーワードの追加・削除は院長判断でこのファイルだけを編集する
//   （ハードコード散らばり禁止。API・ドライランスクリプトの両方がここを参照）

export interface CategoryKeywordSet {
  primary: string[]; // Tier A: 単独でヒット
  secondary: string[]; // Tier B: primary との共起が条件
}

export const CATEGORY_KEYWORDS: Record<string, CategoryKeywordSet> = {
  'ニナファーム': {
    primary: [
      'ニナファーム',
      'NINAPHARM', // 202: NINAFARM は誤綴りのため削除（公式 ninapharm.co.jp）
      'NINA PHARM', // 表記揺れ対策（スペース無視照合で NINAPHARM と同義になる）
      'サンテアージュ',
      'SANTEAGE',
      'オキシリア',
      'ハイプロリーナ',
      'ボアソン',
      'OX-288',
      'OX288',
      'OX 288',
      'アンベリール',
      'アクティアージュ',
      'ヴィブラン',
      'オヴィア',
      'バイオシールド',
      'アセニール',
      'デマキヤン',
    ],
    secondary: [
      'ゼウス', // ギリシャ神話・他ブランド
      'ミュー', // μ・ミュー粒子・一般語（ミュージック等にも部分一致する）
      'クレオ', // クレオパトラ等
      'レボリューション', // Revolution（経営・技術記事に頻出）
      'アルピニスト', // 登山家（一般語）
      'ゼロ グラビティ', // 映画題名等
      'モン コパン',
      'オヴィ', // 「オヴィア」の部分文字列でもある
      'フローラ', // 腸内フローラ・皮膚フローラ（該当記事が多数実在・単独判定禁止）
    ],
  },
  'ミトコンドリア・抗酸化': {
    primary: [
      'ミトコンドリア',
      '抗酸化',
      'SOD',
      '活性酸素',
      'ROS',
      '酸化ストレス',
    ],
    secondary: [],
  },
};

// 短い英字キーワード（SOD / ROS 等）を部分一致(ILIKE)にかけると
// episode の「sod」・roster の「ros」など英文の一部に誤爆するため、
// 単語境界つき正規表現（Postgres の ~* と \y）で判定する。
// 日本語文中の「SOD」も前後が非英数字なので \y 境界が効く。
// ※境界判定のキーワードはスペース無視照合の対象外（空白除去すると境界が壊れるため原文照合）
export function isWordBoundaryKeyword(kw: string): boolean {
  return /^[A-Za-z0-9]{2,5}$/.test(kw);
}

// 202: スペース入り製品名（NINA PHARM / ゼロ グラビティ / モン コパン 等）は
// 実データで空白の有無・全角/半角の揺れがあるため、照合時は両側から空白を除去して比較する
// （SQL側は REPLACE で列から空白除去、パターン側はこの関数で除去）。
export function stripSpaces(s: string): string {
  return s.replace(/[ 　]/g, '');
}

// ILIKE 用パターン（スペース無視照合＋% _ エスケープ。キーワードは定数だが作法として）
export function toIlikePattern(kw: string): string {
  return `%${stripSpaces(kw).replace(/([%_\\])/g, '\\$1')}%`;
}

// ~* 用の単語境界パターン（英数字キーワード専用。正規表現メタ文字は含まない前提）
export function toWordBoundaryPattern(kw: string): string {
  return `\\y${kw}\\y`;
}
