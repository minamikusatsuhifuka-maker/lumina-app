// 251: サイドバーのメニュー定義（**唯一の正本**）。
// もとは DashboardSidebar.tsx 内にあったが、🎛表示設定の「メニュー名の変更」からも
// 同じ一覧が要るため lib へ出した。定義を2箇所に書かない（片方だけ増えるのを防ぐ）。
//
// href をユニークIDとして扱う。**リネーム機能は表示名だけを差し替え、href は変えない**
// （URLが変わるとブックマーク・他画面からのリンク・E2Eがすべて壊れるため）。

// 303: addedAt（YYYY-MM-DD・JST）＝そのメニューを足した時期の**正本**（表示側で推定しない・R-74）。
// 既存分は各経路ファイルの初回コミット日（git log --diff-filter=A --date=short -- src/app<path>/page.tsx）から機械的に埋めた。
// **新規メニューを足すときは必ず書く**——必須プロパティなので、無いと型エラーでビルドが通らない（R-84 の拡張）。
// 形式（YYYY-MM-DD・実在する日付）は U74 で全項目を機械判定する。
export type NavItem = { href: string; label: string; icon: string; addedAt: string };
export type NavCategory = { category: string; items: NavItem[] };

export const navCategories: NavCategory[] = [
  {
    category: 'ホーム',
    items: [
      { href: '/dashboard', label: 'ダッシュボード', icon: '🏠', addedAt: '2026-03-22' },
      { href: '/dashboard/orchestrator', label: 'AIオーケストレーター', icon: '🤖', addedAt: '2026-05-11' },
      { href: '/dashboard/automation-strategy', label: '自動化戦略AI', icon: '🚀', addedAt: '2026-05-12' },
      { href: '/dashboard/saved', label: '保存一覧', icon: '🗃', addedAt: '2026-06-18' },
      { href: '/dashboard/memo', label: 'AIメモ', icon: '🧭', addedAt: '2026-06-18' },
      { href: '/dashboard/guide', label: '使い方ガイド', icon: '📖', addedAt: '2026-03-24' },
    ],
  },
  {
    category: '情報収集・調査',
    items: [
      { href: '/dashboard/intelligence', label: 'Intelligence Hub', icon: '🧠', addedAt: '2026-03-22' },
      { href: '/dashboard/websearch', label: 'Web情報収集', icon: '🌐', addedAt: '2026-03-22' },
      { href: '/dashboard/note', label: 'note検索', icon: '📓', addedAt: '2026-04-04' },
      { href: '/dashboard/deepresearch', label: 'ディープリサーチ', icon: '🔭', addedAt: '2026-03-22' },
      { href: '/dashboard/investment', label: '投資予測', icon: '📈', addedAt: '2026-05-24' },
      { href: '/dashboard/buzz', label: 'バズり分析', icon: '📊', addedAt: '2026-05-24' },
      { href: '/dashboard/buzz-patterns', label: 'バズりパターン辞書', icon: '📖', addedAt: '2026-05-26' },
      { href: '/dashboard/note-article', label: 'note記事生成', icon: '✍️', addedAt: '2026-05-24' },
      { href: '/dashboard/note-quick', label: 'noteおまかせ投稿', icon: '⚡', addedAt: '2026-08-07' },
      { href: '/dashboard/staff-training', label: 'スタッフ育成資料', icon: '📚', addedAt: '2026-05-26' },
      { href: '/dashboard/library?tab=スタッフ育成資料', label: 'スタッフ育成ライブラリ', icon: '✍️', addedAt: '2026-03-22' },
      { href: '/dashboard/knowledge-tree', label: '知識ツリー', icon: '🌳', addedAt: '2026-05-05' },
      { href: '/dashboard/research-glossary', label: '専門用語集', icon: '📚', addedAt: '2026-05-05' },
      { href: '/dashboard/context-library', label: 'AI参照素材', icon: '🧠', addedAt: '2026-05-05' },
      { href: '/dashboard/episodes', label: 'エピソード記録', icon: '📔', addedAt: '2026-09-01' },
      // 301: 思考の骨格（📔一次情報 → 🔲骨格 → 📕Kindle）。絵文字は既存メニューと被らないもの
      { href: '/dashboard/mandala', label: 'マンダラ', icon: '🔲', addedAt: '2026-09-08' },
      { href: '/dashboard/research', label: '文献検索', icon: '🔬', addedAt: '2026-03-22' },
      { href: '/dashboard/alerts', label: '定期アラート', icon: '🔔', addedAt: '2026-03-22' },
      { href: '/dashboard/fact-check', label: 'ファクトチェック', icon: '✅', addedAt: '2026-04-11' },
      { href: '/dashboard/citation', label: '引用元生成', icon: '📚', addedAt: '2026-04-12' },
    ],
  },
  {
    category: 'AI分析・戦略',
    items: [
      { href: '/dashboard/analysis', label: 'AI分析エンジン', icon: '🧩', addedAt: '2026-03-22' },
      { href: '/dashboard/strategy', label: '経営インテリジェンス', icon: '💼', addedAt: '2026-03-22' },
      { href: '/dashboard/industry', label: '業界レポート', icon: '📊', addedAt: '2026-04-05' },
      { href: '/dashboard/personas', label: 'AIペルソナ', icon: '🤖', addedAt: '2026-03-22' },
      { href: '/dashboard/brainstorm', label: 'ブレスト', icon: '💡', addedAt: '2026-04-05' },
      { href: '/dashboard/architecture', label: 'アーキテクチャ設計', icon: '🏗', addedAt: '2026-05-06' },
    ],
  },
  {
    category: 'コンテンツ作成',
    items: [
      { href: '/dashboard/text-analysis', label: 'テキスト分析', icon: '📝', addedAt: '2026-05-06' },
      { href: '/dashboard/proofread', label: 'テキスト校正', icon: '🔎', addedAt: '2026-06-17' },
      { href: '/dashboard/scheduling', label: '日程調整', icon: '🗓️', addedAt: '2026-06-17' },
      { href: '/dashboard/write', label: '文章作成', icon: '✍️', addedAt: '2026-03-22' },
      { href: '/dashboard/minutes', label: '議事録整理', icon: '📝', addedAt: '2026-04-05' },
      { href: '/dashboard/genspark', label: 'Gensparkへ出力', icon: '🎯', addedAt: '2026-03-23' },
      { href: '/dashboard/workflow', label: 'ワークフロー', icon: '⚡', addedAt: '2026-04-05' },
      { href: '/dashboard/hp-generator', label: 'HP内容生成', icon: '🏠', addedAt: '2026-04-10' },
      { href: '/dashboard/copy-generator', label: 'コピー生成', icon: '💬', addedAt: '2026-04-11' },
      { href: '/dashboard/sns-post', label: 'SNS投稿生成', icon: '📱', addedAt: '2026-05-05' },
      { href: '/dashboard/dr-hub', label: '発信ハブ', icon: '🚀', addedAt: '2026-08-25' },
      { href: '/dashboard/ab-test', label: 'ABテスト生成', icon: '🔀', addedAt: '2026-04-11' },
      { href: '/dashboard/persona', label: 'ペルソナ生成', icon: '👤', addedAt: '2026-04-11' },
      { href: '/dashboard/email-generator', label: 'ステップメール', icon: '📧', addedAt: '2026-04-11' },
      { href: '/dashboard/lp-generator', label: 'LP自動生成', icon: '📊', addedAt: '2026-04-10' },
      { href: '/dashboard/image-gen', label: '画像生成', icon: '🎨', addedAt: '2026-07-12' },
      { href: '/dashboard/gallery', label: '画像ギャラリー', icon: '🖼️', addedAt: '2026-07-15' },
      { href: '/dashboard/image-prompt', label: '画像プロンプト', icon: '🎨', addedAt: '2026-04-10' },
      { href: '/dashboard/doc-prompt', label: '資料プロンプト', icon: '📋', addedAt: '2026-04-10' },
      { href: '/dashboard/presentation', label: 'プレゼン原稿', icon: '🎤', addedAt: '2026-08-29' },
      { href: '/dashboard/metaphor', label: '喩え話・比喩', icon: '🔗', addedAt: '2026-08-31' },
      { href: '/dashboard/plain-check', label: '分かりやすさ診断', icon: '🔍', addedAt: '2026-08-31' },
      { href: '/dashboard/simplifier', label: '難易度変換', icon: '🎓', addedAt: '2026-04-11' },
      { href: '/dashboard/video-script', label: '動画スクリプト', icon: '🎬', addedAt: '2026-04-11' },
      { href: '/dashboard/infographic', label: 'インフォグラフィック', icon: '📊', addedAt: '2026-04-12' },
      { href: '/dashboard/storytelling', label: 'ストーリーテリング', icon: '📖', addedAt: '2026-04-12' },
      { href: '/dashboard/kindle-wizard', label: 'Kindle本づくり', icon: '📕', addedAt: '2026-08-05' },
      { href: '/dashboard/kindle', label: 'Kindle書籍生成', icon: '📗', addedAt: '2026-05-06' },
      { href: '/dashboard/avatar-studio', label: 'SNSアバタースタジオ', icon: '🎭', addedAt: '2026-04-12' },
    ],
  },
  {
    category: '事業・育成・医療',
    items: [
      { href: '/dashboard/business-studio', label: '収益化スタジオ', icon: '💰', addedAt: '2026-05-10' },
      { href: '/dashboard/hr-studio', label: '人材育成スタジオ', icon: '🌱', addedAt: '2026-05-10' },
      { href: '/dashboard/medical-studio', label: '医療文書スタジオ', icon: '🏥', addedAt: '2026-05-10' },
      { href: '/dashboard/nexus', label: 'nexusブランドスタジオ', icon: '🌐', addedAt: '2026-05-11' },
      { href: '/dashboard/pricing-strategy', label: '価格戦略', icon: '💴', addedAt: '2026-05-12' },
    ],
  },
  {
    category: '管理・設定',
    items: [
      { href: '/dashboard/library', label: 'リサーチ保存', icon: '📚', addedAt: '2026-03-22' },
      { href: '/dashboard/my-style', label: 'マイ文体', icon: '🗣', addedAt: '2026-08-07' },
      { href: '/dashboard/memory', label: 'AIメモリ', icon: '🧠', addedAt: '2026-04-08' },
      { href: '/dashboard/glossary', label: '用語解説', icon: '📘', addedAt: '2026-03-24' },
      { href: '/dashboard/analytics', label: 'アナリティクス', icon: '📈', addedAt: '2026-04-12' },
      { href: '/dashboard/seo', label: 'SEO分析', icon: '🔍', addedAt: '2026-04-13' },
      { href: '/dashboard/competitor', label: '競合分析', icon: '🔬', addedAt: '2026-04-13' },
      { href: '/dashboard/conversion', label: 'CV分析', icon: '💰', addedAt: '2026-04-13' },
      { href: '/dashboard/contacts', label: '問い合わせ管理', icon: '📞', addedAt: '2026-04-13' },
      { href: '/dashboard/reviews', label: '口コミ管理', icon: '⭐', addedAt: '2026-04-13' },
      { href: '/dashboard/meo', label: 'SEO/MEO対策', icon: '📍', addedAt: '2026-06-30' },
      { href: '/dashboard/stats', label: '使用状況', icon: '📊', addedAt: '2026-04-09' },
      { href: '/dashboard/api-usage', label: 'API使用量', icon: '💴', addedAt: '2026-05-12' },
      { href: '/dashboard/integrations', label: '外部連携（SaaS）', icon: '🔗', addedAt: '2026-05-12' },
      { href: '/dashboard/display-settings', label: '表示設定', icon: '🎛', addedAt: '2026-08-15' },
      // 306: サイドバーのホーム（並び・所属・区切り）を広い画面で編集する専用ページ。改名・アイコンは🎛のまま
      { href: '/dashboard/settings/menu', label: 'ホーム編集', icon: '📌', addedAt: '2026-09-09' },
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
// 303 §5: ホームから**明示的に外した**定義上のホーム項目（合流の対象外にするための墓標）。
// 保存形式は HOME_STORAGE_KEY と同じ JSON 配列（href の列）。
export const HOME_REMOVED_STORAGE_KEY = 'sidebar_home_removed';

/** localStorage の JSON 配列（href の列）を読む。壊れていれば null、実在しない href は落とす */
export function parseHrefList(saved: string | null | undefined): string[] | null {
  try {
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((h): h is string => typeof h === 'string' && ITEM_BY_HREF.has(h));
  } catch {
    return null;
  }
}

/**
 * 303 §5（R-77）: 保存済みのホームの並びに、定義上のホーム項目のうち**含まれていないもの**を既定位置へ挿入する。
 * - 明示的に外した項目（removed）は挿入しない（外した意思を尊重）
 * - 定義から消えた項目（saved にあるが ITEM_BY_HREF に無い）は parseHrefList が落とす＝壊れない
 * - 挿入位置: 定義順で直前にある項目のうち saved に存在する最後のものの直後。無ければ先頭
 * 同じ入力→同じ出力（決定的・R-74）。
 */
export function mergeHomeHrefs(saved: readonly string[], removed: readonly string[], defaults: readonly string[] = DEFAULT_HOME_HREFS): string[] {
  const out = [...saved];
  for (let i = 0; i < defaults.length; i++) {
    const h = defaults[i];
    if (out.includes(h) || removed.includes(h)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.indexOf(defaults[j]);
      if (idx >= 0) { at = idx + 1; break; }
    }
    out.splice(at, 0, h);
  }
  return out;
}

// 262: 「ホーム」カテゴリの実際の並びを localStorage の保存値から解決する**唯一の正本**。
// サイドバー（EditableHome）と🎛表示設定（NavLabelSettings）の両方がこれを使う
// —— 解決規則を2箇所に書くと、片方だけ直して並びがズレる事故が再発するため。
// 規則: JSON配列で・実在する href のみ・1件以上あればそれを採用、それ以外は既定に倒す。
// 303: 採用した並びに、定義上のホーム項目で保存に無いもの（＝保存後に足された新規）を既定位置へ合流させる（R-77）。
//      removed（明示的に外した項目）は合流しない。
export function resolveHomeHrefs(saved: string | null | undefined, removed?: string | null | undefined): string[] {
  // 306: 区切り込みの正本（resolveHomeLayout）から href だけを取り出す。項目だけの保存値では従来と同じ結果（U29）
  return homeHrefsOf(resolveHomeLayout(saved, removed));
}

// ═══════════════════════════════════════════════════════════════════════════
// 306: ホームの並び（区切り見出し込み）の保存形式と解決（DB 非依存の純関数）
//
// 保存形式（sidebar_home_items・後方互換）: JSON 配列。要素が**文字列なら href**（旧形式そのまま）、
// オブジェクト { type: 'divider', id, label } なら区切り見出し。読み取りは新旧どちらも parseHomeLayout 1本で受ける。
// 墓標 sidebar_home_removed の意味（明示的に外した定義上のホーム項目＝合流しない）は変えない。
// ═══════════════════════════════════════════════════════════════════════════

export type HomeEntry = { kind: 'item'; href: string } | { kind: 'divider'; id: string; label: string };

/** 区切り見出しの名前の上限（R-57: サイドバー幅で折り返さない） */
export const HOME_DIVIDER_LABEL_MAX = 12;
/** 保存したことを同一タブ内のサイドバーへ知らせるイベント（テーマ設定と同方式） */
export const HOME_LAYOUT_EVENT = 'home-layout-change';

export function normalizeDividerLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [...t].slice(0, HOME_DIVIDER_LABEL_MAX).join('');
}

/**
 * 保存値（新旧）を HomeEntry[] に。壊れた JSON・配列でない値は null。実在しない href・不正な要素は落とす。
 * 旧形式（href の配列）はそのまま item 列になる＝並びも欠けも起きない（§5・R-79）。
 * 区切りの id が無ければ位置から決定的に補う（'div-<index>'）。
 */
export function parseHomeLayout(saved: string | null | undefined): HomeEntry[] | null {
  try {
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return null;
    const out: HomeEntry[] = [];
    parsed.forEach((v, i) => {
      if (typeof v === 'string') {
        if (ITEM_BY_HREF.has(v) && !out.some((e) => e.kind === 'item' && e.href === v)) out.push({ kind: 'item', href: v });
        return;
      }
      if (v && typeof v === 'object' && (v as { type?: unknown }).type === 'divider') {
        const o = v as { id?: unknown; label?: unknown };
        const id = typeof o.id === 'string' && o.id ? o.id : `div-${i}`;
        out.push({ kind: 'divider', id, label: normalizeDividerLabel(o.label) });
      }
    });
    return out;
  } catch {
    return null;
  }
}

/** 保存する形（書き込み側＝この1箇所。テストの旧形式入力はここと parseHrefList の形から写す・R-79） */
export function serializeHomeLayout(entries: readonly HomeEntry[]): string {
  return JSON.stringify(entries.map((e) => (e.kind === 'item' ? e.href : { type: 'divider', id: e.id, label: e.label })));
}

export function homeHrefsOf(entries: readonly HomeEntry[]): string[] {
  return entries.filter((e): e is Extract<HomeEntry, { kind: 'item' }> => e.kind === 'item').map((e) => e.href);
}

/**
 * 303 §5 の合流を区切り込みの並びに拡張。挿入位置は「定義順で直前にある保存済み項目の**行**の直後」＝区切りを跨いでも
 * 既定位置に入る。項目だけの入力では homeHrefsOf(結果) が mergeHomeHrefs と一致する（第1階層の結果は不変・R-88）。
 */
export function mergeHomeLayout(entries: readonly HomeEntry[], removed: readonly string[], defaults: readonly string[] = DEFAULT_HOME_HREFS): HomeEntry[] {
  const out = [...entries];
  const indexOfHref = (h: string) => out.findIndex((e) => e.kind === 'item' && e.href === h);
  for (let i = 0; i < defaults.length; i++) {
    const h = defaults[i];
    if (indexOfHref(h) >= 0 || removed.includes(h)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = indexOfHref(defaults[j]);
      if (idx >= 0) { at = idx + 1; break; }
    }
    out.splice(at, 0, { kind: 'item', href: h });
  }
  return out;
}

/**
 * ホームの実並び（区切り込み）の**唯一の正本**。項目が1つも無い保存値は既定に倒す（旧 resolveHomeHrefs と同じ規則）。
 * サイドバー・🎛・ホーム編集ページはこれ（または homeHrefsOf 経由の resolveHomeHrefs）を使う。
 */
export function resolveHomeLayout(saved: string | null | undefined, removed?: string | null | undefined): HomeEntry[] {
  const parsed = parseHomeLayout(saved);
  if (!parsed || homeHrefsOf(parsed).length === 0) return DEFAULT_HOME_HREFS.map((href) => ({ kind: 'item', href }));
  return mergeHomeLayout(parsed, parseHrefList(removed) ?? []);
}

/** 書き出し（クリップボードへ）: 並び（区切り込み）と墓標。端末をまたいで持ち運ぶ */
export const HOME_EXPORT_VERSION = 1;
export function exportHomeLayout(entries: readonly HomeEntry[], removed: readonly string[]): string {
  return JSON.stringify({ version: HOME_EXPORT_VERSION, items: JSON.parse(serializeHomeLayout(entries)), removed: [...removed] }, null, 2);
}

export type HomeImportResult = { ok: true; entries: HomeEntry[]; removed: string[]; dropped: number } | { ok: false; reason: string };

/** 読み込み: 形式が不正なら何も変えずに理由を返す（fail-closed）。実在しない href は落とし件数を返す */
export function importHomeLayout(text: string): HomeImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON として読めません（書き出した文字列をそのまま貼り付けてください）' };
  }
  const obj = parsed as { version?: unknown; items?: unknown; removed?: unknown } | null;
  const rawItems = Array.isArray(parsed) ? parsed : obj && typeof obj === 'object' && Array.isArray(obj.items) ? obj.items : null;
  if (!rawItems) return { ok: false, reason: '形式が違います（items の配列がありません）' };
  const entries = parseHomeLayout(JSON.stringify(rawItems)) ?? [];
  if (homeHrefsOf(entries).length === 0) return { ok: false, reason: '有効なメニューが1つもありません（このアプリに無い経路ばかりです）' };
  const validCount = rawItems.filter((v: unknown) => typeof v === 'string' || (v && typeof v === 'object' && (v as { type?: unknown }).type === 'divider')).length;
  const removed = Array.isArray(obj?.removed) ? (parseHrefList(JSON.stringify(obj!.removed)) ?? []) : [];
  return { ok: true, entries, removed, dropped: Math.max(0, validCount - entries.length) };
}
