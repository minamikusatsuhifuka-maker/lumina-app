import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface CompetitorClinic {
  name?: string;
  price?: number;
  price_display?: string;
  notes?: string;
}

interface RecommendBody {
  treatmentName: string;
  treatmentCategory?: string;
  region?: string;
  bedCostPerHour?: number;
  treatmentTimeMinutes?: number;
  competitorData?: {
    famous?: CompetitorClinic[];
    regional?: CompetitorClinic[];
    summary?: Record<string, unknown>;
  };
  clinicInfo?: string;
}

// 収集した競合価格＋自院コストを踏まえて最適価格をAIが提案する
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: RecommendBody;
  try {
    body = (await req.json()) as RecommendBody;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const {
    treatmentName,
    treatmentCategory,
    region,
    bedCostPerHour = 0,
    treatmentTimeMinutes = 30,
    competitorData,
    clinicInfo,
  } = body;

  if (!treatmentName?.trim()) {
    return NextResponse.json(
      { error: 'treatmentNameが必要です' },
      { status: 400 },
    );
  }

  // ベッドコスト（施術時間分）
  const bedCostPerTreatment = Math.ceil(
    (bedCostPerHour * treatmentTimeMinutes) / 60,
  );

  // 価格統計を計算
  const allPrices = [
    ...(competitorData?.famous ?? []),
    ...(competitorData?.regional ?? []),
  ]
    .map((c) => (typeof c.price === 'number' ? c.price : 0))
    .filter((p) => p > 0);

  const avgPrice =
    allPrices.length > 0
      ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length)
      : 0;
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;

  const prompt = `あなたは美容皮膚科・皮膚科クリニックの経営コンサルタントです。
以下の情報を元に、最適な価格戦略を立案してください。

## 施術情報
- 施術名: ${treatmentName}
- カテゴリ: ${treatmentCategory ?? '未設定'}
- 地域: ${region ?? '未設定'}
- 施術時間: ${treatmentTimeMinutes}分

## 当院のコスト情報
- 1ベッド時間単価: ¥${bedCostPerHour.toLocaleString()}
- 本施術のベッドコスト: ¥${bedCostPerTreatment.toLocaleString()}（${treatmentTimeMinutes}分分）
- ※材料費・人件費・固定費は別途考慮が必要

## 競合価格データ
${JSON.stringify(competitorData ?? {}, null, 2)}

## 市場サマリー
- 最安値: ¥${minPrice.toLocaleString()}
- 最高値: ¥${maxPrice.toLocaleString()}
- 平均価格: ¥${avgPrice.toLocaleString()}

## クリニック情報
${clinicInfo ?? '一般的な皮膚科・美容皮膚科クリニック'}

---

以下の観点から価格戦略を分析・提案してください：

## 1. 市場ポジショニング分析
- 価格帯の分布（廉価・標準・プレミアム）
- ${region ?? '当該'}地域の特性と患者層
- 競合との差別化ポイント

## 2. コスト分析
- ベッドコスト: ¥${bedCostPerTreatment.toLocaleString()}
- 最低でもこのコストを上回る必要がある
- 材料費・人件費・固定費の目安

## 3. 推奨価格戦略

### 戦略A：競争力重視（市場シェア獲得）
- 推奨価格: ¥XXX,XXX
- 根拠と期待効果

### 戦略B：標準価格（バランス重視）
- 推奨価格: ¥XXX,XXX
- 根拠と期待効果

### 戦略C：プレミアム（収益性重視）
- 推奨価格: ¥XXX,XXX
- 根拠と期待効果

## 4. 最終推奨価格
- **推奨価格: ¥XXX,XXX（税込）**
- **推奨価格帯: ¥XXX,XXX〜¥XXX,XXX**
- 推奨する理由（3点）

## 5. 価格設定の注意点・リスク
- 注意すべき競合の動向
- 季節性・キャンペーン価格の考え方
- 価格改定のタイミング

## 6. 収益シミュレーション
月XX件施術した場合の月次収益試算（推奨価格で）`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const firstBlock = response.content[0];
  const content = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';

  // 最終推奨価格を抽出
  const priceMatch = content.match(/推奨価格[：:]\s*[¥￥]?([\d,]+)/);
  const recommendedPrice = priceMatch
    ? parseInt(priceMatch[1].replace(/,/g, ''), 10)
    : avgPrice;

  // API使用量を記録
  await trackUsage({
    userId,
    featureKey: 'pricing_strategy',
    stepLabel: `recommend:${treatmentName}`,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  return NextResponse.json({
    content,
    recommendedPrice,
    bedCostPerTreatment,
    marketStats: { avgPrice, minPrice, maxPrice },
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
