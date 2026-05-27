import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
// Vercel デフォルト 300s に合わせる（Claude/Gemini で大きめ max_tokens を使うため）
export const maxDuration = 300;

interface RequestBody {
  analysisContent: string;
  mediaType?: string;
  sourceAnalysisId?: string;
  model?: AIModel;
}

export async function POST(req: NextRequest) {
  // すべての例外を NextResponse.json で返す外殻
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body) {
      return NextResponse.json(
        { error: 'リクエストボディが不正です' },
        { status: 400 },
      );
    }

    const {
      analysisContent,
      mediaType = 'note',
      sourceAnalysisId,
      model = 'claude',
    } = body;

    if (
      !analysisContent ||
      typeof analysisContent !== 'string' ||
      analysisContent.length < 100
    ) {
      return NextResponse.json(
        { error: 'analysisContent is required (min 100 chars)' },
        { status: 400 },
      );
    }

    // 入力長の安全装置（極端に長い入力でモデルがタイムアウトするのを防ぐ）
    const MAX_INPUT_CHARS = 30000;
    const safeText =
      analysisContent.length > MAX_INPUT_CHARS
        ? analysisContent.slice(0, MAX_INPUT_CHARS)
        : analysisContent;

    const systemPrompt = `あなたはコンテンツマーケティング・コピーライティングの専門家として、バズり分析の結果から「再利用可能な型・パターン・テクニック」を抽出する役割です。

抽出する条件:
- 他の記事・コンテンツでも応用できる汎用性のある型のみ
- 「この記事固有の話題」ではなく「型としての構造」を抽出
- 1パターンあたり、明確な使い方・効果・具体例を含む
- 心理学・行動経済学・影響力の武器の理論に基づくものを優先

出力は厳密にJSON形式で、配列形式で複数のパターンを返してください。`;

    const userPrompt = `以下のバズり分析の結果から、再利用可能なパターン・型・テクニックを3〜7個抽出してください。

【分析結果】
${safeText.slice(0, 8000)}

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

    // AI 呼び出しは個別に try-catch（タイムアウト/レート制限/safety filter を区別）
    let raw: string;
    try {
      raw = await generateWithModel(model, userPrompt, systemPrompt, 8000);
    } catch (geminiErr: any) {
      console.error('[buzz-pattern-extract] AI呼び出し失敗:', geminiErr);
      return NextResponse.json(
        {
          error: `AI抽出に失敗しました: ${geminiErr?.message || 'unknown'}`,
        },
        { status: 502 },
      );
    }

    if (!raw || !raw.trim()) {
      return NextResponse.json(
        { error: 'AIから空の応答が返りました（safety filter等の可能性）' },
        { status: 502 },
      );
    }

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

    let patterns: unknown;
    try {
      patterns = JSON.parse(jsonText);
    } catch (parseErr: any) {
      console.error(
        '[buzz-pattern-extract] JSONパース失敗。生応答 (先頭500字):',
        raw.slice(0, 500),
      );
      return NextResponse.json(
        {
          error: `AI応答のJSON解析に失敗しました: ${parseErr?.message || 'parse error'}`,
        },
        { status: 502 },
      );
    }

    if (!Array.isArray(patterns)) {
      return NextResponse.json(
        { error: 'AI応答が配列形式ではありません' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      patterns,
      sourceAnalysisId,
      mediaType,
      extractedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[buzz-pattern-extract] 致命的エラー:', err);
    return NextResponse.json(
      { error: err?.message || 'サーバー内部エラー' },
      { status: 500 },
    );
  }
}
