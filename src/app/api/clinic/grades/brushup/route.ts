import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeLevel, name, description, requirementsPromotion } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはクリニックの等級制度設計の専門家です。
ティール型組織・インサイドアウト・リードマネジメントの哲学に基づき、
スタッフが「なりたい」と思える、温かみのある等級説明文を書いてください。`,
    'grade'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下の等級情報をブラッシュアップしてください。

等級：G${gradeLevel}（${name}）
現在の説明：${description || '未設定'}
現在の昇格条件：${requirementsPromotion || '未設定'}

以下の形式で返してください：
【改善説明文】
（この等級にいるスタッフがどんな存在か、温かみと誇りを感じられる2〜3文）

【改善昇格条件】
（次の等級に進むための条件を、義務ではなく成長の選択として表現した2〜3文）

【一言メッセージ】
（この等級のスタッフへの院長からの一言・20字以内）`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ result });
}
