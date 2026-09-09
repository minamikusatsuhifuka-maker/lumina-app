// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 発信ハブのペルソナ（読者像）プリセット 一元管理（指示書261①）
// kindle-purposes / note-styles と同方式。追加・調整はこのファイルの変更だけで完結させる
// （プロンプトへの直書き禁止）。参照元API: /api/dr-hub/persona
//
// 位置づけ: note-styles（語り口）・マイ文体（院長の声）とは別軸の「誰に向けて書くか」。
// 重ね掛けの優先順位は既存どおり〈画面での明示指定 ＞ マイ文体 ＞ プリセット文体〉で、
// ペルソナは「画面での明示指定（読者ターゲット）」に当たる。文体・口調の細部はマイ文体側が勝つ。
// どのペルソナでも NOTE_COMMON_RULES / MEDICAL_AD_NG_RULES（note系規約）を緩めない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PersonaStyleKey =
  | 'expert'
  | 'teen'
  | 'homemaker'
  | 'business'
  | 'beauty'
  | 'senior'
  | 'parenting'
  | 'metrics'
  | 'family';

export interface PersonaStyle {
  key: PersonaStyleKey;
  emoji: string;
  label: string;
  /** カード上の1行説明（院長が選ぶときの手がかり） */
  hint: string;
  /** プロンプトへ差し込む読者像・書き方の指示 */
  promptBlock: string;
}

export const DEFAULT_PERSONA_STYLE: PersonaStyleKey = 'homemaker';

export const PERSONA_STYLES: Record<PersonaStyleKey, PersonaStyle> = {
  expert: {
    key: 'expert',
    emoji: '🎓',
    label: '専門家向け',
    hint: '同業・医療従事者・知識のある読者。用語はそのまま、機序と根拠を厚く',
    promptBlock: `# 読者ペルソナ: 🎓 専門家向け
- 読者は医療・美容の知識がある専門家や勉強熱心な読者。基礎の説明は最小限にする
- 専門用語はそのまま使ってよい（一般向けの言い換えは不要）
- 「なぜそうなるのか」の機序・背景を、素材にある範囲で厚く書く
- 断定を避け、事実の強さに合った表現（〜とされています 等）を使う`,
  },
  teen: {
    key: 'teen',
    emoji: '🧒',
    label: '中学生でも分かる',
    hint: '短い文・身近なたとえ。専門用語は日常語に言い換える',
    promptBlock: `# 読者ペルソナ: 🧒 中学生でも分かる
- 1文を短く（目安40〜60字）、一文一義にする
- 専門用語は日常のことばに言い換える。必要なら「＝〜のこと」と直後に説明する
- 身近なたとえを使ってよい（事実を変えないたとえに限る）
- 漢語調の硬い表現をやわらかい和語に置き換える`,
  },
  homemaker: {
    key: 'homemaker',
    emoji: '🏠',
    label: '主婦向け',
    hint: '家事・家計の目線。毎日の生活に取り入れやすい形で',
    promptBlock: `# 読者ペルソナ: 🏠 主婦向け
- 読者は家事・家族のことで毎日忙しい生活者。生活の場面（台所・洗濯・買い物等）に引きつけて書く
- 「今日からできること」を、お金や手間がかかりすぎない形で示す
- 家計への配慮を尊重し、高額な商品・施術を勧める書き方をしない
- 語りかけはやわらかく、共感から入る`,
  },
  business: {
    key: 'business',
    emoji: '💼',
    label: 'ビジネスマン向け',
    hint: '時間がない読者。結論先出し・箇条書き・要点圧縮',
    promptBlock: `# 読者ペルソナ: 💼 ビジネスマン向け
- 読者は多忙な会社員。結論を先に出し、根拠を後から示す（結論ファースト）
- 見出しと箇条書きで流し読みできる構成にする
- 仕事のパフォーマンス・見た目の清潔感など、働く場面のベネフィットに引きつける
- 冗長な前置きを削り、1節1メッセージで運ぶ`,
  },
  beauty: {
    key: 'beauty',
    emoji: '💄',
    label: '美容関心層向け',
    hint: '美容情報に敏感な読者。仕組みとセルフケアを丁寧に（誇張はしない）',
    promptBlock: `# 読者ペルソナ: 💄 美容関心層向け
- 読者は美容情報への感度が高く、SNSでも情報収集している。「なぜ効くのか/効かないのか」の仕組みに関心がある
- 流行の言葉に流されず、素材に基づく正確な情報で「見極められる読者」になれるよう書く
- セルフケア・生活習慣でできることを具体的に示す
- **美容領域は誇張・効果保証に最も滑りやすい**。効果の断定・ビフォーアフター的な対比表現は使わない`,
  },
  senior: {
    key: 'senior',
    emoji: '👴',
    label: '高齢者向け',
    hint: '大きめの話題単位・ゆっくり丁寧。カタカナ語を減らす',
    promptBlock: `# 読者ペルソナ: 👴 高齢者向け
- 読者は60代以上。カタカナ語・略語を減らし、丁寧な日本語で書く
- 1つの話題を短く区切り、順番に積み上げる（話題が飛ばないように）
- 加齢に伴う変化は「自然なこと」として尊重を保って書く（不安を煽らない）
- 家族に相談する・かかりつけ医に聞くなど、無理のない次の一歩を示す`,
  },
  // ── Claude推奨の追加3種（指示書261） ──
  parenting: {
    key: 'parenting',
    emoji: '👶',
    label: '子育て中のママ向け',
    hint: '時間がない・子どもの健康にも関心。スキマ時間で読み切れる形に',
    promptBlock: `# 読者ペルソナ: 👶 子育て中のママ向け
- 読者は乳幼児〜小学生の子を持つ保護者。自分のケアは後回しになりがちで、読む時間はスキマ時間のみ
- 冒頭で「読了の目安（〜分）」が伝わる分量感にし、要点を先に出す
- 自分の肌・体調の話題を、子どもの健康・家族の生活と自然につなげる（素材にある範囲で）
- 「完璧にやらなくていい」前提で、1つだけ選べる小さな行動を示す
- 子育ての不安を煽る書き方をしない`,
  },
  metrics: {
    key: 'metrics',
    emoji: '📊',
    label: '働き盛り男性の生活習慣改善向け',
    hint: '数字とロジックで納得したい読者。仕組み→行動→目安の順で',
    promptBlock: `# 読者ペルソナ: 📊 働き盛り男性の生活習慣改善向け
- 読者は30〜50代の男性。感情訴求より「仕組みと数字」で納得したいタイプ
- 因果関係（何がどうなるからこうなる）を明快に、素材にある範囲のデータ・数値で示す
- **素材に無い数値・統計を作らない**（数字で語るペルソナほど捏造に滑りやすい。無い場合は定性的に書く）
- 行動提案は「頻度・所要時間の目安」つきで具体的に（例: 週に◯回・1日◯分 は素材にある場合のみ）
- 精神論を避け、続けやすい仕組み・習慣化の観点で締める`,
  },
  family: {
    key: 'family',
    emoji: '🫶',
    label: '家族の健康を気遣う人向け',
    hint: '親・配偶者のために調べる読者。伝え方・寄り添い方まで書く',
    promptBlock: `# 読者ペルソナ: 🫶 家族の健康を気遣う人向け
- 読者は自分ではなく「親・配偶者・家族」のために調べている。主語を「大切な人」に置いて書く
- 本人に代わって調べる読者が、家族へどう伝えるか・どう寄り添うかまで書く
- 本人の意思の尊重を前提にする（無理に受診・ケアをさせる書き方をしない）
- 家族だからこそ気づける変化・声のかけ方を、素材にある範囲で具体的に示す`,
  },
};

export function getPersonaStyle(key: unknown): PersonaStyle {
  if (typeof key === 'string' && key in PERSONA_STYLES) {
    return PERSONA_STYLES[key as PersonaStyleKey];
  }
  return PERSONA_STYLES[DEFAULT_PERSONA_STYLE];
}

export const PERSONA_STYLE_KEYS = Object.keys(PERSONA_STYLES) as PersonaStyleKey[];

/** サンプル比較で一度に読み比べる列数（2〜4列＝指示書261①） */
export const PERSONA_COMPARE_MIN = 2;
export const PERSONA_COMPARE_MAX = 4;

/* ══════════════ 264: note記事の体裁（①ペルソナ別note記事 専用） ══════════════
 * 236（Kindleテイスト変換）とはコード非共有（方式の流用のみ）。ここを変えても236側の出力は変わらない。
 * ②分割記事化などへの適用は別便（264の範囲外）。 */

/** 「記事の長さ」→ 大見出し本数の目安（まとめ含む・指示書264の表） */
export const PERSONA_HEADING_RANGE: Record<'short' | 'medium' | 'long', string> = {
  short: '3〜4本',
  medium: '4〜6本',
  long: '6〜8本',
};

/** タイトル案と本文を分けるマーカー（区切り線 --- は本文でも使うため専用マーカーにする） */
export const PERSONA_TITLES_MARKER = '【タイトル案】';
export const PERSONA_BODY_MARKER = '【本文】';

/** 見出し・タイトルのガード（本文と同等・緩和しない。見出しは煽り・断定が最も出やすい） */
export const PERSONA_HEADING_GUARD = `# 見出し・タイトル案のガード（本文と同等・緩和しない）
- タイトル案・見出しに誇張・断定・不安煽りを使わない（禁止語の例: 「必ず」「絶対」「劇的に」「〇〇が治る」「最強」「危険」「手遅れ」）
- ビフォーアフター的な効果対比表現を見出し・タイトルに使わない
- 数字で釣る見出し（根拠のない「99%」等）を作らない（素材にある数値の転記のみ可）`;

/** note投稿前提の出力構造・記法・可読性の規約（全文生成にのみ課す。サンプルには課さない） */
export function personaStructureRules(headingRange: string): string {
  return `# 出力構造（厳守）
最初に「${PERSONA_TITLES_MARKER}」の行、続けてタイトル案を番号付きで3本（各30字以内）、
次に「${PERSONA_BODY_MARKER}」の行、その後に記事本文だけを出力する。
- タイトル案は本文に混ぜない（noteのタイトル欄に貼るため分離する）
- 本文の冒頭はリード文150〜250字（見出しを付けずに書き出す）
- 本文は大見出し（##）で章立てし、必要に応じて小見出し（###）を使う
- 大見出しの本数はまとめを含めて${headingRange}
- 最終章は「## まとめ」に相当する締めの章にする（見出しの文言は記事に合わせてよい）

# noteの記法制約（厳守）
- 見出しは大見出し(##)・小見出し(###)の2階層のみ。#（h1）は使わない
- 使ってよい記法: 見出し／太字(**)／箇条書き(-)／引用(>)／区切り線(---)のみ
- 表・脚注・HTMLタグ・Markdownリンク記法は使わない（URLは生のURLのみ）
- 画像プレースホルダ（「ここに画像」等）を挿入しない

# 可読性（noteで読みやすく）
- 1段落は3〜4行以内。段落の間に必ず空行を入れる
- 太字は1章あたり1〜2箇所まで（乱用しない）
- 箇条書きは1記事あたり2〜4箇所程度。全文の箇条書き化は禁止`;
}

/**
 * 264: 生成出力を「タイトル案3本」と「本文」に分離する。
 * マーカーが無い・壊れている場合は fail-open（全文を本文として返す＝記事を失わない）。
 */
export function parsePersonaArticleOutput(raw: string): { titles: string[]; body: string } {
  const text = (raw || '').trim();
  const bodyIdx = text.indexOf(PERSONA_BODY_MARKER);
  if (bodyIdx < 0) return { titles: [], body: text };

  const head = text.slice(0, bodyIdx);
  const body = text.slice(bodyIdx + PERSONA_BODY_MARKER.length).trim();

  const titlesIdx = head.indexOf(PERSONA_TITLES_MARKER);
  const titlesBlock = titlesIdx >= 0 ? head.slice(titlesIdx + PERSONA_TITLES_MARKER.length) : head;
  const titles = titlesBlock
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)．]|[-・*])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  // 本文が実質空ならタイトルごと全文を本文扱いに倒す（偽の分離を作らない）
  if (!body) return { titles: [], body: text };
  return { titles, body };
}

/** 全ペルソナ共通の厳守事項（サンプル生成・全文生成の双方に差し込む。緩和しない） */
export const PERSONA_GUARD = `# ペルソナ共通の厳守事項（どの読者向けでも緩和しない）
- ペルソナは「誰に向けて・どう届けるか」の調整であって、内容の創作ではない。事実・数値・固有名詞を変えない
- 素材（DR記事）にない事実・出典・数値・研究名・体験談を追加しない
- 医療広告規制のNG表現を使わない（効果の保証・断定、誇大・最上級、不安を煽る表現、限定性の演出、費用の誤認、体験談的表現）
- 特定の医療機関への受診誘導・集客表現を入れない（役立つ情報の提供で完結させる）
- 読者を見下す・決めつける書き方をしない（ペルソナはあくまで想定であり、レッテルにしない）`;
