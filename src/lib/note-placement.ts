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

function numberedBlocks(blocks: string[]): string {
  return blocks.map((b, i) => `[${i}] ${b.length > 400 ? `${b.slice(0, 400)}…` : b}`).join('\n\n');
}

// 228a（改訂）: AI画像は「冒頭イメージ1枚」が既定。evidence/rest のAI挿絵は自動提案しない
// （中盤の裏づけ・休憩は図表=プログラム描画が主力。手動追加は引き続き可能）。
export function buildPlacementPrompt(opts: {
  title: string;
  blocks: string[];
  maxImages: number;
}): { system: string; prompt: string } {
  const { title, blocks } = opts;

  const system = `あなたは医療クリニックの広報デザイナー兼マーケティング編集者です。note記事のどこに画像を置くと読了率・理解が上がるかを、心理学・マーケティングの原則に基づいて提案します。`;

  const prompt = `以下のnote記事に対して、画像の挿入位置を提案してください。

# 判断の土台（効果的表現の観点10原則）
${KINDLE_PROOFREAD_PRINCIPLES}

${NOTE_ENHANCE_RULES}

# 配置スロットの種類（slot はこの4種のみ）
${slotGuide}

# 配置の作り方（AI生成画像は冒頭イメージ1枚に限定＝既定方針）
- hook（AIイメージ画像）は最多1件・冒頭（ブロック0〜1）のみ
- cta（まとめ画像）は最多1件・結び直前
- evidence / rest はAI画像では提案しない（図表=プログラム描画が主力のため。ここでは出力しない）
- afterBlock は下記「本文ブロック」の番号（そのブロックの直後に挿入する）
- purpose はその位置に置く理由（読者に起きる効果）を1文で
- principle は観点10原則のうち根拠となる原則名を1つ
- prompt は挿絵の画像生成プロンプト（日本語・具体的な情景。cta のときは空文字にする）
  画像プロンプトの作り方:
${imagePromptRules('記事')}

# 記事タイトル
${title || '（無題）'}

# 本文ブロック（[番号] 本文）
${numberedBlocks(blocks)}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "placements": [ { "slot": "hook|cta", "afterBlock": 0, "purpose": "理由", "principle": "原則名", "prompt": "画像プロンプト（ctaは空文字）" } ] }`;

  return { system, prompt };
}

// 228a: 図表候補の抽出プロンプト。本文から図表化できる構造（手順・比較・Q&A・前後の変化）を
// 見つけ、描画データ（title/groups）と挿入位置を提案する。文言は本文由来のみ（編集可能な下書き）。
export function buildFiguresPrompt(opts: {
  title: string;
  blocks: string[];
  maxFigures: number;
}): { system: string; prompt: string } {
  const { title, blocks, maxFigures } = opts;

  const system = `あなたは医療記事の編集者兼インフォグラフィックデザイナーです。note記事の本文から「図表にすると理解が深まる構造」を見つけて、図表の描画データを設計します。図表の文言は本文の記述だけを使います。`;

  const prompt = `以下のnote記事から、図表化できる構造を抽出してください。

# 判断の土台（効果的表現の観点10原則）
${KINDLE_PROOFREAD_PRINCIPLES}

${NOTE_ENHANCE_RULES}

# 図表テンプレの種類（template はこの4種のみ）
- steps: 手順ステップ図。groups は1つ・points が上から順のステップ（3〜6個・各40字以内）
- compare: 比較表。groups=列（2〜3列）・heading が列名・points が各列の特徴（各18字前後）
- qa: Q&Aカード。groups=1問ずつ（1〜4問）・heading が質問・points が回答（1〜3行）
- beforeafter: ビフォーアフター枠。groups は必ず2つ（[0]=変化前・[1]=変化後）・heading がラベル。
  ※生活習慣・考え方・手順の変化のみ。患者の治療前後・症状/効果の対比には絶対に使わない（医療広告配慮）

# 抽出の作り方
- 提案は最大${maxFigures}件。図表化に向く構造が本文に無ければ少なくてよい（無理に作らない）
- 文言はすべて本文の記述の言い換え・要約のみ（本文にない事実・数値・手順を加えない）
- afterBlock は図表を挿入するブロック番号（その構造を説明しているブロックの直後）
- purpose は図表にする理由（読者に起きる効果）を1文、principle は根拠の原則名を1つ

# 記事タイトル
${title || '（無題）'}

# 本文ブロック（[番号] 本文）
${numberedBlocks(blocks)}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "figures": [ { "template": "steps|compare|qa|beforeafter", "title": "図表の見出し", "afterBlock": 0, "purpose": "理由", "principle": "原則名", "groups": [ { "heading": "列名/質問/ラベル（stepsは省略可）", "points": ["行1", "行2"] } ] } ] }`;

  return { system, prompt };
}
