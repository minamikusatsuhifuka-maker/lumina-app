import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface MarketResearchRequest {
  topic?: string;
  intent?: string;
}

// 市場リサーチ専用エンドポイント
// deepresearchが重すぎてオーケストレーター内で頻繁にタイムアウトしていたため、
// 軽量な単発生成として分離。1〜2分以内で返す想定。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: MarketResearchRequest;
  try {
    body = (await req.json()) as MarketResearchRequest;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const topic = body.topic ?? body.intent ?? '';
  if (!topic.trim()) {
    return NextResponse.json({ error: 'topicが必要です' }, { status: 400 });
  }

  const prompt = `「${topic}」の市場分析レポートを日本語で作成してください。
推測でも構わないので、実用的に判断材料となる粒度で書いてください。

## 市場分析レポート

### 1. 市場規模・成長性
- 現在の市場規模（推計）
- 年間成長率
- 3〜5年後の予測

### 2. ターゲット顧客分析
- メインターゲット層（年齢・職業・悩み）
- サブターゲット層
- 顧客の購買動機・ペインポイント

### 3. 競合分析
| 競合名 | 強み | 弱み | 価格帯 |
|--------|------|------|--------|
（3〜5社）

### 4. 差別化ポイント
- 市場のギャップ（未充足ニーズ）
- 参入機会
- 推奨ポジショニング

### 5. 参入タイミング評価
- 市場の成熟度
- 参入障壁
- 総合評価（S/A/B/C）と理由`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const first = response.content[0];
    const content = first && first.type === 'text' ? first.text : '';
    return NextResponse.json({
      content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[market-research] エラー:', message);
    return NextResponse.json(
      { error: `市場リサーチに失敗しました: ${message}` },
      { status: 500 },
    );
  }
}
