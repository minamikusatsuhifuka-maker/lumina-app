// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// next/og（satori）用の日本語フォント取得（227【C】で実装・228でlib抽出しKindle/note共用）
// Google Fontsからテキスト単位のサブセットTTFを取得する（satoriはwoff2不可）。
// サブセットは文字集合に依存するためテキストをキーにキャッシュ（上限20件・プロセス内のみ）。
// サーバ専用（Route Handlerから使う）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };

const fontCache = new Map<string, OgFont[]>();

export async function fetchJpFonts(text: string): Promise<OgFont[]> {
  const key = Array.from(new Set(text)).sort().join('');
  const hit = fontCache.get(key);
  if (hit) return hit;
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:60.0)' } });
  if (!cssRes.ok) throw new Error(`フォント情報の取得に失敗しました (${cssRes.status})`);
  const css = await cssRes.text();
  const urls = [...css.matchAll(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error('フォントURLを抽出できませんでした');
  const fonts = [] as OgFont[];
  for (const [i, u] of urls.slice(0, 2).entries()) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`フォントの取得に失敗しました (${r.status})`);
    fonts.push({ name: 'NotoSansJP', data: await r.arrayBuffer(), weight: i === 0 ? 400 : 700, style: 'normal' });
  }
  if (fontCache.size >= 20) fontCache.delete(fontCache.keys().next().value as string);
  fontCache.set(key, fonts);
  return fonts;
}

// ───────────────────────────────────────────────────────────────────────────
// 315是正②: 欠字のフォールバックと検出。Noto Sans JP に無い文字（下付き ₃・上付き ⁺・ギリシャ文字 α 等）は
// 「Noto Sans Math → Noto Sans Symbols 2 → Noto Sans」の順に、その文字だけをサブセット取得して足す。
// それでも無い文字は missing に返す（呼び出し側は描画せず理由を出す＝文字はプランどおりにしか描かない・fail-closed）
// ───────────────────────────────────────────────────────────────────────────

import { fontCodepoints, uncoveredChars } from '@/lib/font-coverage';

export const OG_FALLBACK_FAMILIES = ['Noto Sans Math', 'Noto Sans Symbols 2', 'Noto Sans'] as const;

async function fetchFamilySubset(family: string, text: string, name: string): Promise<OgFont[]> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:60.0)' } });
  if (!cssRes.ok) return [];
  const css = await cssRes.text();
  const urls = [...css.matchAll(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/g)].map((m) => m[1]);
  const fonts: OgFont[] = [];
  for (const u of urls.slice(0, 1)) {
    const r = await fetch(u);
    if (!r.ok) continue;
    fonts.push({ name, data: await r.arrayBuffer(), weight: 400, style: 'normal' });
  }
  return fonts;
}

export interface FontsWithCoverage {
  fonts: OgFont[];
  /** どのフォントにも無い文字（描画すると空白／豆腐になる） */
  missing: string[];
  /** フォールバックで補った文字 */
  fallback: string[];
}

/**
 * 本文の全文字を Noto Sans JP で取り、無い文字だけフォールバック（Math → Symbols 2 → Sans）で補う。残りは missing。
 * satori はフォントを name で切り替えられないため、フォールバックは別 name で fonts に足す（satori が文字ごとに探す）
 */
export async function fetchJpFontsWithFallback(text: string): Promise<FontsWithCoverage> {
  const base = await fetchJpFonts(text);
  let missing = uncoveredChars(text, base.map((f) => f.data));
  const fonts = [...base];
  const fallback: string[] = [];
  for (const family of OG_FALLBACK_FAMILIES) {
    if (missing.length === 0) break;
    const extra = await fetchFamilySubset(family, missing.join(''), family.replace(/\s+/g, ''));
    if (extra.length === 0) continue;
    const covered = new Set<number>();
    for (const f of extra) for (const c of fontCodepoints(f.data)) covered.add(c);
    const got = missing.filter((ch) => covered.has(ch.codePointAt(0)!));
    if (got.length === 0) continue;
    fonts.push(...extra);
    fallback.push(...got);
    missing = missing.filter((ch) => !covered.has(ch.codePointAt(0)!));
  }
  return { fonts, missing, fallback };
}
