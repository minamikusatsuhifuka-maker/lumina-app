import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 180;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const FAMOUS_CLINICS = [
  '湘南美容クリニック',
  '聖心美容クリニック',
  'Ritz銀座クリニック',
  '銀座よしえクリニック',
  'TCB東京中央美容外科',
  'クリニックF',
  'ガーデンクリニック',
  '共立美容外科',
  'エルクリニック',
];

interface CollectBody {
  treatmentName: string;
  region?: string;
  includeRegional?: boolean;
  includeFamous?: boolean;
}

// 美容皮膚科クリニックの競合価格をWeb検索で収集する
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: CollectBody;
  try {
    body = (await req.json()) as CollectBody;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const { treatmentName, region, includeRegional, includeFamous } = body;
  if (!treatmentName?.trim()) {
    return NextResponse.json(
      { error: 'treatmentNameが必要です' },
      { status: 400 },
    );
  }

  const searchPrompt = `あなたは美容皮膚科・皮膚科クリニックの価格調査専門家です。
以下の施術について、実際のクリニックの価格情報を収集・整理してください。

【調査対象施術】
${treatmentName}

【調査対象クリニック】
${includeFamous ? `有名クリニック: ${FAMOUS_CLINICS.join('、')}` : ''}
${includeRegional && region ? `地域: ${region}周辺の皮膚科・美容皮膚科クリニック` : ''}

【出力形式】必ず以下のJSON形式で出力してください。説明文は不要です：

\`\`\`json
{
  "famous_clinics": [
    {
      "name": "クリニック名",
      "price": 価格（円・数値のみ）,
      "price_display": "表示価格（例：税込 ¥15,000〜）",
      "notes": "注意事項（単位・部位等）",
      "source": "参照元URL（わかれば）"
    }
  ],
  "regional_clinics": [
    {
      "name": "クリニック名",
      "region": "地域",
      "price": 価格（円・数値）,
      "price_display": "表示価格",
      "notes": "注意事項"
    }
  ],
  "market_summary": {
    "min_price": 最安値,
    "max_price": 最高値,
    "avg_price": 平均価格,
    "median_price": 中央値,
    "price_segments": {
      "budget": "〜XX,000円（廉価帯）",
      "standard": "XX,000〜XX,000円（標準帯）",
      "premium": "XX,000円〜（プレミアム帯）"
    },
    "regional_trend": "${region ?? '対象'}地域の価格傾向",
    "notes": "価格調査に関する注意事項"
  }
}
\`\`\``;

  const results: {
    famous: unknown[];
    regional: unknown[];
    summary: Record<string, unknown>;
    rawText?: string;
  } = { famous: [], regional: [], summary: {} };

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      // Web検索ツールを使って実際の価格情報を集める
      tools: [
        {
          type: 'web_search_20250305' as 'web_search_20250305',
          name: 'web_search',
        },
      ],
      messages: [{ role: 'user', content: searchPrompt }],
    });

    let fullText = '';
    for (const block of response.content) {
      if (block.type === 'text') fullText += block.text;
    }

    const jsonMatch = fullText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        results.famous = parsed.famous_clinics ?? [];
        results.regional = parsed.regional_clinics ?? [];
        results.summary = parsed.market_summary ?? {};
      } catch {
        results.rawText = fullText.slice(0, 2000);
      }
    } else {
      results.rawText = fullText.slice(0, 2000);
    }

    // API使用量を記録
    await trackUsage({
      userId,
      featureKey: 'pricing_strategy',
      stepLabel: `competitor_collect:${treatmentName}`,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
