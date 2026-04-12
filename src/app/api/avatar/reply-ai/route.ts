import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { comment, avatarName, avatarTone, avatarExpertise, replyGoal } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!comment) {
    return NextResponse.json({ error: 'コメントは必須です' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `あなたはSNSコミュニケーションの専門家です。アバターキャラクターの声でコメントへの返信を生成してください。

アバター設定:
- 名前: ${avatarName || 'アバター'}
- 口調: ${avatarTone || 'カジュアル'}
- 専門分野: ${avatarExpertise || '指定なし'}
- 返信の目的: ${replyGoal || 'エンゲージメント向上'}

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "reply": "返信テキスト",
  "tone_check": "トーンが適切かのチェック結果と補足",
  "engagement_tip": "このやり取りでエンゲージメントを高めるコツ",
  "follow_up_question": "会話を続けるためのフォローアップ質問"
}`,
        messages: [{
          role: 'user',
          content: `以下のコメントに対してアバターの声で返信を生成してください。

【コメント】
${comment}`,
        }],
      }),
    });

    const data = await response.json();
    let text = data.content?.[0]?.text ?? '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `返信生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
