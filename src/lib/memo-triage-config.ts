// AIメモ triage の「判定基準」を一元集約する設定モジュール。
// ルブリック(重要度/緊急度の定義) + 少数事例(few-shot) + 象限しきい値 + フォールバック値 を
// ここだけで管理し、以後のチューニングを memo-db.ts 本体を触らず低コストで行えるようにする。
//
// 設計思想(院長の理念 / 7つの習慣):
//   - 重要度 = ユーザーの目標(memo_goals)への寄与度(インサイドアウト=自分の目標起点)
//   - 緊急度 = 締切・時間感応
//   - 第2象限(重要×非緊急)を埋もれさせず明確に拾う
//   - 象限はAIに直接言わせず、importance/urgency から後処理で確定して安定させる

// ============================================================
// 象限しきい値(微調整はこの2値で完結)
//   これ「以上」を高(重要/緊急)とみなす。
// ============================================================
export const IMPORTANCE_HIGH = 4; // importance がこれ以上で「重要」
export const URGENCY_HIGH = 4; // urgency がこれ以上で「緊急」

/**
 * 重要度×緊急度 → 象限を後処理で確定(AIの直接出力より安定)。
 *   重要(≥IMPORTANCE_HIGH) × 緊急(≥URGENCY_HIGH) = Q1(緊急対応)
 *   重要(≥IMPORTANCE_HIGH) × 非緊急(<URGENCY_HIGH) = Q2(最重視・埋もれさせない)
 *   非重要(<IMPORTANCE_HIGH) × 緊急(≥URGENCY_HIGH) = Q3(割り込み・要委譲/効率化)
 *   それ以外 = Q4(削減候補)
 */
export function deriveQuadrant(importance: number, urgency: number): 1 | 2 | 3 | 4 {
  const important = importance >= IMPORTANCE_HIGH;
  const urgent = urgency >= URGENCY_HIGH;
  if (important && urgent) return 1;
  if (important && !urgent) return 2;
  if (!important && urgent) return 3;
  return 4;
}

// ============================================================
// フォールバック値
// ============================================================
// AI全体失敗(パース不能)時の既定。埋もれさせない保守的設定(重要寄り→Q2)。
// status は inbox のままにするため、再整理を促しつつ象限ビューでも見える。
export const TRIAGE_FAIL_FALLBACK = { importance: 4, urgency: 1 } as const;

// 個別フィールドが欠落/範囲外のときの中庸デフォルト(clamp用)。
// Q4(削減)へ機械的に落とさず、中庸に保つ。
export const FIELD_DEFAULT = { importance: 3, urgency: 2 } as const;

// ============================================================
// ルブリック(プロンプトに明示する判定基準)
// ============================================================
export const RUBRIC = `# 判定ルール(ルブリック)
- importance(1..5) = 上記「ユーザーの目標」への寄与度(インサイドアウト=自分の目標起点で評価)。
  - 5: 設定目標を直接・大きく前進させる中核行動
  - 4: 目標を前進させる(中核ではないが明確に寄与)
  - 3: 目標に間接的に寄与
  - 2: ほぼ寄与しない雑務・消費
  - 1: 目標と無関係
  - ※重要: 目標に資する行動は、緊急でなくても importance を必ず 4以上 にする(第2象限を埋もれさせない)。
- urgency(1..5) = 締切・時間感応。
  - 5: 明確な近い締切/時間限定(「今日」「明日」「期限」「〜まで」「すぐ」、具体的な日付)
  - 3: 期日はあるが余裕がある/時期依存
  - 1: 締切なし・いつでもよい
- goal_ref: 最も寄与する目標の title をそのまま記載(該当なしは空文字。その場合 importance は低めにする)。
- kind: 行動が必要=task / 着想=idea / 記録=note / 情報源・資料=reference。
- todos: kind=task のときのみ具体的な実行ステップを2〜5個。それ以外は空配列[]。
- category: 既存カテゴリになるべく寄せる。合うものが無ければ新規名を提案し is_new_category=true(乱立防止)。
- summary: 後で思い出せる一言要約。reason: 重要度/緊急度の根拠を短く。
- ※象限(quadrant)はシステムが importance/urgency から確定するため、あなたは importance/urgency の評価精度に集中すること。`;

// ============================================================
// 少数事例(few-shot)
//   誤りやすい境界、特に「重要だが締切なし=第2象限」を必ず拾うことを学習させる。
//   ※院長の文脈(クリニック運営・選択理論/アチーブメント)に合う例へ差し替え可。
// ============================================================
export const FEWSHOT = `# 判定例(特に「重要だが締切なし=第2象限」を必ず拾う)
- 目標「親への定期連絡を習慣化したい」/ メモ「父に電話する」
  → importance=4, urgency=1(目標に資する・締切なし → 第2象限)
- 目標「年内に学会発表する」/ メモ「明日までに抄録を提出する」
  → importance=5, urgency=5(中核行動・締切明確 → 第1象限)
- 目標と関連なし / メモ「領収書の山を今日中に片付ける」
  → importance=2, urgency=4(目標寄与は薄いが締切あり → 第3象限)
- 目標と関連なし / メモ「なんとなくSNSを見る時間を作る」
  → importance=1, urgency=1(目標と無関係・締切なし → 第4象限)
- 目標「学び続ける」/ メモ「読みたい本リストを作る」
  → importance=4, urgency=1(後回しにされがちだが目標に資する第2象限を明示的に拾う)`;

// AI に返させる JSON の形(前後に説明を付けず、これ「のみ」を返させる)。
export const TRIAGE_JSON_SCHEMA = `{"kind":"task|idea|note|reference","category":"カテゴリ名","is_new_category":true,"importance":1,"urgency":1,"quadrant":2,"goal_ref":"目標title","summary":"…","reason":"…","todos":["…"]}`;

// ============================================================
// プロンプト組み立て(本体はここに集約)
// ============================================================
interface GoalLike {
  title: string;
  domain?: string | null;
  detail?: string | null;
}

export function buildTriagePrompt(rawText: string, goals: GoalLike[], categoryNames: string[]): string {
  const goalLines = goals.length
    ? goals.map((g) => `- ${g.title}${g.domain ? `（分野:${g.domain}）` : ''}${g.detail ? ` … ${g.detail}` : ''}`).join('\n')
    : '（目標が未設定です。一般的な重要度で判断し、importance は中庸に寄せてください）';
  const catList = categoryNames.length ? categoryNames.join(' / ') : '（既存カテゴリなし）';

  return `あなたは「7つの習慣」の時間管理マトリックスに基づき、ユーザーのメモを目標から逆算して仕分けるアシスタントです。

# ユーザーの目標(重要度を逆算する基準)
${goalLines}

# 既存カテゴリ(なるべくこの中から選ぶ。合うものが無ければ新規名を提案)
${catList}

# 判定するメモ
"""
${rawText}
"""

${RUBRIC}

${FEWSHOT}

以下のJSONのみを返してください(前後に説明文・コードブロック記号(\`\`\`)を付けない):
${TRIAGE_JSON_SCHEMA}`;
}
