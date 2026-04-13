import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchSearchConsoleData } from '@/lib/gsc-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

const OWN_SITE_URL = 'https://www.mkhifuka11.com/';

interface CompetitorPageData {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  textLength: number;
  approxPageCount: number;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? m[1] : '';
}

function extractTag(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text && text.length > 1 && text.length < 200) out.push(text);
  }
  return out.slice(0, 20);
}

async function fetchCompetitorPage(url: string): Promise<CompetitorPageData> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; LuminaBot/1.0; +https://xlumina.jp)',
      Accept: 'text/html,application/xhtml+xml',
    },
    // 30秒で打ち切り
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`競合サイトの取得に失敗しました (HTTP ${res.status})`);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
  const h1 = extractTag(html, 'h1');
  const h2 = extractTag(html, 'h2');
  const bodyText = stripTags(html);

  // ページ数概算: 内部リンク数からざっくり推定
  const linkRe = /<a[^>]+href=["']([^"']+)["']/gi;
  const origin = new URL(url).origin;
  const internalLinks = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const abs = new URL(href, url).href;
      if (abs.startsWith(origin)) internalLinks.add(abs.split('#')[0]);
    } catch {
      // 無視
    }
  }

  return {
    url,
    title,
    description,
    h1,
    h2,
    textLength: bodyText.length,
    approxPageCount: internalLinks.size,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { competitorUrl } = await req.json();
    if (!competitorUrl || typeof competitorUrl !== 'string') {
      return NextResponse.json({ error: 'competitorUrl が必要です' }, { status: 400 });
    }
    const normalized = competitorUrl.startsWith('http') ? competitorUrl : `https://${competitorUrl}`;

    // 競合サイトのページ取得
    const competitor = await fetchCompetitorPage(normalized);

    // 自院のGSCデータ（直近28日）
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let ownQueries: { query: string; clicks: number; impressions: number; position: number }[] = [];
    try {
      const gsc = await fetchSearchConsoleData(OWN_SITE_URL, startDate, endDate);
      ownQueries = gsc.queries.slice(0, 15).map((r) => ({
        query: r.keys?.[0] ?? '',
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      }));
    } catch (e) {
      console.warn('[competitor/analyze] GSC fetch skipped:', e);
    }

    // AIによる競合分析
    const apiKey = process.env.GEMINI_API_KEY;
    let aiResult: {
      summary: string;
      differentiators: { title: string; description: string }[];
      recommendations: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[];
    } = {
      summary: '',
      differentiators: [],
      recommendations: [],
    };

    if (apiKey) {
      const prompt = `あなたは皮膚科クリニック専門のWebマーケティング戦略家です。
自院と競合クリニックのサイト情報を比較し、差別化ポイントと改善提案を日本語で出してください。

## 自院（南草津皮フ科クリニック／滋賀県）
URL: ${OWN_SITE_URL}
自院の主要検索キーワード（直近28日・Search Console上位）:
${ownQueries.map((q, i) => `${i + 1}. ${q.query}（${q.clicks}クリック / 平均順位${q.position.toFixed(1)}）`).join('\n') || '（データなし）'}

## 競合クリニック
URL: ${competitor.url}
タイトル: ${competitor.title}
ディスクリプション: ${competitor.description}
H1タグ: ${competitor.h1.slice(0, 10).join(' / ')}
H2タグ: ${competitor.h2.slice(0, 15).join(' / ')}
本文テキスト量: ${competitor.textLength.toLocaleString()}文字
内部リンク数（ページ数概算）: ${competitor.approxPageCount}

## 回答フォーマット（必ずこのJSON形式）
{
  "summary": "全体サマリー（2〜3文、競合の強みと自院の立ち位置）",
  "differentiators": [
    { "title": "差別化ポイント名", "description": "具体的な内容（2〜3文）" }
  ],
  "recommendations": [
    { "title": "改善アクション", "description": "具体的な実施内容", "priority": "high|medium|low" }
  ]
}

指示:
- differentiators は 4〜6 個、自院が競合と差をつけるべき独自ポイント
- recommendations は 4〜6 個、具体的なSEO / コンテンツ / MEO施策
- 皮膚科クリニックの視点で実務的に`;

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiResult = {
            summary: parsed.summary || '',
            differentiators: parsed.differentiators || [],
            recommendations: parsed.recommendations || [],
          };
        }
      } catch (e) {
        console.warn('[competitor/analyze] AI failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      competitor,
      ownQueries,
      ai: aiResult,
      period: { startDate, endDate },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[competitor/analyze] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
