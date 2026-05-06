// テキスト分析機能のプロンプト・選択肢定数（DermaPDF Pro移植）
export type AnalysisType =
  | 'summary'
  | 'detail_summary'
  | 'genspark_slide'
  | 'transcription';

export interface AnalysisOption {
  value: AnalysisType;
  label: string;
}

export const ANALYSIS_OPTIONS: AnalysisOption[] = [
  { value: 'summary', label: '概要・要約' },
  { value: 'detail_summary', label: '詳細にまとめる' },
  { value: 'genspark_slide', label: 'Gensparkスライド資料用まとめ' },
  { value: 'transcription', label: '全文書き起こし' },
];

export const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  summary:
    'この資料の内容を簡潔に要約してください。主要なポイントを箇条書きで整理し、全体像がわかるようにまとめてください。',

  detail_summary:
    'この資料の内容を、通常の要約よりも細部まで丁寧に読み取り、詳細にまとめてください。' +
    '表面的なキーワードだけでなく、文脈・背景・ニュアンス・行間の意図まで汲み取り、以下の形式で出力してください。\n\n' +
    '## 全体の概要\n（資料全体を3〜5文で説明）\n\n' +
    '## 主要テーマと詳細内容\n（各セクション・章ごとに、見出しと詳細な説明を箇条書きで記載）\n\n' +
    '## 重要なポイント・数値・固有名詞\n（見逃してはいけない具体的な情報を列挙）\n\n' +
    '## 読み取れる背景・意図・示唆\n（明示されていないが文脈から読み取れる意図や示唆）\n\n' +
    '## まとめと活用提案\n（この資料をどう活用できるか、具体的な提案）\n\n' +
    '省略せず、資料の細部まで丁寧に反映してください。',

  genspark_slide:
    'この資料の内容を、Gensparkでのスライド資料作成に最適な形式でまとめてください。\n\n' +
    '# スライドタイトル\n（資料全体を表す簡潔なタイトル）\n\n' +
    '# エグゼクティブサマリー（1スライド分）\n（全体の要点を3〜5行で）\n\n' +
    '# スライド構成案\n## スライド1: （タイトル）\n- ポイント1\n- ポイント2\n- ポイント3\n\n' +
    '（以下、内容に応じて5〜10スライド分）\n\n' +
    '# キーメッセージ（クロージングスライド用）\n（聴衆に最も伝えたいこと1〜2文）\n\n' +
    '# 補足データ・引用\n（スライドに入れるべき数値・固有名詞・引用文）\n\n' +
    '【出力ルール】\n- 各スライドは3〜5箇条書きで完結させる\n- 専門用語は平易な言葉に言い換える\n- Markdown形式で出力する',

  transcription:
    'この資料に含まれる全てのテキストを正確に書き起こしてください。\n\n' +
    '【出力ルール】\n' +
    '・ページ番号がある場合は「--- P.1 ---」のように区切りを入れる\n' +
    '・図・表・グラフ内の文字も含める\n' +
    '・一切省略せず、全ページを完全に出力する',
};

// Gensparkスライド設定オプション
export const TARGET_OPTIONS = [
  { value: 'all_staff', label: '全スタッフ（職種混合）' },
  { value: 'doctors', label: '医師・医療職' },
  { value: 'management', label: '管理職・リーダー' },
  { value: 'new_staff', label: '新人スタッフ' },
  { value: 'external', label: '外部向け（患者・取引先）' },
];

export const LEVEL_OPTIONS = [
  { value: 'basic', label: '入門（要点のみ・5〜8枚）' },
  { value: 'standard', label: '標準（バランス重視・10〜15枚）' },
  { value: 'detailed', label: '詳細（深掘り・20枚以上）' },
];

export const PURPOSE_OPTIONS = [
  { value: 'inform', label: '情報共有・周知' },
  { value: 'educate', label: '研修・教育' },
  { value: 'persuade', label: '提案・説得' },
  { value: 'report', label: '報告・振り返り' },
];

export const TONE_OPTIONS = [
  { value: 'professional', label: 'プロフェッショナル（ビジネス調）' },
  { value: 'friendly', label: 'フレンドリー（親しみやすい）' },
  { value: 'academic', label: 'アカデミック（論文・研究調）' },
  { value: 'casual', label: 'カジュアル（SNS・ブログ調）' },
];

// ラベルへの変換ヘルパー
export const labelOf = <T extends { value: string; label: string }>(
  options: T[],
  value: string,
): string => options.find((o) => o.value === value)?.label ?? value;
