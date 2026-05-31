import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 生成に時間がかかるためタイムアウトを延長
export const maxDuration = 300;

export async function POST(req: Request) {
  const { original, evaluation, improvements, model } = await req.json();

  if (!original || typeof original !== 'string') {
    return NextResponse.json({ error: '元の文章がありません' }, { status: 400 });
  }

  // デフォルトは最高品質の Opus 4.8
  const useModel = typeof model === 'string' && model ? model : 'claude-opus-4-8';
  const improvementList: string[] = Array.isArray(improvements) ? improvements : [];

  const prompt = `あなたはクリニックのハンドブック編集者です。
以下の文章を、評価と改善案に沿って修正してください。

【元の文章】
${original}

【評価】
${evaluation || '（評価コメントなし）'}

【反映すべき改善案】
${improvementList.length ? improvementList.map((s, i) => `${i + 1}. ${s}`).join('\n') : '（特になし。評価を踏まえて自然に改善してください）'}

【ルール】
- 元の文章の良い点（原体験の具体性、誠実な語り口、温かみなど）は必ず保持する
- 改善案を自然に文章へ反映する（無理に詰め込まない）
- クリニックの理念（AIR：感謝・誠実・分かち愛／インサイドアウト・先払い・リードマネジメント・ティール組織）に沿う
- 修正した文章のみを出力（説明・前置き・後書き不要）`;

  try {
    const message = await anthropic.messages.create({
      model: useModel,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const revised = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    if (!revised) return NextResponse.json({ error: '修正文を生成できませんでした' });
    return NextResponse.json({ revised });
  } catch (e: any) {
    console.error('[auto-revise] 生成失敗:', e?.message);
    return NextResponse.json({ error: e?.message || '修正文の生成に失敗しました' });
  }
}
