// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// note記事の文体プリセット 一元管理（179）
// 「保存資料→note記事群」のパス1（プラン提案）とパス2（記事生成）の両方から参照する。
// 文体の追加・調整はこのファイルの変更だけで完結させる（プロンプトへの直書き禁止）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type NoteStyleKey = 'friendly' | 'expert' | 'balanced' | 'story';

export interface NoteStyle {
  key: NoteStyleKey;
  emoji: string;
  label: string;
  // UIセレクト・バッジ横に出す短い説明
  description: string;
  // パス2のプロンプトに差し込む文体指示ブロック
  promptBlock: string;
}

export const DEFAULT_NOTE_STYLE: NoteStyleKey = 'balanced';

export const NOTE_STYLES: Record<NoteStyleKey, NoteStyle> = {
  friendly: {
    key: 'friendly',
    emoji: '🌱',
    label: '読みやすさ重視',
    description: '一般に広がりやすい。平易な言葉・短い文・具体例多め',
    promptBlock: `# 文体指示: 🌱 読みやすさ重視（一般向け）
- 平易な言葉と短い文で書く。一文は50字以内を目安に
- 専門用語を使う場合は、直後に一言のやさしい説明を添える
- 具体例・身近な比喩・読者への語りかけを多用し、共感を呼ぶ導入から入る
- 箇条書きを多めに使い、スキマ時間でも読み切れるリズムにする`,
  },
  expert: {
    key: 'expert',
    emoji: '🔬',
    label: '専門・高密度',
    description: '専門性が高く情報密度が濃い。資料の根拠に忠実',
    promptBlock: `# 文体指示: 🔬 専門・高密度（専門家・意識の高い読者向け）
- 正確な用語を用い、機序（なぜそうなるか）まで踏み込んで説明する
- 構造的な見出しで論点を整理し、情報密度を高く保つ
- 根拠は渡された資料の記述のみ。資料に無い出典・数値・固有の研究名を新たに書かない（出典の捏造は厳禁）
- 資料の記述を根拠として示す場合は、資料の表現に忠実に言い換える`,
  },
  balanced: {
    key: 'balanced',
    emoji: '⚖️',
    label: 'バランス',
    description: '読みやすさと専門性の中間（既定）',
    promptBlock: `# 文体指示: ⚖️ バランス（標準）
- 読みやすさと専門性のバランスを取る。専門用語は使ってよいが、初出時に短い説明を添える
- 見出しで構造を示しつつ、本文は語りかける自然な文章にする
- 要点は箇条書き、説明は文章、と使い分ける`,
  },
  story: {
    key: 'story',
    emoji: '📖',
    label: 'ストーリー',
    description: '事例・体験談ふうの導入から本題へ（一般化した描写のみ）',
    promptBlock: `# 文体指示: 📖 ストーリー
- 「こんな悩みを抱える人は多い」のような一般化した事例・情景描写の導入から本題へ入る
- 実在の患者・特定の個人を想起させる記述は禁止（年齢・性別・経過など具体的な個人の物語を作らない）。あくまで一般化した描写のみ
- 読者が自分ごととして読める展開（悩み→背景の理解→できること）で構成する`,
  },
};

// 不正・未知のキーは既定文体に落とす（AIの初期提案や旧データの揺れを吸収）
export function getNoteStyle(key: unknown): NoteStyle {
  if (typeof key === 'string' && key in NOTE_STYLES) {
    return NOTE_STYLES[key as NoteStyleKey];
  }
  return NOTE_STYLES[DEFAULT_NOTE_STYLE];
}

export const NOTE_STYLE_KEYS = Object.keys(NOTE_STYLES) as NoteStyleKey[];

// 全文体共通の品質規約（既存 note記事生成の規約 + 医療系の数値/出典ルール）。
// パス2のシステムプロンプトに必ず含める。緩和・省略しない。
export const NOTE_COMMON_RULES = `# 全文体共通の厳守事項
- AIが書いたとわかる無機質な文章は避け、読者と対話するような自然な口調で書く
- 「ここに体験談を入れてください」のようなプレースホルダは使わず、自然な文章として完結させる
- HTMLタグは使わない。Markdownのリンク記法（[テキスト](URL)）も使わない。URLは生のURLのみ記載
- 数値・統計・パーセンテージ・研究結果は、渡された資料に書かれているものの転記のみ可。資料に無い数値を新たに作らない
- 資料に無い出典・論文名・研究名を書かない（出典の捏造は厳禁）
- 投稿前に編集される前提だが、未完成感を残さず最後の結論まで書ききる`;
