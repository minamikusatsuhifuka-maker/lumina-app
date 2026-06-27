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
- due_at: メモ本文に期日・予定・日時の言及があれば、「現在日時」を基準に ISO8601(タイムゾーンは必ず +09:00 / Asia/Tokyo)で絶対日時に解決する。
  - 相対表現(今日/明日/明後日/今週金曜/来週月曜/N日後/今日中/今週中/週末/月末 等)は現在日時から算出する。
  - 絶対表現(6/25, 6/25まで, 2026-07-01, 15:00, 来週月曜10:00 等)はそのまま解決する。年の記載が無ければ、現在日時から見て最も近い未来の同月日にする。
  - 時刻の指定があれば has_time:true(その時刻を反映。例 "明日15時"→T15:00:00+09:00)。日付のみで時刻が無ければ has_time:false(時刻は 00:00:00+09:00 とする)。
  - 期日・日時の言及がまったく無い場合は due_at:null, has_time:false。
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
export const TRIAGE_JSON_SCHEMA = `{"kind":"task|idea|note|reference","category":"カテゴリ名","is_new_category":true,"importance":1,"urgency":1,"quadrant":2,"goal_ref":"目標title","summary":"…","reason":"…","todos":["…"],"due_at":"2026-06-25T15:00:00+09:00 または null","has_time":false}`;

// ============================================================
// プロンプト組み立て(本体はここに集約)
// ============================================================
interface GoalLike {
  title: string;
  domain?: string | null;
  detail?: string | null;
}

// 126: このユーザーが過去に手修正した象限の例(動的few-shot)。
//   静的FEWSHOTのベースに「このユーザーの感覚」を上乗せして学習させる。
export interface CorrectionExample {
  rawText: string;
  quadrant: 1 | 2 | 3 | 4;
}
const QUAD_LABEL: Record<number, string> = { 1: '第1象限(重要×緊急)', 2: '第2象限(重要×非緊急)', 3: '第3象限(非重要×緊急)', 4: '第4象限(非重要×非緊急)' };

// 訂正例セクションを組み立て。件数・1件あたり文字数に上限(プロンプト肥大/truncation防止=v17の教訓)。
function buildCorrectionSection(corrections: CorrectionExample[]): string {
  const items = corrections
    .filter((c) => c.rawText && c.rawText.trim() && c.quadrant >= 1 && c.quadrant <= 4)
    .slice(0, 5) // 最大5件
    .map((c) => `- 「${c.rawText.replace(/\s+/g, ' ').trim().slice(0, 50)}」→ ${QUAD_LABEL[c.quadrant]}`);
  if (items.length === 0) return '';
  return `\n# このユーザー自身の訂正例(あなたの一般則よりこの人の感覚を優先して学ぶ)
${items.join('\n')}\n`;
}

/**
 * @param nowText 相対日時(明日/今週金曜 等)解決の基準となる「現在日時」(JST / Asia/Tokyo)。
 *                例: "2026-06-21(土) 14:30 JST(Asia/Tokyo, UTC+9)"。サーバ(Vercel=UTC)からJSTに変換して渡すこと。
 * @param corrections このユーザーが手修正した象限の直近例(動的few-shot・任意)。
 */
export function buildTriagePrompt(rawText: string, goals: GoalLike[], categoryNames: string[], nowText: string, corrections: CorrectionExample[] = [], criteriaBlock: string = ''): string {
  const goalLines = goals.length
    ? goals.map((g) => `- ${g.title}${g.domain ? `（分野:${g.domain}）` : ''}${g.detail ? ` … ${g.detail}` : ''}`).join('\n')
    : '（目標が未設定です。一般的な重要度で判断し、importance は中庸に寄せてください）';
  const catList = categoryNames.length ? categoryNames.join(' / ') : '（既存カテゴリなし）';
  const correctionSection = buildCorrectionSection(corrections);

  return `あなたは「7つの習慣」の時間管理マトリックスに基づき、ユーザーのメモを目標から逆算して仕分けるアシスタントです。

# 現在日時(相対表現の解決基準・タイムゾーンは Asia/Tokyo / UTC+9)
${nowText}

# ユーザーの目標(重要度を逆算する基準)
${goalLines}
${criteriaBlock}
# 既存カテゴリ(なるべくこの中から選ぶ。合うものが無ければ新規名を提案)
${catList}

# 判定するメモ
"""
${rawText}
"""

${RUBRIC}

${FEWSHOT}
${correctionSection}
以下のJSONのみを返してください(前後に説明文・コードブロック記号(\`\`\`)を付けない):
${TRIAGE_JSON_SCHEMA}`;
}
