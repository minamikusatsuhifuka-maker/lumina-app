import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { robustJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ② Google通報支援：該当しそうなポリシー指摘＋通報文（違反根拠の説明）を自動生成。
// 送信はしない（外部アプリからGoogleへ自動通報はできない）。文面生成のみ。
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { author, rating, text, riskType } = await req.json();

    const prompt = `あなたはGoogleビジネスプロフィールのクチコミポリシーに精通した専門家です。
クリニック（南草津皮フ科・滋賀県）が、明らかなポリシー違反の疑いがあるクチコミをGoogleに報告するための「報告文」の素案を作成します。

## 対象クチコミ
- 投稿者: ${author || '匿名'}
- 評価: ${rating ?? '不明'}/5
- 本文: ${text || '（本文なし）'}
- AIによる一次リスク判定: ${riskType || '未判定'}

## 作成ルール（重要）
- **客観的事実ベース**で記述し、感情的・攻撃的な表現は使わない（淡々と違反根拠を述べる）
- 該当しそうなGoogleポリシー区分を明示（なりすまし/利益相反/スパム/不適切なコンテンツ/個人情報 等）
- 「実体験に基づく単なる低評価」はポリシー違反ではない。違反の確証が薄い場合はその旨を正直に書き、無理に違反と断定しない
- 報告文は150〜300字程度。Googleの報告フォームにそのまま貼れる体裁

## 出力（必ずこのJSONのみ。前置き・コードフェンス禁止）
{
  "policy": "<該当しそうなポリシー区分（例: なりすまし・利益相反 / スパム・虚偽のエンゲージメント / 個人情報 / 不適切なコンテンツ など）>",
  "confidence": "<高い|中程度|低い（違反の確からしさ）>",
  "report_text": "<Googleへの報告文（客観的事実ベース・感情的表現なし）>"
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
    });

    const raw = result.response.text();
    const parsed = robustJsonParse<{ policy?: string; confidence?: string; report_text?: string }>(raw);

    return NextResponse.json({
      policy: parsed.policy || '判定不能',
      confidence: parsed.confidence || '低い',
      report_text: parsed.report_text || '',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/report-draft] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
