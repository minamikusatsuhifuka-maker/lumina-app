import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RequestBody {
  analysisContent: string;
  mediaType?: string;
  sourceAnalysisId?: string;
  model?: AIModel;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    analysisContent,
    mediaType = 'note',
    sourceAnalysisId,
    model = 'claude',
  } = (await req.json()) as RequestBody;

  if (!analysisContent || analysisContent.length < 100) {
    return new Response(
      JSON.stringify({ error: 'analysisContent is required (min 100 chars)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const systemPrompt = `あなたはコンテンツマーケティング・コピーライティングの専門家として、バズり分析の結果から「再利用可能な型・パターン・テクニック」を抽出する役割です。

抽出する条件:
- 他の記事・コンテンツでも応用できる汎用性のある型のみ
- 「この記事固有の話題」ではなく「型としての構造」を抽出
- 1パターンあたり、明確な使い方・効果・具体例を含む
- 心理学・行動経済学・影響力の武器の理論に基づくものを優先

出力は厳密にJSON形式で、配列形式で複数のパターンを返してください。`;

  const userPrompt = `以下のバズり分析の結果から、再利用可能なパターン・型・テクニックを3〜7個抽出してください。

【分析結果】
${analysisContent.slice(0, 8000)}

【出力形式】JSON配列のみを返してください。説明文や前置きは不要です。

[
  {
    "title": "パターン名（簡潔に、20字以内）",
    "category": "🏗 構成 | 🎯 見出し | 💡 フック | 🧠 心理トリガー | 📊 マーケティング | 🎭 文体・口調 | 📚 ストーリーテリング | 🎁 ベネフィット提示 | 🏆 信頼性演出 | ⏰ 緊急性・希少性 のいずれか",
    "framework": "影響力の武器 / 行動経済学 / コピーライティング / 心理学 / マーケティング のいずれか",
    "description": "パターンの説明（100〜200字、なぜ効くのか、心理的・行動経済学的な背景）",
    "structure": "型の構造（具体的なテンプレート、3〜5行程度。{変数} を使ってもよい）",
    "examples": ["具体例1", "具体例2", "具体例3"],
    "applicableScenarios": ["使えるシーン1", "使えるシーン2", "使えるシーン3"],
    "tags": "カンマ区切りタグ（例: 見出し,数字,note）"
  }
]

【媒体】${mediaType}
【件数】3〜7個（質を優先、無理に増やさない）`;

  try {
    const raw = await generateWithModel(model, userPrompt, systemPrompt, 8000);

    // JSON 抽出（モデルが余計な装飾を付けるケースに対応）
    let jsonText = raw.trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
    if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');
    if (startIdx >= 0 && endIdx > startIdx) {
      jsonText = jsonText.slice(startIdx, endIdx + 1);
    }

    const patterns = JSON.parse(jsonText);
    if (!Array.isArray(patterns)) {
      throw new Error('Expected array of patterns');
    }

    return new Response(
      JSON.stringify({
        patterns,
        sourceAnalysisId,
        mediaType,
        extractedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[buzz-pattern-extract] error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Pattern extraction failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
