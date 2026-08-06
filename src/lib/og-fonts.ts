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
