// Geminiテキスト生成モデルの一元管理（178）
// 次回のモデル移行はこのファイルの変更だけで完結させる（API呼び出し・UI表示とも定数参照）。
// 対象外: 画像生成（lib/image-providers）・speech-to-text・Claude系（別管理）。

export const GEMINI_TEXT_MODEL = 'gemini-3.6-flash';

// UI表示用ラベル（チップ・セレクタ・画面説明文で共通使用）
export const GEMINI_TEXT_MODEL_LABEL = 'Gemini 3.6 Flash';

// 3.6 Flash は思考(thinking)が既定 medium で、思考トークンが maxOutputTokens の枠を消費する
// （枠が小さいと本文が空になる。166で経験済み・178で実測再確認）。
// 旧SDK @google/generative-ai v0.24 は thinkingConfig の型を持たないが、
// generationConfig はRESTへそのまま素通しされるため下記オブジェクトの spread で制御できる（実測済み）。
// 使い分け:
//   minimal … 機械的な小タスク（分類・タイトル・短文）。thoughts=0 で枠を全て本文に使える
//   low     … 起案・差分抽出など通常タスクの既定（速度優先・思考200〜650程度）
//   medium  … 長文リサーチ・記事生成など品質優先箇所で明示指定（3.6の既定と同じ）
export const GEMINI_TEXT_THINKING_MINIMAL = { thinkingConfig: { thinkingLevel: 'minimal' } };
export const GEMINI_TEXT_THINKING_LOW = { thinkingConfig: { thinkingLevel: 'low' } };
export const GEMINI_TEXT_THINKING_MEDIUM = { thinkingConfig: { thinkingLevel: 'medium' } };
