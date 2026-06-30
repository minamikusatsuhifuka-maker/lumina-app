import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel } from '@/lib/ai-client';
import { checkMedicalAd } from '@/lib/medical-ad-check';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { fetchSearchConsoleData, GSC_SITE_URL } from '@/lib/gsc-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 148-1 皮膚科SEO記事生成。狙うキーワードから見出し/本文/FAQ を生成。
// 既存の note記事生成と同じ AI クライアント・GSC を流用。自動公開はしない。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

const TYPE_GUIDE: Record<string, string> = {
  symptom: '症状解説（原因・セルフケア・受診の目安。診断や治療効果の断定はしない）',
  treatment: '施術・治療案内（一般的な選択肢の解説。効果保証・ビフォーアフター誘導はしない）',
  column: '季節コラム（季節性の皮膚トラブルと予防の読み物）',
};

// GSC から keyword に関連する実クエリを抽出（取得できれば関連語として供給）
async function fetchRelatedQueries(keyword: string): Promise<string[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data = await fetchSearchConsoleData(GSC_SITE_URL, start, today);
    const tokens = keyword.split(/\s+/).filter(Boolean);
    return data.queries
      .map((q) => q.keys[0])
      .filter((q) => q && tokens.some((t) => q.includes(t)))
      .slice(0, 15);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { keyword, type, model } = await req.json();
    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
      return NextResponse.json({ error: 'keyword が必要です' }, { status: 400 });
    }
    const typeGuide = TYPE_GUIDE[type] || TYPE_GUIDE.symptom;
    const aiModel = model === 'gemini' ? 'gemini' : 'claude';

    const [clinicContext, related] = await Promise.all([
      getClinicSystemPrompt('seo-article', owner),
      fetchRelatedQueries(keyword.trim()),
    ]);

    const system = `あなたは皮膚科クリニックの広報・SEO担当で、医療広告規制（医療法・医療広告ガイドライン／薬機法）に精通しています。患者さんが検索する疑問に正確・誠実に答える記事を書きます。効果保証・誇大・最上級・ビフォーアフター誘導・体験談的表現・割引誘導は使いません。${clinicContext ? `\n\n${clinicContext}` : ''}`;

    const prompt = `南草津皮フ科クリニック（滋賀県）のホームページ向けに、SEOを意識した記事ドラフトを Markdown で作成してください。

## 狙うキーワード
${keyword.trim()}

## 記事タイプ
${typeGuide}
${related.length ? `\n## 患者がよく検索する関連語（Search Console実データ。自然に取り込む）\n${related.map((r) => `- ${r}`).join('\n')}` : ''}

## 構成（Markdown）
1. # タイトル（キーワードを含む・誇大でない）
2. リード文（2〜3文）
3. ## 見出しごとの本文（h2/h3で3〜5セクション。患者の疑問に答える）
4. ## よくある質問（FAQ）3〜5問（Q/A形式）
5. ## 受診の目安・ご相談（断定や効果保証はしない、来院導線は穏やかに）

## ルール
- 医療広告規制に適合（効果保証・誇大・最上級・ビフォーアフター・体験談・割引誘導はNG）
- 患者にやさしい平易な日本語。事実ベース。不確かなことは断定しない
- 出力は記事本文の Markdown のみ（前置き・コードフェンス不要）`;

    const content = await generateWithModel(aiModel, prompt, system, 8000);
    const adCheck = await checkMedicalAd(content);

    return NextResponse.json({ content, ad_check: adCheck, related });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/article] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
