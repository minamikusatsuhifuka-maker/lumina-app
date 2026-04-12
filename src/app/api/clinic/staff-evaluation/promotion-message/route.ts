import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffName, grade } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはリードマネジメントの専門家です。
スタッフの昇格を心から祝うメッセージを作成してください。
インサイドアウト・先払い哲学・自律的成長の観点から、
スタッフが誇りと次への意欲を感じられる言葉を選んでください。`,
    'grade'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `スタッフが昇格しました。院長からのお祝いメッセージを作成してください。

スタッフ名：${staffName}
昇格した等級：${grade}

条件：
- 4〜5文の温かく誇りを感じるメッセージ
- 昇格した等級の意味・次の広がりを感じさせる
- このスタッフへの期待と感謝を込める
- 「${staffName}さん」から始める
- メッセージのみ返す（説明文・記号・見出し不要）`,
      }],
    }),
  });

  const data = await response.json();
  const message = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  return NextResponse.json({ message });
}
