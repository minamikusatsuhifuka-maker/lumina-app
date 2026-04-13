import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffName, position, achievements, growthStages, aiComment } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはリードマネジメントの専門家です。スタッフの強みを具体的な言葉で表現してください。`,
    'mindset'
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
      max_tokens: 200,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `スタッフ情報をもとに、このスタッフの「強み・特徴タグ」を3〜5個生成してください。

名前：${staffName} / 職種：${position || '未設定'}
1on1の達成内容：${achievements || '未記録'}
成長ステージ変化：${growthStages || '未記録'}
評価コメント：${aiComment || '未記録'}

タグの例：「患者への共感力が高い」「自ら動ける主体性」「後輩への指導力」「細部への注意力」「チームの潤滑油」「学習意欲が旺盛」「安定した業務遂行力」

必ずJSON配列のみで返してください（説明・マークダウン不要）：
["タグ1", "タグ2", "タグ3"]`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const tags = JSON.parse(clean);
    if (Array.isArray(tags)) return NextResponse.json({ tags });
    return NextResponse.json({ tags: [] });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
