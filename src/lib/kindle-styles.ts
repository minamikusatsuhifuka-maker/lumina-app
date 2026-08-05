// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの文体プリセット 一元管理（222）
// 目的（kindle-purposes.ts＝構成・訴求・CTA）とは別軸の「語り口」。
// note-styles.ts と同方式: 文体の追加・調整はこのファイルの変更だけで完結させる
// （プロンプトへの直書き禁止）。目次生成（outline）と本文生成（generate-chapter）の
// 両方から参照する。
// ※ 旧Kindle出版スタジオの WRITING_STYLES（page.tsxベタ書き）は移行しない（222-2承認）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KindleStyleKey = 'expert' | 'friendly' | 'story' | 'practical';

export interface KindleStyle {
  key: KindleStyleKey;
  emoji: string;
  label: string;
  // UIセレクト・バッジ横に出す短い説明
  description: string;
  // プロンプトに差し込む文体指示ブロック
  promptBlock: string;
}

export const DEFAULT_KINDLE_STYLE: KindleStyleKey = 'expert';

export const KINDLE_STYLES: Record<KindleStyleKey, KindleStyle> = {
  expert: {
    key: 'expert',
    emoji: '🎓',
    label: '専門家の解説調',
    description: '落ち着いたですます調で根拠を添えて解説する信頼感重視（既定）',
    promptBlock: `# 文体指示: 🎓 専門家の解説調
- ですます調で統一する。落ち着いた、信頼感のある語り口
- 断定には必ず根拠・数字をセットで添える（根拠は渡された素材の記述のみ）
- 専門用語を使う場合は、直後に一言の平易な言い換えを添える
- 一文は60字以内を目安に。要点は箇条書きを活用する`,
  },
  friendly: {
    key: 'friendly',
    emoji: '😊',
    label: '親しみやすい語りかけ調',
    description: '読者に「あなた」と語りかけ、共感と疑問文で引き込むやわらかい文体',
    promptBlock: `# 文体指示: 😊 親しみやすい語りかけ調
- ですます調＋読者への語りかけ（「あなた」「〜ですよね」等の共感表現を適度に）
- 各節の冒頭で読者の悩み・疑問を代弁してから本題に入る
- 難しい言い回しを避け、身近な比喩や具体例を多めに使う
- 絵文字・顔文字は使わない`,
  },
  story: {
    key: 'story',
    emoji: '📖',
    label: 'ストーリー重視',
    description: '具体的な場面・エピソードから始めて教訓に落とす物語構成',
    promptBlock: `# 文体指示: 📖 ストーリー重視
- 各章を具体的な場面・事例・情景描写から始め、時系列で展開して教訓・学びに落とす
- 登場人物の感情の動きを描き、そこから読者自身の状況への橋渡しをする
- 実在の人物・患者を想起させる記述は禁止。事例は必ず一般化・仮名化し、特定につながる詳細を作らない
- 物語パートと解説パートのバランスを取り、章の後半では要点を明確に整理する`,
  },
  practical: {
    key: 'practical',
    emoji: '⚡',
    label: '要点直行の実務調',
    description: '結論先出し・箇条書き中心で、忙しい読者が拾い読みできる文体',
    promptBlock: `# 文体指示: ⚡ 要点直行の実務調
- 各節の冒頭に結論を1行で示してから詳細に入る
- 手順・方法は番号付きリストで示し、1項目1メッセージを守る
- 冗長な前置き・繰り返し・修飾を禁止。短い文で畳みかけるリズムにする
- 拾い読みでも要点が伝わるよう、見出しと箇条書きを多用する`,
  },
};

// 不正・未知のキーは既定文体に落とす（AIの初期提案や旧データの揺れを吸収）
export function getKindleStyle(key: unknown): KindleStyle {
  if (typeof key === 'string' && key in KINDLE_STYLES) {
    return KINDLE_STYLES[key as KindleStyleKey];
  }
  return KINDLE_STYLES[DEFAULT_KINDLE_STYLE];
}

export const KINDLE_STYLE_KEYS = Object.keys(KINDLE_STYLES) as KindleStyleKey[];
