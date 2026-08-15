// テキスト生成モデルの一元管理（178: Gemini / 195: Claude）
// 次回のモデル移行はこのファイルの変更だけで完結させる（API呼び出し・UI表示とも定数参照）。
// 対象外: 画像生成（lib/image-providers）・speech-to-text。

// ── 既定のAIモデル（244: 院長の運用方針） ──
// 「基本は Gemini で運用する。Claude はユーザーがボタンで明示的に選択したときのみ使う」。
// モデル選択のない内部処理も含め、既定は必ずこの定数を参照する（'claude' の直書き禁止）。
// 235のフォールバック（Claude選択時に上限・障害ならGeminiへ切替＋表示）は維持する。
// 逆方向（Gemini→Claude）のフォールバックは作らない。
export const DEFAULT_AI_MODEL = 'gemini' as const;

// ── Claude テキスト生成モデル（195: 全Claude機能で共用・直書き禁止） ──
// claude-sonnet-5 は日付サフィックスなしの正式ID（192で /v1/models 実確認済み）。
// Sonnet 5 の注意: 非デフォルトの temperature/top_p/top_k は400で拒否（送らない）。
// thinking は未指定で adaptive が既定ON＝max_tokens は思考+本文の合算上限（枠は増額済み）。
export const CLAUDE_TEXT_MODEL = 'claude-sonnet-5';

// UI表示用ラベル（セレクタ・バッジ・画面説明文で共通使用）
export const CLAUDE_TEXT_MODEL_LABEL = 'Claude Sonnet 5';

// ── Claude Opus（244: ハンドブックのモデル比較・スコアリング専用の上位モデル） ──
// 主力は上の Sonnet 5。ここは「同じ原稿を上位モデルでも書かせて見比べる」用途に限る。
// 244で /v1/models を実測して現行世代を確認した（claude-opus-5 は 200・入力1,000,000/出力128,000）。
// 存在しないIDは同じエンドポイントで 404 になるため、上限中でも実在確認だけは確実にできる。
// 直書きせずここを参照すること（比較枠を入れ替えるときも編集はこの1箇所）。
export const CLAUDE_OPUS_MODEL = 'claude-opus-5';
export const CLAUDE_OPUS_MODEL_LABEL = 'Opus 5';
/** 1世代前のOpus。比較枠に残して「上位モデルの世代差」も見えるようにする */
export const CLAUDE_OPUS_PREV_MODEL = 'claude-opus-4-8';
export const CLAUDE_OPUS_PREV_MODEL_LABEL = 'Opus 4.8';

// 241: 3.6 Flash → 3.7 Flash。ListModels（v1beta）と generateContent の疎通で実在確認済み。
export const GEMINI_TEXT_MODEL = 'gemini-3.7-flash';

// UI表示用ラベル（チップ・セレクタ・画面説明文で共通使用）
export const GEMINI_TEXT_MODEL_LABEL = 'Gemini 3.7 Flash';

// Gemini 3.x は思考(thinking)が既定ONで、思考トークンが maxOutputTokens の枠を消費する
// （枠が小さいと本文が空になる。166で経験済み・178で実測再確認）。
// 旧SDK @google/generative-ai v0.24 は thinkingConfig の型を持たないが、
// generationConfig はRESTへそのまま素通しされるため下記オブジェクトの spread で制御できる（実測済み）。
//
// ⚠️ 241で判明した 3.7 の仕様変更（実測）:
//   - `thinkingLevel: 'minimal'` は **400 INVALID_ARGUMENT**（"Thinking level MINIMAL is not
//     supported for this model"）。3.7 で使えるのは low / medium / high の3段階のみ。
//     'off' / 'none' も無効値で400。
//   - `thinkingBudget: 0` は 3.7 では200で通るが thoughts は0にならず（実測134〜142）、
//     しかも 3.6 では400になる。**minimal の代替にはならないので使わない**。
//   - つまり 3.7 には「思考を0にする手段が無い」。low でも thoughts は 0〜250 変動する。
//     小さい枠のまま 3.6/minimal 相当のつもりで呼ぶと MAX_TOKENS で本文が切れる（実測再現）。
//     枠を切る側は必ず geminiMaxTokens() で思考分を上乗せすること。
// 使い分け:
//   low     … 機械的な小タスク（分類・タイトル・短文）＋通常タスクの既定＝3.7の実質最小
//   medium  … 長文リサーチ・記事生成など品質優先箇所で明示指定
export const GEMINI_TEXT_THINKING_LOW = { thinkingConfig: { thinkingLevel: 'low' } };
export const GEMINI_TEXT_THINKING_MEDIUM = { thinkingConfig: { thinkingLevel: 'medium' } };

/** 思考トークンの実測上限（241: low で最大247・medium で294を観測）に余裕を持たせた予備枠 */
export const GEMINI_THINKING_RESERVE = 1024;

/**
 * Gemini の maxOutputTokens に思考分を上乗せする（241）。
 * 呼び出し側が指定する枠は「本文に使いたい量」なので、思考で食われる分をここで足す。
 * 3.7 は思考を0にできないため、小枠（〜1000）の呼び出しでは特に必須。
 */
export function geminiMaxTokens(maxTokens: number): number {
  return maxTokens + GEMINI_THINKING_RESERVE;
}
