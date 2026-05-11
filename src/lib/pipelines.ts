// AIオーケストレーター用のパイプライン定義
// 既存APIのパラメータに合わせて inputMapper を構成

export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  apiEndpoint: string;
  dependsOn?: string[];
  estimatedSeconds: number;
  inputMapper: (
    intent: string,
    previousResults: Record<string, StepResult>,
  ) => Record<string, unknown>;
}

export interface Pipeline {
  id: string;
  label: string;
  icon: string;
  description: string;
  triggerKeywords: string[];
  steps: PipelineStep[];
}

export interface StepResult {
  result: string;
  status: 'completed' | 'failed';
}

// メンバー情報をテキストから抽出するヘルパー
function extractName(text: string): string | null {
  const match = text.match(/([^\s]{2,5})(さん|様|氏)/);
  return match ? match[1] : null;
}

function extractRole(text: string): string | null {
  const roles = ['看護師', '医師', '受付', 'スタッフ', 'エステ', '事務'];
  return roles.find((r) => text.includes(r)) ?? null;
}

function parseMemberInfo(intent: string) {
  return {
    name: extractName(intent) ?? '対象者',
    role: extractRole(intent) ?? '',
    department: '',
    current_level: '',
    notes: intent,
  };
}

export const PIPELINES: Pipeline[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 医療文書3点セット自動生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'medical_set',
    label: '🏥 医療文書3点セット',
    icon: '🏥',
    description:
      '施術名を入力するだけで同意書・説明書・アフターケアを自動生成',
    triggerKeywords: [
      '同意書',
      '説明書',
      'アフターケア',
      '医療文書',
      '施術',
    ],
    steps: [
      {
        id: 'research',
        label: '🔍 医学情報リサーチ',
        description: '最新の医学情報・リスク・エビデンスを調査',
        apiEndpoint: '/api/deepresearch',
        estimatedSeconds: 30,
        inputMapper: (intent) => ({
          topic: `${intent}の医学的根拠・リスク・副作用・最新エビデンス`,
          depth: 'standard',
        }),
      },
      {
        id: 'consent',
        label: '📄 同意書生成',
        description: '医学情報を元に同意書を生成',
        apiEndpoint: '/api/medical/generate',
        dependsOn: ['research'],
        estimatedSeconds: 40,
        inputMapper: (intent, prev) => ({
          docType: intent.includes('美容')
            ? 'consent_cosmetic'
            : 'consent_dermatology',
          procedureName: intent,
          researchText: prev.research?.result ?? '',
        }),
      },
      {
        id: 'explanation',
        label: '📋 患者説明書生成',
        description: '患者向けの分かりやすい説明書を生成',
        apiEndpoint: '/api/medical/generate',
        dependsOn: ['research'],
        estimatedSeconds: 40,
        inputMapper: (intent, prev) => ({
          docType: 'explanation',
          procedureName: intent,
          researchText: prev.research?.result ?? '',
        }),
      },
      {
        id: 'aftercare',
        label: '💊 アフターケア指導書生成',
        description: 'アフターケア・注意事項の指導書を生成',
        apiEndpoint: '/api/medical/generate',
        dependsOn: ['research'],
        estimatedSeconds: 40,
        inputMapper: (intent, prev) => ({
          docType: 'aftercare',
          procedureName: intent,
          researchText: prev.research?.result ?? '',
        }),
      },
      {
        id: 'legal_check',
        label: '⚖️ 法的・倫理チェック',
        description: 'インフォームドコンセント・医療倫理の観点で確認',
        apiEndpoint: '/api/orchestrator/check-legal',
        dependsOn: ['consent'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          docType: 'medical_consent',
          content: prev.consent?.result ?? '',
          procedureName: intent,
        }),
      },
      {
        id: 'plain_language',
        label: '📖 平易な言葉に変換',
        description: '専門用語を患者が理解しやすい表現に変換',
        apiEndpoint: '/api/orchestrator/simplify',
        dependsOn: ['explanation'],
        estimatedSeconds: 25,
        inputMapper: (_intent, prev) => ({
          content: prev.explanation?.result ?? '',
          targetAudience: '一般患者（医療知識なし）',
        }),
      },
      {
        id: 'qa_pairs',
        label: '❓ よくある質問を生成',
        description: '患者からの想定質問とその回答を自動生成',
        apiEndpoint: '/api/orchestrator/generate-qa',
        dependsOn: ['research'],
        estimatedSeconds: 30,
        inputMapper: (intent, prev) => ({
          topic: intent,
          researchText: prev.research?.result ?? '',
          count: 10,
        }),
      },
      {
        id: 'save_all',
        label: '💾 全文書を保存',
        description: '生成した3点を医療文書スタジオに保存',
        apiEndpoint: '/api/medical/bulk-save',
        dependsOn: ['consent', 'explanation', 'aftercare'],
        estimatedSeconds: 5,
        inputMapper: (intent, prev) => ({
          procedureName: intent,
          docs: [
            {
              docType: intent.includes('美容')
                ? 'consent_cosmetic'
                : 'consent_dermatology',
              content: prev.consent?.result,
            },
            { docType: 'explanation', content: prev.explanation?.result },
            { docType: 'aftercare', content: prev.aftercare?.result },
          ],
        }),
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 収益化ローンチセット全自動生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'launch_set',
    label: '💰 収益化ローンチセット',
    icon: '💰',
    description:
      'ビジネスアイデアからLP・ステップメール・SNS投稿まで全自動',
    triggerKeywords: ['収益化', 'ローンチ', 'LP', 'ビジネス', '事業'],
    steps: [
      {
        id: 'market_research',
        label: '📊 市場リサーチ',
        description: '市場・競合・トレンドを調査',
        apiEndpoint: '/api/deepresearch',
        estimatedSeconds: 30,
        inputMapper: (intent) => ({
          topic: `${intent}の市場規模・競合・ターゲット・差別化ポイント`,
          depth: 'standard',
        }),
      },
      {
        id: 'lp',
        label: '📄 LP生成',
        description: 'セールスコピー全文を生成',
        apiEndpoint: '/api/business/generate',
        dependsOn: ['market_research'],
        estimatedSeconds: 60,
        inputMapper: (intent, prev) => ({
          generateType: 'lp',
          projectData: {
            title: intent,
            marketResearch: prev.market_research?.result ?? '',
          },
        }),
      },
      {
        id: 'step_mail',
        label: '📧 ステップメール21通',
        description: 'メールシーケンスを全自動生成',
        apiEndpoint: '/api/business/generate',
        dependsOn: ['lp'],
        estimatedSeconds: 90,
        inputMapper: (intent, prev) => ({
          generateType: 'step_mail',
          projectData: {
            title: intent,
            lpContent: prev.lp?.result ?? '',
            marketResearch: prev.market_research?.result ?? '',
          },
        }),
      },
      {
        id: 'kindle_outline',
        label: '📚 Kindle構成案',
        description: 'Kindle書籍の構成案を作成',
        apiEndpoint: '/api/business/generate',
        dependsOn: ['lp'],
        estimatedSeconds: 60,
        inputMapper: (intent, prev) => ({
          generateType: 'kindle',
          projectData: {
            title: intent,
            lpContent: prev.lp?.result ?? '',
          },
        }),
      },
      {
        id: 'sns_30days',
        label: '📱 SNS投稿30日分',
        description: 'ローンチ用SNS投稿を自動生成',
        apiEndpoint: '/api/orchestrator/generate-sns',
        dependsOn: ['lp'],
        estimatedSeconds: 60,
        inputMapper: (intent, prev) => ({
          topic: intent,
          lpContent: prev.lp?.result ?? '',
          persona: prev.market_research?.result ?? '',
          days: 30,
        }),
      },
      {
        id: 'competitor_analysis',
        label: '⚔️ 競合詳細分析',
        description: '競合の価格・強み・弱み・差別化ポイントを分析',
        apiEndpoint: '/api/orchestrator/analyze-competitors',
        dependsOn: ['market_research'],
        estimatedSeconds: 35,
        inputMapper: (intent, prev) => ({
          topic: intent,
          marketResearch: prev.market_research?.result ?? '',
        }),
      },
      {
        id: 'pricing_strategy',
        label: '💴 価格戦略設計',
        description: '心理的価格・料金プラン・アンカリングを設計',
        apiEndpoint: '/api/orchestrator/design-pricing',
        dependsOn: ['market_research'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          topic: intent,
          persona: prev.market_research?.result ?? '',
          competitorAnalysis: prev.competitor_analysis?.result ?? '',
        }),
      },
      {
        id: 'email_subject_lines',
        label: '✉️ メール件名A/Bテスト',
        description: '各ステップメールの件名を3パターン生成',
        apiEndpoint: '/api/orchestrator/generate-subjects',
        dependsOn: ['step_mail'],
        estimatedSeconds: 20,
        inputMapper: (intent, prev) => ({
          stepMailContent: prev.step_mail?.result ?? '',
          topic: intent,
        }),
      },
      {
        id: 'faq_objections',
        label: '🛡 反論処理・FAQ',
        description: '購入を妨げる反論と回答を自動生成',
        apiEndpoint: '/api/orchestrator/generate-qa',
        dependsOn: ['lp'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          topic: intent,
          researchText: prev.lp?.result ?? '',
          count: 15,
          type: 'objections',
        }),
      },
      {
        id: 'launch_checklist',
        label: '✅ ローンチチェックリスト',
        description: '発売前の確認事項を自動生成',
        apiEndpoint: '/api/orchestrator/generate-checklist',
        dependsOn: ['lp', 'step_mail'],
        estimatedSeconds: 20,
        inputMapper: (intent, prev) => ({
          topic: intent,
          lpContent: prev.lp?.result ?? '',
          stepMailContent: prev.step_mail?.result ?? '',
        }),
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 人材育成パッケージ全自動生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'hr_package',
    label: '🌱 人材育成パッケージ',
    icon: '🌱',
    description:
      '名前・役職を入力するだけで育成計画から評価シートまで全自動',
    triggerKeywords: ['育成', '評価', '1on1', 'スタッフ', '人材'],
    steps: [
      {
        id: 'possibility',
        label: '🌟 可能性診断',
        description: '強み・潜在力を発見',
        apiEndpoint: '/api/hr/generate',
        estimatedSeconds: 40,
        inputMapper: (intent) => ({
          generateType: 'possibility',
          memberData: parseMemberInfo(intent),
          extraData: {},
        }),
      },
      {
        id: 'roadmap',
        label: '🗺 成長ロードマップ',
        description: '1年間の段階的成長計画',
        apiEndpoint: '/api/hr/generate',
        dependsOn: ['possibility'],
        estimatedSeconds: 40,
        inputMapper: (intent, prev) => ({
          generateType: 'roadmap',
          memberData: parseMemberInfo(intent),
          extraData: {
            goalDescription: prev.possibility?.result?.slice(0, 500) ?? '',
          },
        }),
      },
      {
        id: 'evaluation',
        label: '📋 評価シート',
        description: '5軸・4段階の評価基準を作成',
        apiEndpoint: '/api/hr/generate',
        dependsOn: ['roadmap'],
        estimatedSeconds: 35,
        inputMapper: (intent) => ({
          generateType: 'evaluation',
          memberData: parseMemberInfo(intent),
          extraData: { period: '今期' },
        }),
      },
      {
        id: 'one_on_one',
        label: '💬 1on1アジェンダ',
        description: '面談アジェンダ・質問集を作成',
        apiEndpoint: '/api/hr/generate',
        dependsOn: ['possibility'],
        estimatedSeconds: 30,
        inputMapper: (intent) => ({
          generateType: 'one_on_one',
          memberData: parseMemberInfo(intent),
          extraData: { theme: '初回面談・可能性の発見' },
        }),
      },
      {
        id: 'skill_map',
        label: '⭐ スキルマップ',
        description: '現在地と目標のスキルを可視化',
        apiEndpoint: '/api/hr/generate',
        dependsOn: ['roadmap'],
        estimatedSeconds: 30,
        inputMapper: (intent) => ({
          generateType: 'skill_map',
          memberData: parseMemberInfo(intent),
          extraData: {},
        }),
      },
      {
        id: 'strength_interview',
        label: '🎤 強みインタビュー設計',
        description: '本人の強み・価値観を引き出す質問集を作成',
        apiEndpoint: '/api/hr/generate',
        dependsOn: ['possibility'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          generateType: 'one_on_one',
          memberData: parseMemberInfo(intent),
          extraData: {
            theme: '強み・可能性の発見インタビュー',
            previousNotes: prev.possibility?.result?.slice(0, 300) ?? '',
          },
        }),
      },
      {
        id: 'learning_resources',
        label: '📚 学習リソース推薦',
        description: '個人に最適な書籍・研修・学習方法を推薦',
        apiEndpoint: '/api/orchestrator/recommend-learning',
        dependsOn: ['skill_map'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          memberInfo: parseMemberInfo(intent),
          skillMap: prev.skill_map?.result ?? '',
          roadmap: prev.roadmap?.result ?? '',
        }),
      },
      {
        id: 'monthly_goals',
        label: '🎯 月次目標シート',
        description: '毎月の具体的な行動目標を設定',
        apiEndpoint: '/api/orchestrator/generate-monthly-goals',
        dependsOn: ['roadmap'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          memberInfo: parseMemberInfo(intent),
          roadmap: prev.roadmap?.result ?? '',
        }),
      },
      {
        id: 'peer_feedback',
        label: '🔄 360度フィードバック票',
        description: '同僚・上司・部下からのフィードバック質問票',
        apiEndpoint: '/api/orchestrator/generate-360feedback',
        dependsOn: ['evaluation'],
        estimatedSeconds: 20,
        inputMapper: (intent, prev) => ({
          memberInfo: parseMemberInfo(intent),
          evaluation: prev.evaluation?.result ?? '',
        }),
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Kindle書籍フル自動生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'kindle_full',
    label: '📚 Kindle書籍フル生成',
    icon: '📚',
    description: 'テーマから市場分析・目次構成・第1章執筆まで自動',
    triggerKeywords: ['Kindle', '書籍', '出版', '本を書きたい'],
    steps: [
      {
        id: 'research',
        label: '🔍 テーマリサーチ',
        description: 'Amazon市場・競合・トレンドを調査',
        apiEndpoint: '/api/deepresearch',
        estimatedSeconds: 30,
        inputMapper: (intent) => ({
          topic: `${intent} Kindle出版 市場動向・競合分析・読者ニーズ`,
          depth: 'standard',
        }),
      },
      {
        id: 'outline',
        label: '📋 目次・構成設計',
        description: '売れる目次と章構成を設計',
        apiEndpoint: '/api/business/generate',
        dependsOn: ['research'],
        estimatedSeconds: 40,
        inputMapper: (intent, prev) => ({
          generateType: 'kindle',
          projectData: {
            title: intent,
            marketResearch: prev.research?.result ?? '',
          },
        }),
      },
      {
        id: 'title_variations',
        label: '📝 タイトル30案生成',
        description: 'Amazonで売れるタイトル・サブタイトルを30案生成',
        apiEndpoint: '/api/orchestrator/generate-titles',
        dependsOn: ['outline'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          topic: intent,
          outline: prev.outline?.result ?? '',
          count: 30,
        }),
      },
      {
        id: 'chapter_hooks',
        label: '🎣 各章の冒頭フック',
        description: '読者を引き込む各章のオープニング文を生成',
        apiEndpoint: '/api/orchestrator/generate-hooks',
        dependsOn: ['outline'],
        estimatedSeconds: 30,
        inputMapper: (intent, prev) => ({
          topic: intent,
          outline: prev.outline?.result ?? '',
        }),
      },
      {
        id: 'amazon_listing',
        label: '🛒 Amazon商品説明文',
        description: 'SEO最適化されたAmazon商品ページの説明文を生成',
        apiEndpoint: '/api/orchestrator/generate-amazon-listing',
        dependsOn: ['outline'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          topic: intent,
          outline: prev.outline?.result ?? '',
          targetReader: prev.research?.result?.slice(0, 500) ?? '',
        }),
      },
      {
        id: 'review_strategy',
        label: '⭐ レビュー獲得戦略',
        description: '出版後のレビュー獲得メール・SNS投稿を作成',
        apiEndpoint: '/api/orchestrator/generate-review-strategy',
        dependsOn: ['amazon_listing'],
        estimatedSeconds: 20,
        inputMapper: (intent, prev) => ({
          topic: intent,
          amazonListing: prev.amazon_listing?.result ?? '',
        }),
      },
      {
        id: 'promotion_plan',
        label: '🚀 出版プロモーション計画',
        description: '出版前後30日間のプロモーションプランを作成',
        apiEndpoint: '/api/orchestrator/generate-promotion',
        dependsOn: ['amazon_listing', 'review_strategy'],
        estimatedSeconds: 25,
        inputMapper: (intent, prev) => ({
          topic: intent,
          amazonListing: prev.amazon_listing?.result ?? '',
        }),
      },
    ],
  },
];
