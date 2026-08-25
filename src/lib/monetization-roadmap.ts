// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗺 収益化ロードマップ（指示書268・決定的ロジック＝AI不使用）
// - フェーズ判定とタスク導出は**決定的**に行う（同じ入力→常に同じ出力。「淡々と実行する」ための一貫性）
// - 成果を断定する文言（「必ず増える」等）を出力しない。出すのは〈現在地・次にやること・通過条件〉のみ
// - 根拠: KB v2.0 C-03（成長順路）N-11（価格戦略）N-14（ポートフォリオ）NP-03/NP-04（数量限定・価格上限）
//         C-04（週次運用）PART-S（最初の30日）PART-A（医療領域: Kindle=広い入口/note=深い実務知）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RoadmapInputs {
  /** note記事の総本数（📚リサーチ保存 type='note-article' から自動取得） */
  freeArticleCount: number;
  /** 有料記事の本数（手入力・noteの管理画面の値） */
  paidArticleCount: number;
  /** フォロワー数（手入力・X） */
  followerCount: number;
  /** 有料記事の購入数の累計（手入力・note） */
  purchaseCount: number;
  /** メンバーシップを開設済み（手入力トグル） */
  membershipOpen: boolean;
  /** 定期購読マガジン／高単価（〜10万円）／B2Bのいずれかを開始済み（手入力トグル） */
  subscriptionStarted: boolean;
}

export const EMPTY_ROADMAP_INPUTS: RoadmapInputs = {
  freeArticleCount: 0,
  paidArticleCount: 0,
  followerCount: 0,
  purchaseCount: 0,
  membershipOpen: false,
  subscriptionStarted: false,
};

export type RoadmapPhase = 0 | 1 | 2 | 3 | 4;

export interface RoadmapTask {
  /** 頻度ラベル（毎日／週1〜2本／週末／週1回／月1回／このフェーズで） */
  cadence: string;
  text: string;
  /** 発信ハブ内の該当タブへ切り替える場合のタブキー */
  featureKey?: 'persona' | 'split' | 'xpost' | 'strategy' | 'schedule';
  /** 別画面への導線 */
  href?: string;
  linkLabel?: string;
}

export interface PhaseDef {
  phase: RoadmapPhase;
  emoji: string;
  label: string;
  /** このフェーズの位置づけ（1行・断定なし） */
  summary: string;
  tasks: RoadmapTask[];
  /** 次フェーズへの通過条件（数値・状態で明示） */
  passCondition: string;
}

// C-04 の週次運用モデル（全フェーズ共通の土台。フェーズ別タスクの前に出す）
const WEEKLY_BASE: RoadmapTask[] = [
  { cadence: '毎日', text: 'Xのゴールデンタイム（朝7:00〜8:30／夜18:00〜21:00）に投稿し、投稿後30分はリプライに即応する', featureKey: 'xpost', linkLabel: '🐦 X投稿を作る' },
  { cadence: '週1〜2本', text: '辞書型・体系化ポスト（保存・共有狙いのミニ講義）を投入する', featureKey: 'xpost', linkLabel: '🐦 ノウハウ体系化型で作る' },
  { cadence: '週末', text: 'note記事を2〜3本書き溜め、平日の朝7:30または夜20:30に予約投稿をセットする', featureKey: 'schedule', linkLabel: '🗓 予約投稿カレンダー' },
  { cadence: '週1回', text: 'Xアナリティクス（上位/下位20%のフック比較）とnoteダッシュボード（PV・スキ率）を確認する' },
];

export const PHASE_DEFS: Record<RoadmapPhase, PhaseDef> = {
  0: {
    phase: 0,
    emoji: '🌱',
    label: '土台づくり',
    summary: '無料記事とXの毎日投稿で、反応が集まるテーマを探す時期',
    tasks: [
      ...WEEKLY_BASE,
      { cadence: 'このフェーズで', text: 'DR記事からペルソナ別のnote記事を作って無料公開する', featureKey: 'persona', linkLabel: '✍️ ペルソナ別note記事' },
      { cadence: 'このフェーズで', text: '反応（インプレッション・ブックマーク・URL共有）を記事ごとに記録し、集まるテーマを探す（下の「有料化候補」に入力）' },
    ],
    passCondition: '反応が集まるテーマが1つ見える（有料化候補の上位が入れ替わらなくなったら目安）',
  },
  1: {
    phase: 1,
    emoji: '💰',
    label: '最初の有料記事',
    summary: '需要が見えたテーマを300〜800円・数量限定20〜30部で有料化する時期',
    tasks: [
      ...WEEKLY_BASE,
      { cadence: 'このフェーズで', text: '反応上位のテーマを有料記事にする（無料60〜70%＋有料30〜40%。有料エリアには5分で使える成果物を必ず入れる）', featureKey: 'persona', linkLabel: '✍️ 記事を作る' },
      { cadence: 'このフェーズで', text: '「初版◯部は500円、完売後1,000円」のように段階的値上げを先に宣言して数量限定で出す' },
      { cadence: 'このフェーズで', text: 'X連動ポスト（要点3〜5個の箇条書き＋リプにURL）で告知する', featureKey: 'xpost', linkLabel: '🐦 告知ポストを作る' },
    ],
    passCondition: '有料記事が3〜5本たまる（あと{remainingToPhase2}本で次のフェーズ）',
  },
  2: {
    phase: 2,
    emoji: '📚',
    label: 'マガジン化 ／ Kindle出版（2トラック並行）',
    summary: '同じ記事群を「noteマガジン=深い実務知の有料化」と「Kindle=広い入口づくり」の両方に使う時期',
    tasks: [
      ...WEEKLY_BASE,
      { cadence: 'このフェーズで', text: '有料記事3〜5本を買い切りマガジンに束ねる（個別購入より20〜30%割安に設定）' },
      { cadence: 'このフェーズで', text: '記事群を素材にKindle本を作る（広い入口づくり。noteとの二段構え）', href: '/dashboard/kindle-wizard', linkLabel: '📕 Kindleウィザードへ' },
      { cadence: 'このフェーズで', text: 'noteのAmazonウィジェットにKindle著作を登録し、note⇄Kindleの相互導線を作る（noteの設定画面での手作業）' },
      { cadence: '月1回', text: '記事の追記・リライト・価格見直し（完売した記事は次の段階へ値上げ）' },
    ],
    passCondition: '購入者と読者が積み上がる（購入数・フォロワーの推移が続いていること）',
  },
  3: {
    phase: 3,
    emoji: '🤝',
    label: 'メンバーシップ',
    summary: '月500／1,500／5,000円の多階層で、交流と限定コンテンツをストック収益にする時期',
    tasks: [
      ...WEEKLY_BASE,
      { cadence: 'このフェーズで', text: 'メンバーシップの階層設計（ライト=限定記事／スタンダード=交流会／プレミアム=個別対応）を決めて開設する' },
      { cadence: 'このフェーズで', text: '制作の裏側共有・メンバー同士の交流など、一方的な配信にしない仕掛けを入れる' },
      { cadence: '月1回', text: '記事の追記・リライト・価格見直し' },
    ],
    passCondition: '毎月の更新が回せると確信できる（配信頻度が臨床業務と両立できている）',
  },
  4: {
    phase: 4,
    emoji: '🏔',
    label: '定期購読・高単価・B2B',
    summary: '定期購読マガジン／高単価講座（上限10万円）／B2B展開の時期',
    tasks: [
      ...WEEKLY_BASE,
      { cadence: 'このフェーズで', text: '定期購読マガジン（要開設申請）や、体系化カリキュラムの高単価商品（〜10万円）を設計する' },
      { cadence: 'このフェーズで', text: 'noteをポートフォリオとして執筆・講演・研修などのB2B案件につなげる' },
      { cadence: '月1回', text: '記事の追記・リライト・価格見直し' },
    ],
    passCondition: '—（このロードマップの最終フェーズ）',
  },
};

/** §6-1: フェーズ3・4で必ず併記する継続負荷の警告（文言は指示書268の指定どおり） */
export const CONTINUITY_WARNING =
  'メンバーシップ・定期購読は毎月の更新が必須です。開始前に、臨床業務と両立できる配信頻度と、続けられなくなった場合の撤退手順を決めてください。読者が付いてから畳む方が、付かないより負担が大きくなります。';

/** §1-4: 成果を約束しない注意書き（表示・コピーの両方に必ず付ける） */
export const ROADMAP_DISCLAIMER =
  '※ このロードマップは「次にやること」の整理であり、成果（読者数・購入数・収益）を約束するものではありません。通過条件の数値はKBの実践知見（二次情報）に基づく目安で、自分の実測で補正してください。';

/**
 * フェーズ判定（決定的）。判定根拠も一緒に返す＝「なぜこのフェーズか」を画面に出せる。
 * - 0: 有料記事なし ／ 1: 有料1〜2本 ／ 2: 有料3本以上 ／ 3: メンバーシップ開設済み ／ 4: 定期購読・高単価開始済み
 */
export function judgePhase(inputs: RoadmapInputs): { phase: RoadmapPhase; reasons: string[] } {
  const paid = Math.max(0, Math.floor(inputs.paidArticleCount || 0));
  if (inputs.subscriptionStarted) {
    return { phase: 4, reasons: ['定期購読・高単価・B2Bのいずれかを開始済み'] };
  }
  if (inputs.membershipOpen) {
    return { phase: 3, reasons: ['メンバーシップを開設済み'] };
  }
  if (paid >= 3) {
    return { phase: 2, reasons: [`有料記事が${paid}本（3本以上＝マガジン化・Kindle化の素材がある）`] };
  }
  if (paid >= 1) {
    return { phase: 1, reasons: [`有料記事が${paid}本（1〜2本＝実績づくりの途中）`] };
  }
  return { phase: 0, reasons: ['有料記事がまだない'] };
}

/** 通過条件の文中プレースホルダを実値で埋める（フェーズ1の「あと◯本」） */
export function passConditionText(def: PhaseDef, inputs: RoadmapInputs): string {
  const remaining = Math.max(0, 3 - Math.max(0, Math.floor(inputs.paidArticleCount || 0)));
  return def.passCondition.replace('{remainingToPhase2}', String(remaining));
}

// ── §4: 有料化候補の抽出（決定的な並び替え） ─────────────────────────────
// スコアは X-02 の重み付けに基づく: URL共有=いいねの約40倍相当（最重要）、ブックマークも強化済み。
// インプレッションは桁が大きいので薄く効かせる（順位の同点解消用）。
export interface ArticleReaction {
  impressions: number;
  bookmarks: number;
  shares: number;
}

export function reactionScore(r: ArticleReaction): number {
  return (r.shares || 0) * 40 + (r.bookmarks || 0) * 3 + (r.impressions || 0) / 1000;
}

/** 反応値の降順に並べる（同スコアは元の順を保つ＝安定ソート） */
export function rankPaidCandidates<T extends { reaction: ArticleReaction }>(items: T[]): T[] {
  return [...items].sort((a, b) => reactionScore(b.reaction) - reactionScore(a.reaction));
}

// ── リッチコピー用のMarkdown（貼り付け先は手元のメモ＝Word体裁の既定ヘルパーでよい） ──
export function roadmapToMarkdown(
  def: PhaseDef,
  inputs: RoadmapInputs,
  reasons: string[],
): string {
  const lines = [
    `# 収益化ロードマップ — 現在地: フェーズ${def.phase}「${def.label}」`,
    '',
    `## 現在地の根拠`,
    ...reasons.map((r) => `- ${r}`),
    `- note記事（無料含む）: ${inputs.freeArticleCount}本 ／ 有料記事: ${inputs.paidArticleCount}本 ／ フォロワー: ${inputs.followerCount} ／ 購入累計: ${inputs.purchaseCount}`,
    '',
    `## 今フェーズでやること`,
    ...def.tasks.map((t) => `- 【${t.cadence}】${t.text}`),
    '',
    `## 次フェーズへの通過条件`,
    `- ${passConditionText(def, inputs)}`,
  ];
  if (def.phase >= 3) {
    lines.push('', `## ⚠️ 継続負荷の警告`, CONTINUITY_WARNING);
  }
  lines.push('', ROADMAP_DISCLAIMER);
  return lines.join('\n');
}
