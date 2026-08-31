// 251: サイドバーのメニュー定義（**唯一の正本**）。
// もとは DashboardSidebar.tsx 内にあったが、🎛表示設定の「メニュー名の変更」からも
// 同じ一覧が要るため lib へ出した。定義を2箇所に書かない（片方だけ増えるのを防ぐ）。
//
// href をユニークIDとして扱う。**リネーム機能は表示名だけを差し替え、href は変えない**
// （URLが変わるとブックマーク・他画面からのリンク・E2Eがすべて壊れるため）。

export type NavItem = { href: string; label: string; icon: string };
export type NavCategory = { category: string; items: NavItem[] };

export const navCategories: NavCategory[] = [
  {
    category: 'ホーム',
    items: [
      { href: '/dashboard', label: 'ダッシュボード', icon: '🏠' },
      { href: '/dashboard/orchestrator', label: 'AIオーケストレーター', icon: '🤖' },
      { href: '/dashboard/automation-strategy', label: '自動化戦略AI', icon: '🚀' },
      { href: '/dashboard/saved', label: '保存一覧', icon: '🗃' },
      { href: '/dashboard/memo', label: 'AIメモ', icon: '🧭' },
      { href: '/dashboard/guide', label: '使い方ガイド', icon: '📖' },
    ],
  },
  {
    category: '情報収集・調査',
    items: [
      { href: '/dashboard/intelligence', label: 'Intelligence Hub', icon: '🧠' },
      { href: '/dashboard/websearch', label: 'Web情報収集', icon: '🌐' },
      { href: '/dashboard/note', label: 'note検索', icon: '📓' },
      { href: '/dashboard/deepresearch', label: 'ディープリサーチ', icon: '🔭' },
      { href: '/dashboard/investment', label: '投資予測', icon: '📈' },
      { href: '/dashboard/buzz', label: 'バズり分析', icon: '📊' },
      { href: '/dashboard/buzz-patterns', label: 'バズりパターン辞書', icon: '📖' },
      { href: '/dashboard/note-article', label: 'note記事生成', icon: '✍️' },
      { href: '/dashboard/note-quick', label: 'noteおまかせ投稿', icon: '⚡' },
      { href: '/dashboard/staff-training', label: 'スタッフ育成資料', icon: '📚' },
      { href: '/dashboard/library?tab=スタッフ育成資料', label: 'スタッフ育成ライブラリ', icon: '✍️' },
      { href: '/dashboard/knowledge-tree', label: '知識ツリー', icon: '🌳' },
      { href: '/dashboard/research-glossary', label: '専門用語集', icon: '📚' },
      { href: '/dashboard/context-library', label: 'AI参照素材', icon: '🧠' },
      { href: '/dashboard/research', label: '文献検索', icon: '🔬' },
      { href: '/dashboard/alerts', label: '定期アラート', icon: '🔔' },
      { href: '/dashboard/fact-check', label: 'ファクトチェック', icon: '✅' },
      { href: '/dashboard/citation', label: '引用元生成', icon: '📚' },
    ],
  },
  {
    category: 'AI分析・戦略',
    items: [
      { href: '/dashboard/analysis', label: 'AI分析エンジン', icon: '🧩' },
      { href: '/dashboard/strategy', label: '経営インテリジェンス', icon: '💼' },
      { href: '/dashboard/industry', label: '業界レポート', icon: '📊' },
      { href: '/dashboard/personas', label: 'AIペルソナ', icon: '🤖' },
      { href: '/dashboard/brainstorm', label: 'ブレスト', icon: '💡' },
      { href: '/dashboard/architecture', label: 'アーキテクチャ設計', icon: '🏗' },
    ],
  },
  {
    category: 'コンテンツ作成',
    items: [
      { href: '/dashboard/text-analysis', label: 'テキスト分析', icon: '📝' },
      { href: '/dashboard/proofread', label: 'テキスト校正', icon: '🔎' },
      { href: '/dashboard/scheduling', label: '日程調整', icon: '🗓️' },
      { href: '/dashboard/write', label: '文章作成', icon: '✍️' },
      { href: '/dashboard/minutes', label: '議事録整理', icon: '📝' },
      { href: '/dashboard/genspark', label: 'Gensparkへ出力', icon: '🎯' },
      { href: '/dashboard/workflow', label: 'ワークフロー', icon: '⚡' },
      { href: '/dashboard/hp-generator', label: 'HP内容生成', icon: '🏠' },
      { href: '/dashboard/copy-generator', label: 'コピー生成', icon: '💬' },
      { href: '/dashboard/sns-post', label: 'SNS投稿生成', icon: '📱' },
      { href: '/dashboard/dr-hub', label: '発信ハブ', icon: '🚀' },
      { href: '/dashboard/ab-test', label: 'ABテスト生成', icon: '🔀' },
      { href: '/dashboard/persona', label: 'ペルソナ生成', icon: '👤' },
      { href: '/dashboard/email-generator', label: 'ステップメール', icon: '📧' },
      { href: '/dashboard/lp-generator', label: 'LP自動生成', icon: '📊' },
      { href: '/dashboard/image-gen', label: '画像生成', icon: '🎨' },
      { href: '/dashboard/gallery', label: '画像ギャラリー', icon: '🖼️' },
      { href: '/dashboard/image-prompt', label: '画像プロンプト', icon: '🎨' },
      { href: '/dashboard/doc-prompt', label: '資料プロンプト', icon: '📋' },
      { href: '/dashboard/presentation', label: 'プレゼン原稿', icon: '🎤' },
      { href: '/dashboard/metaphor', label: '喩え話・比喩', icon: '🔗' },
      { href: '/dashboard/plain-check', label: '分かりやすさ診断', icon: '🔍' },
      { href: '/dashboard/simplifier', label: '難易度変換', icon: '🎓' },
      { href: '/dashboard/video-script', label: '動画スクリプト', icon: '🎬' },
      { href: '/dashboard/infographic', label: 'インフォグラフィック', icon: '📊' },
      { href: '/dashboard/storytelling', label: 'ストーリーテリング', icon: '📖' },
      { href: '/dashboard/kindle-wizard', label: 'Kindle本づくり', icon: '📕' },
      { href: '/dashboard/kindle', label: 'Kindle書籍生成', icon: '📗' },
      { href: '/dashboard/avatar-studio', label: 'SNSアバタースタジオ', icon: '🎭' },
    ],
  },
  {
    category: '事業・育成・医療',
    items: [
      { href: '/dashboard/business-studio', label: '収益化スタジオ', icon: '💰' },
      { href: '/dashboard/hr-studio', label: '人材育成スタジオ', icon: '🌱' },
      { href: '/dashboard/medical-studio', label: '医療文書スタジオ', icon: '🏥' },
      { href: '/dashboard/nexus', label: 'nexusブランドスタジオ', icon: '🌐' },
      { href: '/dashboard/pricing-strategy', label: '価格戦略', icon: '💴' },
    ],
  },
  {
    category: '管理・設定',
    items: [
      { href: '/dashboard/library', label: 'リサーチ保存', icon: '📚' },
      { href: '/dashboard/my-style', label: 'マイ文体', icon: '🗣' },
      { href: '/dashboard/memory', label: 'AIメモリ', icon: '🧠' },
      { href: '/dashboard/glossary', label: '用語解説', icon: '📘' },
      { href: '/dashboard/analytics', label: 'アナリティクス', icon: '📈' },
      { href: '/dashboard/seo', label: 'SEO分析', icon: '🔍' },
      { href: '/dashboard/competitor', label: '競合分析', icon: '🔬' },
      { href: '/dashboard/conversion', label: 'CV分析', icon: '💰' },
      { href: '/dashboard/contacts', label: '問い合わせ管理', icon: '📞' },
      { href: '/dashboard/reviews', label: '口コミ管理', icon: '⭐' },
      { href: '/dashboard/meo', label: 'SEO/MEO対策', icon: '📍' },
      { href: '/dashboard/stats', label: '使用状況', icon: '📊' },
      { href: '/dashboard/api-usage', label: 'API使用量', icon: '💴' },
      { href: '/dashboard/integrations', label: '外部連携（SaaS）', icon: '🔗' },
      { href: '/dashboard/display-settings', label: '表示設定', icon: '🎛' },
    ],
  },
];

// 全メニューを単一ソースから取得（href をユニークIDとして扱い、二重定義しない）
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const map = new Map<string, NavItem>();
  for (const c of navCategories) for (const it of c.items) if (!map.has(it.href)) map.set(it.href, it);
  return [...map.values()];
})();
export const ITEM_BY_HREF = new Map(ALL_NAV_ITEMS.map((i) => [i.href, i]));
// 未設定ユーザーのデフォルト＝現状のホーム項目（後方互換）
export const DEFAULT_HOME_HREFS: string[] =
  navCategories.find((c) => c.category === 'ホーム')?.items.map((i) => i.href) ?? [];
export const HOME_STORAGE_KEY = 'sidebar_home_items';

// 262: 「ホーム」カテゴリの実際の並びを localStorage の保存値から解決する**唯一の正本**。
// サイドバー（EditableHome）と🎛表示設定（NavLabelSettings）の両方がこれを使う
// —— 解決規則を2箇所に書くと、片方だけ直して並びがズレる事故が再発するため。
// 規則: JSON配列で・実在する href のみ・1件以上あればそれを採用、それ以外は既定に倒す。
export function resolveHomeHrefs(saved: string | null | undefined): string[] {
  try {
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((h): h is string => typeof h === 'string' && ITEM_BY_HREF.has(h));
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    /* 壊れた保存値は既定に倒す */
  }
  return DEFAULT_HOME_HREFS;
}
