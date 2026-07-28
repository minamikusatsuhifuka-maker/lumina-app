// 192: カテゴリ語彙の統制。
// AIの自動カテゴライズが毎回自由にカテゴリ名を作って乱立していたため、
// 「正規カテゴリの一覧」をここに一元管理し、AIはこの一覧から選ぶだけにする
// （183のバズりパターン辞書「辞書外は渡せない」と同じ方針）。
// 対象: text_analysis_saves.folder / context_saves.category の2系統。
// （library.group_name は保存元機能名のグループで用途が違うため対象外）

// 正規カテゴリ（グループはUI表示・プロンプト提示用。カテゴリ名自体が保存値）
export const CATEGORY_GROUPS: Array<{ group: string; categories: string[] }> = [
  { group: '医療・クリニック', categories: ['クリニック経営', '皮膚・美容医療', '健康・予防医学', '栄養・サプリ'] },
  { group: '製品・研究', categories: ['ニナファーム', 'ミトコンドリア・抗酸化'] },
  { group: '組織・人材', categories: ['組織マネジメント', 'リーダーシップ', '人材育成', '採用・評価', 'コミュニケーション'] },
  { group: '学習・セミナー', categories: ['ATC・JPSA', '選択理論', '能力開発セミナー'] },
  { group: 'AI・技術', categories: ['AI動向', 'AI活用・ツール', 'DX・セキュリティ'] },
  { group: '経営・お金', categories: ['経営戦略・事例', '税務・年金・相続', '投資・資産形成', '収益化・副業'] },
  { group: '思考・生き方', categories: ['心理・メンタル', '成功哲学', '哲学・思想', 'ウェルビーイング', 'キャリア'] },
  { group: '発信', categories: ['SNS・コンテンツ発信'] },
];

// 一覧に無い概念の受け皿（勝手にカテゴリを増やさない）
export const OTHER_CATEGORY = 'その他';

// システム由来のカテゴリ（AIの選択肢に出さない・マージ対象外・rename禁止は既存実装どおり）
export const SYSTEM_CATEGORIES = ['横断まとめ'];

// フラットな正規一覧（その他を含む。AIへの提示・サーバ側検証の両方でこれを使う）
export const CANONICAL_CATEGORIES: string[] = [
  ...CATEGORY_GROUPS.flatMap((g) => g.categories),
  OTHER_CATEGORY,
];

// 旧カテゴリ → 正規カテゴリのマージマップ（192実施時点の本番実データ全種を網羅）。
// 未分類（text_analysis_saves.folder='' / context_saves.category='general'）は
// 「未分類のまま維持」が仕様のためマップに含めない。
export const CATEGORY_MERGE_MAP: Record<string, string> = {
  // --- 組織・人材 ---
  '組織・人材管理': '組織マネジメント',
  '組織・マネジメント': '組織マネジメント',
  '組織・人事管理': '組織マネジメント',
  'マネジメント技術': '組織マネジメント',
  '組織作り': '組織マネジメント',
  '組織文化・人事': '組織マネジメント',
  '組織・リーダーシップ': 'リーダーシップ',
  '地域・行政リーダー': 'リーダーシップ',
  '人材育成・哲学': '人材育成',
  '人間関係・対人': 'コミュニケーション',
  // --- AI・技術 ---
  'AI動向・戦略': 'AI動向',
  'AI動向・ツール': 'AI動向',
  'AI・テクノロジー': 'AI動向',
  'AI経営・組織論': 'AI動向',
  'AI倫理・社会論': 'AI動向',
  'AIで変わる': 'AI動向',
  'AI活用・開発': 'AI活用・ツール',
  '知識管理・ツール': 'AI活用・ツール',
  'gemma4': 'AI活用・ツール',
  'claude code技': 'AI活用・ツール',
  'DX・デジタル変革': 'DX・セキュリティ',
  'SaaS・DX': 'DX・セキュリティ',
  'セキュリティ': 'DX・セキュリティ',
  // --- 学習・セミナー ---
  'ATC・JPSA記録': 'ATC・JPSA',
  'ATCセミナー詳細': 'ATC・JPSA',
  'ATCセミナー記録': 'ATC・JPSA',
  '選択理論実践': '選択理論',
  // --- 医療・クリニック ---
  '医療クリニック経営': 'クリニック経営',
  '健康・医療科学': '健康・予防医学',
  '健康・医療': '健康・予防医学',
  '健康・長寿科学': '健康・予防医学',
  '生活習慣・予防医療': '健康・予防医学',
  '整形外科・関節': '健康・予防医学',
  '健康・美容医療': '皮膚・美容医療',
  '栄養・サプリ科学': '栄養・サプリ',
  '腸活・腸内環境': '栄養・サプリ',
  // --- 経営・お金 ---
  '経営者の挑戦事例': '経営戦略・事例',
  '経営・ビジネス戦略': '経営戦略・事例',
  '医療法人・税務': '税務・年金・相続',
  '資産・富裕層戦略': '投資・資産形成',
  'ブログ・Web収益化': '収益化・副業',
  'ビジネス・MLM': '収益化・副業',
  // --- 思考・生き方 ---
  '心理・行動科学': '心理・メンタル',
  '心理学・自己啓発': '心理・メンタル',
  '成功哲学・思想': '成功哲学',
  '7つの習慣・成功哲学': '成功哲学',
  'マインドセット': '成功哲学',
  '哲学・幸福論': '哲学・思想',
  '宗教・思想・哲学': '哲学・思想',
  '自己成長・生き方': 'キャリア',
  '働き方・キャリア': 'キャリア',
  'キャリア・自己成長': 'キャリア',
  // --- 発信 ---
  'コンテンツ発信': 'SNS・コンテンツ発信',
  'SNS・コンテンツ運用': 'SNS・コンテンツ発信',
  'SNS・育成事例': 'SNS・コンテンツ発信',
  'SEO・マーケ': 'SNS・コンテンツ発信',
  'AI時代のマーケティング': 'SNS・コンテンツ発信',
  // --- その他（少数・業務外・出所ラベル） ---
  '子育て・教育': OTHER_CATEGORY,
  '知財・法制度': OTHER_CATEGORY,
  'シームレス': OTHER_CATEGORY,
  '人': OTHER_CATEGORY,
  'ディープリサーチ': OTHER_CATEGORY,
  'deepresearch': OTHER_CATEGORY,
  '家電・生活情報': OTHER_CATEGORY,
};

// カテゴリ名を正規語彙へ正規化する。
// - 正規カテゴリそのもの／システムカテゴリ → そのまま返す
// - マージマップにあれば正規カテゴリへ変換
// - どれにも該当しなければ null（呼び出し側で「破棄」または「その他」に落とす）
export function normalizeCategory(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim();
  if (!name) return null;
  if (CANONICAL_CATEGORIES.includes(name)) return name;
  if (SYSTEM_CATEGORIES.includes(name)) return name;
  return CATEGORY_MERGE_MAP[name] ?? null;
}

// AIプロンプトに埋め込む正規一覧のテキスト（グループ見出しつき）
export function vocabularyPromptText(): string {
  return (
    CATEGORY_GROUPS.map((g) => `【${g.group}】${g.categories.join(' / ')}`).join('\n') +
    `\n【受け皿】${OTHER_CATEGORY}（上のどれにも当てはまらない場合のみ）`
  );
}

// 192③: 新カテゴリ抽出（ニナファーム/ミトコンドリア・抗酸化）の段階実行スキャン用定数。
// コスト概算は静的定数（152: AIに数値を書かせない）。
// 根拠: Claude Sonnet 5 = $3/MTok(in)・$15/MTok(out)、1件あたり入力 約250tok＋出力 約25tok
//       → 100件 ≒ $0.11 ≒ ¥17 → 余裕をみて「約¥20/100件」と表示する。
export const SCAN_TARGET_CATEGORIES = ['ニナファーム', 'ミトコンドリア・抗酸化'];
export const SCAN_BATCH_SIZE = 20;
export const SCAN_COST_YEN_PER_100 = 20;
