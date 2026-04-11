import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffName, discussion, achievements, challenges, actionItems, aiAnalysis, growthStage } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはリードマネジメントの専門家です。
1on1の記録を読んで、次回の1on1で院長が使える「問いかけ」を提案してください。
リードマネジメントの原則（内発的動機・5大欲求・インサイドアウト）に基づき、
スタッフが自分で気づき・自分で動けるような問いかけを心がけてください。`,
    'mindset'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `【今回の1on1記録】
スタッフ名：${staffName}
成長段階：${growthStage || '未記録'}
話し合った内容：${discussion || '未記録'}
達成・成長したこと：${achievements || '未記録'}
課題・困っていること：${challenges || '未記録'}
次回までのアクション：${actionItems || '未記録'}
AI分析メモ：${aiAnalysis || '未記録'}

次回の1on1で院長が使える問いかけを3つ提案してください。

以下の形式で返してください：
【問いかけ①】
（問いかけの文章）
→ 意図：（この問いかけでスタッフに気づいてほしいこと）

【問いかけ②】
（問いかけの文章）
→ 意図：（この問いかけでスタッフに気づいてほしいこと）

【問いかけ③】
（問いかけの文章）
→ 意図：（この問いかけでスタッフに気づいてほしいこと）`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ result });
}
