import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_TEXT_MODEL } from '@/lib/ai-models';
import { neon } from '@neondatabase/serverless';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { ensureReviewManagementSchema } from '@/lib/review-management';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface DbReview {
  id: number;
  author_name: string;
  rating: number;
  text: string | null;
}

interface RiskItem {
  id: number;
  risk_flag: boolean;
  risk_type: string;
  risk_score: number;
  risk_reason: string;
}

// ① 悪質口コミの検知・フラグ付与（AI判定）。
// 「実体験に基づく否定的レビュー」はポリシー違反ではないため過剰フラグしない。
export async function POST() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureReviewManagementSchema(sql);

    const reviews = (await sql`
      SELECT id, author_name, rating, text
      FROM clinic_reviews
      ORDER BY created_at DESC
    `) as DbReview[];

    if (!reviews.length) {
      return NextResponse.json({ results: [], analyzed: 0 });
    }

    const reviewList = reviews
      .map((r) => `- id:${r.id} / 評価:${r.rating}★ / 投稿者:${r.author_name}\n  本文: ${r.text ?? '（本文なし）'}`)
      .join('\n');

    const prompt = `あなたは皮膚科クリニックの評判管理とGoogleクチコミポリシーに精通した専門家です。
以下の各クチコミについて、Googleのコンテンツポリシー違反の「疑い」があるかをリスク判定してください。

## 最重要の線引き（過剰フラグの防止）
- 「実体験に基づく否定的・低評価のレビュー」は **ポリシー違反ではありません**。たとえ★1でも、待ち時間・対応・料金などへの正当な不満は **フラグしない**（risk_flag=false, risk_type="単なる低評価"）。
- フラグすべきは、ポリシー違反の疑いがある以下のような場合のみ:
  - 暴言/誹謗中傷（人格攻撃・侮辱・差別表現）
  - 事実無根/虚偽の疑い（受診歴がなさそう・明らかに事実と異なる断定）
  - 同業者・関係者の妨害疑い（利益相反・なりすまし）
  - スパム/無関係（宣伝・無関係な内容・コピペ）
  - 個人情報/プライバシー（実名の暴露・スタッフ個人の特定攻撃など）

## 判定対象のクチコミ
${reviewList}

## 出力（必ずこのJSONのみ。前置き・後置き・コードフェンス禁止）
{
  "results": [
    {
      "id": <クチコミのid（整数）>,
      "risk_flag": <true=ポリシー違反の疑いあり / false=問題なし・単なる低評価>,
      "risk_type": "<暴言/誹謗中傷|事実無根/虚偽の疑い|同業者・関係者の妨害疑い|スパム/無関係|個人情報/プライバシー|単なる低評価>",
      "risk_score": <0〜100。違反の疑いの強さ。単なる低評価や好意的レビューは0〜20>,
      "risk_reason": "<判定理由を1〜2文で客観的に。ポリシーのどの観点かに触れる>"
    }
  ]
}
全${reviews.length}件すべてについて results に含めてください。`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_TEXT_MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // truncation対策：JSON固定出力＋十分な出力枠を確保
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
    });

    const raw = result.response.text();
    const parsed = robustJsonParse<{ results?: RiskItem[] }>(raw);
    const items: RiskItem[] = Array.isArray(parsed?.results) ? parsed.results : [];

    const validIds = new Set(reviews.map((r) => r.id));
    let updated = 0;
    for (const it of items) {
      const id = Number(it.id);
      if (!validIds.has(id)) continue;
      const flag = Boolean(it.risk_flag);
      const score = Number.isFinite(Number(it.risk_score)) ? Math.max(0, Math.min(100, Math.round(Number(it.risk_score)))) : null;
      await sql`
        UPDATE clinic_reviews
        SET risk_flag = ${flag},
            risk_type = ${it.risk_type ?? null},
            risk_reason = ${it.risk_reason ?? null},
            risk_score = ${score},
            analyzed_at = NOW()
        WHERE id = ${id}
      `;
      updated++;
    }

    return NextResponse.json({
      results: items,
      analyzed: reviews.length,
      updated,
      flagged: items.filter((i) => i.risk_flag).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/analyze] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
