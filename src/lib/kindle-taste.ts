// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 章のテイスト変換（指示書236B）とスコア評価軸（236A）の定義。
//
// テイストは「文体・語り口の変換」であり、内容の書き換えではない。
// どのテイストを選んでも KINDLE_COMMON_RULES（素材にない事実の追加禁止・医療広告NG表現の
// 禁止）を緩めない。特に「マーケティング強め」は誇張・不安煽りに滑りやすいため、
// promptBlock 側で明示的に禁止する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface KindleTaste {
  key: string;
  emoji: string;
  label: string;
  /** カード上の1行説明（院長が選ぶときの手がかり） */
  hint: string;
  /** プロンプトへ差し込む変換指示 */
  promptBlock: string;
}

export const KINDLE_TASTES: Record<string, KindleTaste> = {
  marketing: {
    key: 'marketing',
    emoji: '📣',
    label: 'マーケティング強め',
    hint: 'ベネフィットを前面に、読み進めたくなる流れ。誇張・不安煽りはしない',
    promptBlock: `# テイスト: マーケティング強め
- 読者が得られる変化（ベネフィット）を各節の冒頭で先に示す
- 「あなた」を主語にした語りかけを増やし、自分ごと化を促す
- 節の終わりに、次を読みたくなる短い橋渡しを入れる
- 行動の提案は「今日からできる小さな一歩」の形にする
- **禁止（緩和しない）**: 効果の保証・断定、最上級（日本一・No.1等）、不安を煽る脅し文句、
  「今だけ」「先着」等の限定性の演出、割引・無料の訴求。受診を急かさない`,
  },
  expert: {
    key: 'expert',
    emoji: '🎓',
    label: '専門性を発揮',
    hint: '根拠と仕組みを厚めに。専門用語には必ず平易な補足をつける',
    promptBlock: `# テイスト: 専門性を発揮
- 「なぜそうなるのか」の機序・根拠を、素材にある範囲で厚く説明する
- 専門用語はそのまま使ってよいが、初出時に必ず括弧書きで平易な補足を添える
- 断定を避け、「〜とされています」「〜が知られています」など事実の強さに合った書き方をする
- 素材にない研究名・数値・出典を新たに作らない（根拠を"それらしく"盛らない）`,
  },
  plain: {
    key: 'plain',
    emoji: '🧒',
    label: '中学生でも分かる平易',
    hint: '短い文・身近なたとえ。専門用語は日常語に言い換える',
    promptBlock: `# テイスト: 中学生でも分かる平易
- 1文を短くする（目安40〜60字）。一文一義にする
- 専門用語は日常のことばに言い換える。どうしても必要なら「＝〜のこと」と直後に説明する
- 身近なたとえを使ってよい（ただし事実を変えないたとえに限る）
- 漢語調の硬い表現をやわらかい和語に置き換える（例:「留意する」→「気をつける」）`,
  },
  story: {
    key: 'story',
    emoji: '📖',
    label: '物語・共感',
    hint: '情景や具体的な場面から入り、読者の実感に寄せる',
    promptBlock: `# テイスト: 物語・共感
- 節の入り口を、読者が経験しそうな具体的な場面の描写から始める
- 「困っている状態 → 気づき → どうすればよいか」の流れで運ぶ
- 感情に触れる言葉を使ってよいが、不安を煽る方向には使わない
- 症例・体験談の創作は禁止（架空の患者エピソードを作らない）`,
  },
  concise: {
    key: 'concise',
    emoji: '✂️',
    label: '簡潔・実務的',
    hint: '冗長を削り、要点と手順を前に。忙しい読者向け',
    promptBlock: `# テイスト: 簡潔・実務的
- 前置き・繰り返し・修飾語を削り、要点を先に置く
- 手順・条件は箇条書きに整理する
- 1節あたりの主張を1つに絞る
- 削るのは表現の冗長さのみ。素材に基づく情報そのものは落とさない`,
  },
};

export const KINDLE_TASTE_KEYS = ['marketing', 'expert', 'plain', 'story', 'concise'] as const;

export function getKindleTaste(key: unknown): KindleTaste {
  return (typeof key === 'string' && KINDLE_TASTES[key]) || KINDLE_TASTES.plain;
}

/** 全テイスト共通の厳守事項（サンプル生成・全文変換の双方に差し込む） */
export const KINDLE_TASTE_GUARD = `# 変換の厳守事項（テイストによらず緩和しない）
- **これは表現の変換であって内容の創作ではない**。事実・数値・固有名詞・主張を変えない
- 原文にない事実・出典・数値・研究名・体験談を追加しない
- 原文にある情報を落とさない（簡潔テイストでも、削るのは冗長な表現のみ）
- Markdownの見出し（##）・箇条書き・太字記法の構造は保つ
- 医療広告規制のNG表現を使わない（効果の保証・断定、誇大・最上級、不安を煽る表現、
  限定性の演出、費用の誤認を招く表現、体験談的表現）
- 章タイトルのH1見出し（# 第N章 …）は出力に含めない`;

/* ══════════════ 236A: 章の採点 ══════════════ */

export interface KindleScoreAxis {
  key: string;
  label: string;
  /** 何を見るかの定義（プロンプトと画面の両方で使う＝基準を1箇所に持つ） */
  criteria: string;
}

export const KINDLE_SCORE_AXES: KindleScoreAxis[] = [
  { key: 'clarity', label: '分かりやすさ', criteria: '一文の長さ・論理の飛躍のなさ・専門用語の扱い' },
  { key: 'resonance', label: '読者への響き', criteria: '読者が自分ごととして読めるか・具体的な場面が浮かぶか' },
  { key: 'structure', label: '構成の明快さ', criteria: '節の順序・見出しの働き・話題の重複のなさ' },
  { key: 'concreteness', label: '具体性', criteria: '抽象論で終わらず、素材に基づく具体例・手順があるか' },
  { key: 'purposeFit', label: '目的との整合', criteria: 'この本の目的（集客/ブランディング等）に沿った内容・締めになっているか' },
];

export interface KindleChapterScore {
  /** 軸キー → 1〜5 */
  scores: Record<string, number>;
  /** 5軸の平均（小数1桁） */
  average: number;
  /** 全体講評（2〜3文） */
  comment: string;
  /** 改善の要点3つ（何をどう直すと良くなるか） */
  improvements: string[];
  scoredAt: string;
  /** 235: どのモデルが採点したか */
  provider?: string;
  modelLabel?: string;
}

export type KindleBookScores = Record<string, KindleChapterScore>;

/** 平均点から表示色を決める（画面側で共通利用） */
export function scoreColor(value: number): string {
  if (value >= 4) return '#22c55e';
  if (value >= 3) return '#f59e0b';
  return '#ef4444';
}
