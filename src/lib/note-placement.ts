// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// note記事の画像配置ルール（228）: 224の観点10原則を「配置」に応用する。
// /api/note-enhance/placement のプロンプトに注入するルールを一元管理する。
// 配置は自動提案のみ＝プレビューで位置調整・削除できる前提（完全自動固定にしない）。
// 誇張・不安煽り禁止は MEDICAL_AD_NG_RULES（8観点）を注入して担保する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { KINDLE_PROOFREAD_PRINCIPLES } from './kindle-proofread';
import { MEDICAL_AD_NG_RULES } from './medical-ad-check';
import { imagePromptRules } from './image-guards';
import { NOTE_PLACEMENT_SLOTS, NOTE_PLACEMENT_SLOT_KEYS } from './note-enhance';

// 配置提案プロンプトに注入する共通ルール（KINDLE_COMMON_RULES同等のnote版・緩和しない）
export const NOTE_ENHANCE_RULES = `# note強化の厳守事項
- まとめ・配置理由・画像プロンプトはすべて本文にある内容のみを根拠にする（新たな事実・数値・出典を作らない）
- 不安を煽る配置・誇張演出の提案は禁止。医療広告規制のNG表現（下記）に該当する演出をしない:
${MEDICAL_AD_NG_RULES}
- プレースホルダ（「ここに◯◯」等）を使わない
- 画像プロンプトはAI生成画像用＝画像内に文字・数字を入れる指示を書かない`;

// スロット定義のプロンプト表現（note-enhance.ts の定義から機械導出＝二重管理しない）
const slotGuide = NOTE_PLACEMENT_SLOT_KEYS.map((k) => {
  const s = NOTE_PLACEMENT_SLOTS[k];
  return `- ${s.key}: ${s.role}（根拠原則: ${s.principles}）`;
}).join('\n');

export function buildPlacementPrompt(opts: {
  title: string;
  blocks: string[];
  maxImages: number;
}): { system: string; prompt: string } {
  const { title, blocks, maxImages } = opts;
  const numbered = blocks
    .map((b, i) => `[${i}] ${b.length > 400 ? `${b.slice(0, 400)}…` : b}`)
    .join('\n\n');

  const system = `あなたは医療クリニックの広報デザイナー兼マーケティング編集者です。note記事のどこに画像を置くと読了率・理解が上がるかを、心理学・マーケティングの原則に基づいて提案します。`;

  const prompt = `以下のnote記事に対して、画像の挿入位置を提案してください。

# 判断の土台（効果的表現の観点10原則）
${KINDLE_PROOFREAD_PRINCIPLES}

${NOTE_ENHANCE_RULES}

# 配置スロットの種類（slot はこの4種のみ）
${slotGuide}

# 配置の作り方
- 提案は最大${maxImages}件（挿絵 hook/evidence/rest）＋ cta は最多1件。少ない方が良ければ無理に増やさない
- afterBlock は下記「本文ブロック」の番号（そのブロックの直後に挿入する）
- purpose はその位置に置く理由（読者に起きる効果）を1文で
- principle は観点10原則のうち根拠となる原則名を1つ
- prompt は挿絵の画像生成プロンプト（日本語・具体的な情景。cta のときは空文字にする）
  画像プロンプトの作り方:
${imagePromptRules('記事')}
- 同じブロックに2枚置かない。冒頭（ブロック0〜1）に hook、結び直前に cta を優先的に検討する

# 記事タイトル
${title || '（無題）'}

# 本文ブロック（[番号] 本文）
${numbered}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "placements": [ { "slot": "hook|evidence|rest|cta", "afterBlock": 0, "purpose": "理由", "principle": "原則名", "prompt": "画像プロンプト（ctaは空文字）" } ] }`;

  return { system, prompt };
}
