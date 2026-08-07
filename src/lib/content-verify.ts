// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内容検証器（指示書233②）— 生成物の「中身」を機械判定する
//
//  1. 素材外固有名詞の検出 findUngroundedTerms(): 生成本文から固有名詞（数値・製品名・
//     人名・機関名）を抽出し、渡した素材テキストに存在しないものを警告として返す
//  2. 禁止表現チェック findBannedExpressions(): 誇張・断定・不安煽り・限定性・費用誤認等の
//     医療広告NG表現を辞書ベースで検出
//
// 設計方針（RULES.md R-26 / R-21 / R-22）:
// - **AI呼び出しをしない**。全て文字列照合・正規表現の純関数（サーバ/クライアント両用）
// - **判定は警告どまり**。自動ブロック・自動修正・自動削除は一切しない
//   （誤検出で生成が止まる方が、見逃しより害が大きい）
// - 既存の medical-ad-check.ts（Gemini判定）を置き換えず補完する。あちらは文脈判断、
//   こちらは決定的・ゼロコスト・オフラインで、両方を併記して院長が確認できる形にする
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/* ══════════════ 型 ══════════════ */

export type UngroundedKind = '数値' | 'カタカナ語' | '英字表記' | '機関名' | '人名' | '年号';

export interface UngroundedTerm {
  /** 素材に見つからなかった表記（本文に現れる通り） */
  term: string;
  kind: UngroundedKind;
  /** 本文中での出現回数 */
  count: number;
  /** 初出箇所の前後（確認用・30字前後） */
  context: string;
}

export type BannedCategory =
  | '効果保証・断定'
  | '誇大・最上級'
  | '不安煽り'
  | '限定性・希少性'
  | '費用誤認'
  | '体験談・ビフォーアフター';

export interface BannedExpression {
  /** 実際に一致した文字列 */
  matched: string;
  category: BannedCategory;
  /** なぜNGか（1行） */
  reason: string;
  /** 前後の文脈（確認用） */
  context: string;
  /** 本文先頭からの文字位置（初出） */
  index: number;
  count: number;
}

export interface ContentVerifyResult {
  ungrounded: UngroundedTerm[];
  banned: BannedExpression[];
  /** 素材が空＝素材照合を実施できなかった（メモのみの生成など） */
  groundingSkipped: boolean;
}

/* ══════════════ 共通ユーティリティ ══════════════ */

// 素材照合用の正規化。全角/半角・大文字小文字・空白・記号の揺れで「素材に無い」と
// 誤判定するのを防ぐ（照合は正規化どうしで行い、表示は本文の原表記のまま）。
function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[・･,，、.。]/g, '');
}

function contextAround(text: string, index: number, length: number, pad = 15): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  const body = text.slice(start, end).replace(/\n+/g, ' ');
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/* ══════════════ 1. 素材外固有名詞の検出 ══════════════ */

// 抽出パターン。順序に意味がある（先に具体的なものを取り、汎用パターンの取りこぼしを減らす）。
// 日本語には語境界が無いため、「明らかに固有名詞・数値であるもの」だけを狙い撃つ。
const EXTRACT_PATTERNS: { kind: UngroundedKind; re: RegExp }[] = [
  // 年号（西暦・和暦）
  { kind: '年号', re: /(?:19|20)\d{2}\s*年|令和\s*\d{1,2}\s*年|平成\s*\d{1,2}\s*年/g },
  // 機関名・団体名（接尾辞つき＝固有名詞としてほぼ確実）
  {
    kind: '機関名',
    re: /[一-鿿ぁ-んァ-ヿA-Za-z][一-鿿ぁ-んァ-ヿA-Za-z0-9ー・]{1,18}(?:大学|大学院|病院|医院|クリニック|学会|協会|機構|財団|法人|研究所|研究センター|センター|委員会|省|庁|学部|研究会)/g,
  },
  // 人名（敬称・肩書つき＝誤検出が少ない形だけを拾う）
  { kind: '人名', re: /[一-鿿]{2,5}(?:氏|教授|准教授|医師|博士|先生|所長|院長|会長)/g },
  // 数値＋単位（%・人数・金額・用量・期間など。素材に無い統計値の混入がいちばん危ない）
  {
    kind: '数値',
    re: /\d[\d,]*(?:\.\d+)?\s*(?:%|％|パーセント|割|倍|人|名|件|例|万|億|円|ドル|mg|ml|mL|g|kg|cm|mm|μm|歳|才|回|日|週間|週|か月|ヶ月|カ月|年間|時間|分|秒|種類|項目|ポイント)/g,
  },
  // カタカナ語（4文字以上の連続＝製品名・成分名・専門用語を想定）
  { kind: 'カタカナ語', re: /[ァ-ヶー]{4,}(?:・[ァ-ヶー]{2,})*/g },
  // 英字表記（3文字以上の語・略語。製品名/機関略称/指標名を想定）
  { kind: '英字表記', re: /\b[A-Za-z][A-Za-z0-9]{2,}(?:[-.][A-Za-z0-9]+)*\b/g },
];

// 一般語の除外リスト。固有名詞ではないのに上のパターンに引っかかるものを落とす。
// （誤検出を1件でも減らすほうが、院長が警告リストを実際に読んでくれる確率が上がる）
const GENERIC_TERMS = new Set(
  [
    // 汎用カタカナ語
    'ケース', 'ポイント', 'テーマ', 'メリット', 'デメリット', 'アプローチ', 'ステップ',
    'バランス', 'スタイル', 'イメージ', 'タイミング', 'コミュニケーション', 'ストレス',
    'サポート', 'サービス', 'ニーズ', 'プロセス', 'パターン', 'ポジション', 'レベル',
    'ルール', 'ヒント', 'コツ', 'シンプル', 'スムーズ', 'ポジティブ', 'ネガティブ',
    'リスク', 'コスト', 'チェック', 'ケア', 'スキンケア', 'トラブル', 'アドバイス',
    'ライフスタイル', 'セルフケア', 'クリニック', 'カウンセリング', 'デリケート',
    'コンディション', 'コントロール', 'モチベーション', 'パフォーマンス', 'ストーリー',
    'メッセージ', 'テクニック', 'エピソード', 'キーワード', 'ポリシー', 'スケジュール',
    'ボリューム', 'クオリティ', 'フォロー', 'ベース', 'メイン', 'サイクル', 'プラン',
    'タイプ', 'グループ', 'システム', 'データ', 'ツール', 'ページ', 'サイト', 'ユーザー',
    'コンテンツ', 'マーケティング', 'ブランド', 'ターゲット', 'リアル', 'オンライン',
    // 汎用英字
    'the', 'and', 'for', 'you', 'not', 'but', 'with', 'this', 'that', 'from', 'are',
    'was', 'can', 'all', 'has', 'have', 'web', 'app', 'ai',
  ].map((t) => normalizeForMatch(t)),
);

/**
 * 生成本文の固有名詞のうち、素材テキストに存在しないものを列挙する。
 *
 * @param generated 生成された本文
 * @param sources   渡した素材テキスト（複数可。メモ・要点も素材として渡してよい）
 * @returns 素材に見つからなかった語（出現回数の多い順）。**警告用途のみ**
 */
export function findUngroundedTerms(
  generated: string,
  sources: string[],
  options?: { maxResults?: number },
): UngroundedTerm[] {
  const maxResults = options?.maxResults ?? 40;
  if (!generated?.trim()) return [];
  const sourceNorm = normalizeForMatch(sources.filter(Boolean).join('\n'));
  if (!sourceNorm) return [];

  // 見出し記号・強調記号は語の一部として拾わないよう、本文側だけ軽く均す
  const body = generated.replace(/[#*>`|]/g, ' ');

  const found = new Map<string, UngroundedTerm>();
  const claimed: { start: number; end: number }[] = []; // 先勝ち（具体パターン優先）の占有区間

  for (const { kind, re } of EXTRACT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) {
      const term = m[0].trim();
      const index = m.index ?? 0;
      if (!term) continue;
      // より具体的なパターンが既に取った範囲は飛ばす（例: 「◯◯大学」の一部の漢字列）
      if (claimed.some((c) => index < c.end && index + term.length > c.start)) continue;

      const norm = normalizeForMatch(term);
      if (!norm || GENERIC_TERMS.has(norm)) continue;
      claimed.push({ start: index, end: index + term.length });

      // 素材に含まれていれば根拠あり＝警告しない
      if (sourceNorm.includes(norm)) continue;

      const existing = found.get(norm);
      if (existing) existing.count++;
      else found.set(norm, { term, kind, count: 1, context: contextAround(body, index, term.length) });
    }
  }

  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, maxResults);
}

/* ══════════════ 2. 禁止表現チェック ══════════════ */

interface BannedRule {
  re: RegExp;
  category: BannedCategory;
  reason: string;
  /** 一致箇所の前後にこの表現があれば適正とみなして除外する（正当な注意喚起など） */
  exceptions?: RegExp[];
}

// 辞書。medical-ad-check.ts の MEDICAL_AD_NG_RULES（AI判定用の文章）と観点を揃え、
// こちらは決定的に判定できる語だけを機械可読な形にしたもの。
// 誤検出抑制のため、線引きが難しい観点には exceptions を持たせる。
const BANNED_RULES: BannedRule[] = [
  // ── 効果保証・断定 ──
  {
    re: /必ず(?:治|治り|治る|改善|良くな|よくな|効果)/g,
    category: '効果保証・断定',
    reason: '治療効果の保証は医療広告ガイドラインで禁止',
  },
  { re: /絶対に?(?:治|安全|大丈夫|効果|失敗しない)/g, category: '効果保証・断定', reason: '「絶対」は効果・安全性の保証にあたる' },
  { re: /(?:効果|安全性?|結果)を?保証/g, category: '効果保証・断定', reason: '効果・安全性の保証表現' },
  { re: /100\s*[%％]\s*(?:治|改善|安全|効果|満足)/g, category: '効果保証・断定', reason: '数値による効果保証' },
  { re: /誰でも(?:必ず|確実に|治り|痩せ|改善)/g, category: '効果保証・断定', reason: '万人への効果を断定している' },
  { re: /(?:確実に|間違いなく)(?:治|改善|効果|良くな)/g, category: '効果保証・断定', reason: '効果の断定表現' },
  { re: /副作用は?(?:一切)?(?:あり|)ません/g, category: '効果保証・断定', reason: '副作用の否定は安全性の保証にあたる' },
  { re: /(?:痛み|リスク)は?(?:一切|全く|まったく)(?:あり|)ません/g, category: '効果保証・断定', reason: 'リスクの全否定' },

  // ── 誇大・最上級 ──
  { re: /日本[一初](?:の|を|で)?/g, category: '誇大・最上級', reason: '客観的な根拠を示せない最上級表現' },
  { re: /世界[一初]/g, category: '誇大・最上級', reason: '客観的な根拠を示せない最上級表現' },
  { re: /(?:業界|地域|県内|市内)(?:No\.?\s*1|ナンバー\s*ワン|一)/gi, category: '誇大・最上級', reason: '比較優良広告にあたる' },
  { re: /No\.?\s*1|ナンバーワン/gi, category: '誇大・最上級', reason: '根拠のない No.1 表示は禁止' },
  { re: /最(?:高|先端|新鋭|良|強)の(?:治療|技術|医療|効果|設備)/g, category: '誇大・最上級', reason: '他院との比較優良広告にあたる' },
  { re: /唯一の(?:治療|方法|クリニック|医院)/g, category: '誇大・最上級', reason: '独自性の断定は根拠を要する' },
  { re: /(?:他院|他社)より(?:優れ|良い|安い|効果)/g, category: '誇大・最上級', reason: '比較優良広告は禁止' },
  { re: /奇跡の/g, category: '誇大・最上級', reason: '誇大表現' },

  // ── 不安煽り ──
  // 「早めの受診をおすすめします」等の正当な注意喚起は適正なので exceptions で外す
  {
    re: /放置すると(?:危険|大変|手遅れ|悪化)/g,
    category: '不安煽り',
    reason: '恐怖心をあおる表現（正当な注意喚起の範囲を超える）',
  },
  { re: /手遅れ(?:になる前に|になります|です)/g, category: '不安煽り', reason: '恐怖心をあおる表現' },
  { re: /今すぐ(?:受診|来院|治療|相談)しないと/g, category: '不安煽り', reason: '受診を急かす脅し文句' },
  { re: /(?:しないと|なければ)(?:悪化し|危険で|取り返しが)/g, category: '不安煽り', reason: '不利益を強調して受診を迫る表現' },
  { re: /(?:一生|二度と)(?:治らな|戻らな|元に戻せ)/g, category: '不安煽り', reason: '不可逆性を強調した恐怖訴求' },
  { re: /放っておくと(?:大変|危険|悪化)/g, category: '不安煽り', reason: '恐怖心をあおる表現' },

  // ── 限定性・希少性 ──
  { re: /今だけ/g, category: '限定性・希少性', reason: '期間限定の演出は医療広告で禁止' },
  { re: /先着\s*\d*\s*[名人]/g, category: '限定性・希少性', reason: '先着表示は利益誘導にあたる' },
  { re: /期間限定/g, category: '限定性・希少性', reason: '期間限定の演出は医療広告で禁止' },
  { re: /(?:キャンペーン|受付)(?:終了間近|まもなく終了|は今月まで)/g, category: '限定性・希少性', reason: '緊急性の演出' },
  { re: /残り\s*(?:わずか|\d+\s*[名枠])/g, category: '限定性・希少性', reason: '希少性の演出' },
  { re: /この機会を(?:お)?逃さ/g, category: '限定性・希少性', reason: '緊急性の演出' },

  // ── 費用誤認 ──
  { re: /実質(?:無料|0円|ゼロ円)/g, category: '費用誤認', reason: '総額が伝わらない費用表示' },
  { re: /(?:初回|今なら)\s*無料/g, category: '費用誤認', reason: '値引き・利益誘導にあたる' },
  { re: /\d+\s*[%％]\s*(?:OFF|オフ|割引)/gi, category: '費用誤認', reason: '割引表示は利益誘導にあたる' },
  { re: /(?:モニター|割引)価格/g, category: '費用誤認', reason: '値引き・モニター募集は利益誘導にあたる' },
  { re: /追加(?:費用|料金)は?(?:一切)?(?:かかりま|あり)ません/g, category: '費用誤認', reason: '総額の誤認を招く可能性がある' },

  // ── 体験談・ビフォーアフター ──
  { re: /(?:ビフォー\s*(?:・|&|＆)?\s*アフター|before\s*(?:\/|&)?\s*after)/gi, category: '体験談・ビフォーアフター', reason: '術前術後の対比表示は制限対象' },
  { re: /(?:治療|施術)(?:前|後)の(?:写真|画像|比較)/g, category: '体験談・ビフォーアフター', reason: '術前術後の写真掲載は制限対象' },
  { re: /患者(?:様|さん)の(?:声|体験談|口コミ)/g, category: '体験談・ビフォーアフター', reason: '治療内容・効果に関する体験談は広告不可' },
  { re: /(?:私|僕|自分)も(?:これで)?(?:治り|完治し|きれいになり)ました/g, category: '体験談・ビフォーアフター', reason: '効果に関する体験談的表現' },
];

/**
 * 誇張・断定・不安煽り・医療広告NG表現を辞書ベースで検出する。
 * 校正提案（suggestion）にも生成本文にも同じ辞書を当てる。**警告用途のみ**。
 */
export function findBannedExpressions(text: string, options?: { maxResults?: number }): BannedExpression[] {
  const maxResults = options?.maxResults ?? 40;
  if (!text?.trim()) return [];

  const found = new Map<string, BannedExpression>();
  for (const rule of BANNED_RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const matched = m[0];
      const index = m.index ?? 0;
      const context = contextAround(text, index, matched.length, 20);
      if (rule.exceptions?.some((ex) => ex.test(context))) continue;

      const key = `${rule.category}:${matched}`;
      const existing = found.get(key);
      if (existing) existing.count++;
      else found.set(key, { matched, category: rule.category, reason: rule.reason, context, index, count: 1 });
    }
  }

  return [...found.values()].sort((a, b) => a.index - b.index).slice(0, maxResults);
}

/* ══════════════ まとめて実行 ══════════════ */

/**
 * 素材照合＋禁止表現をまとめて実行する。生成系APIのレスポンスに `verify` として同梱する用途。
 * 素材が空のとき（メモのみの生成など）は素材照合をスキップし、禁止表現だけを返す。
 */
export function verifyContent(
  generated: string,
  sources: string[],
  options?: { maxResults?: number },
): ContentVerifyResult {
  const usable = sources.filter((s) => s && s.trim());
  return {
    ungrounded: usable.length > 0 ? findUngroundedTerms(generated, usable, options) : [],
    banned: findBannedExpressions(generated, options),
    groundingSkipped: usable.length === 0,
  };
}

/** 警告が1件でもあるか（バッジ表示の判定用） */
export function hasVerifyWarnings(r: ContentVerifyResult | null | undefined): boolean {
  return !!r && (r.ungrounded.length > 0 || r.banned.length > 0);
}
