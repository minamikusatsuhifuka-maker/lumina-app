import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { author, rating, text } = await req.json();
    if (typeof rating !== 'number') {
      return NextResponse.json({ error: 'rating が必要です' }, { status: 400 });
    }

    // 評価に応じたトーンを決定
    let tone: 'positive' | 'negative' | 'neutral';
    if (rating >= 4) tone = 'positive';
    else if (rating <= 2) tone = 'negative';
    else tone = 'neutral';

    const toneInstructions: Record<typeof tone, string> = {
      positive:
        '感謝の気持ちを丁寧に伝え、再来院を促す温かく前向きなトーンで。絵文字は使わず、敬語を基調に。',
      negative:
        'まず真摯にお詫びし、問題点を具体的に受け止め、改善への取り組みを伝える誠実なトーンで。言い訳や反論は一切しない。',
      neutral:
        'ご来院への感謝を伝えつつ、ご意見への丁寧な受け止めと今後の改善姿勢を示すバランスの取れたトーンで。',
    };

    const prompt = `あなたは皮膚科クリニックの院長秘書です。患者さまからの口コミに対する返信文案を3パターン作成してください。

## 口コミ情報
- 投稿者: ${author || '匿名'}
- 評価: ${rating}/5
- 内容: ${text || '（本文なし）'}

## 返信のトーン指示
${toneInstructions[tone]}

## 作成ルール
- 返信は南草津皮フ科クリニック（滋賀県）の公式返信として丁寧な日本語で
- 1パターンあたり120〜200文字程度
- 患者さまのプライバシーに配慮し、具体的な症状や治療内容には触れない
- 冒頭で「この度はご来院ありがとうございました」系の挨拶を入れる
- 3パターンは文体・切り口を変えて差別化する

## 出力フォーマット（必ずこのJSON）
{
  "tone": "${tone}",
  "drafts": [
    { "style": "パターン名", "text": "返信本文" },
    { "style": "パターン名", "text": "返信本文" },
    { "style": "パターン名", "text": "返信本文" }
  ]
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const resText = result.response.text();
    const jsonMatch = resText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        tone,
        drafts: [{ style: '標準', text: resText.slice(0, 400) }],
      });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      tone: parsed.tone || tone,
      drafts: parsed.drafts || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[reviews/reply-draft] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
