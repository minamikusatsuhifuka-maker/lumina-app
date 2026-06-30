import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';
import { fetchPlacesData, type CompetitorPlace } from '@/lib/places-reviews';
import { generateWithModel } from '@/lib/ai-client';
import { checkMedicalAd } from '@/lib/medical-ad-check';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 148-4 競合分析。自院(Places) × 競合(保存済 place_data) を AI で比較し、
// 差別化ポイント・不足コンテンツ提案を生成（医療広告チェック込み・提案のみ）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { competitorId } = await req.json();
    if (!competitorId) {
      return NextResponse.json({ error: 'competitorId が必要です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);

    const rows = (await sql`
      SELECT id, name, place_data FROM competitors
      WHERE id = ${competitorId} AND owner = ${owner}
    `) as Array<{ id: number; name: string; place_data: CompetitorPlace }>;
    const comp = rows[0];
    if (!comp) return NextResponse.json({ error: '競合が見つかりません' }, { status: 404 });

    const [own, clinicContext] = await Promise.all([
      fetchPlacesData().catch(() => null),
      getClinicSystemPrompt('competitor', owner),
    ]);

    const cp = comp.place_data;
    const ownLine = own
      ? `自院（${own.name}）: 星${own.rating}（${own.totalReviews}件）／営業時間${own.openingHours?.length || 0}日分／URL:${own.website ? 'あり' : 'なし'}`
      : '自院: Places取得に失敗（評価・口コミ数の比較は省略）';
    const compLine = `競合（${cp.name}）: 星${cp.rating}（${cp.totalReviews}件）／カテゴリ:${(cp.categories || []).slice(0, 5).join(', ') || '不明'}／営業時間${cp.openingHours?.length || 0}日分／URL:${cp.website ? 'あり' : 'なし'}`;

    const system = `あなたは皮膚科クリニックのMEO/SEOコンサルタントで、医療広告規制（医療法・医療広告ガイドライン／薬機法）に精通しています。事実ベースで分析し、効果保証・誇大・最上級・ビフォーアフター・体験談・割引誘導は提案しません。${clinicContext ? `\n\n${clinicContext}` : ''}`;

    const prompt = `自院と競合クリニックのGoogleビジネスプロフィール情報を比較し、自院の強化ポイントを Markdown で提案してください。

## 比較データ（Places取得・取得可の範囲）
- ${ownLine}
- ${compLine}

## 出力（Markdown）
## 比較サマリ（星評価・口コミ数・営業時間・URLの差）
## 競合が評価されていそうな点（推測は推測と明記）
## 自院の差別化ポイント
## 不足していそうなコンテンツ・施策の提案（具体的・実行可能・医療広告規制に適合）

## ルール
- 提案のみ（自動アクションはしない）。断定や効果保証はしない
- 口コミ本文は競合のものを引用・転載しない（件数・星平均などの公開指標のみ扱う）
- 出力は Markdown のみ（前置き不要）`;

    const result = await generateWithModel('claude', prompt, system, 4000);
    const adCheck = await checkMedicalAd(result);

    const saved = await sql`
      INSERT INTO competitor_analyses (owner, competitor_id, result, ad_check)
      VALUES (${owner}, ${comp.id}, ${result}, ${JSON.stringify(adCheck)})
      RETURNING id, competitor_id, result, ad_check, created_at
    `;

    return NextResponse.json({ success: true, analysis: saved[0], ad_check: adCheck });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitor-analyze] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
