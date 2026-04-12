import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffName, meetingDate, achievements, challenges, growthStage } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはリードマネジメントの専門家です。
院長からスタッフへの称賛メッセージを作成してください。
温かく・具体的で・LINEやSlackで送れる自然な文体で書いてください。`,
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
      max_tokens: 400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `1on1の記録をもとに、院長からスタッフへの称賛メッセージを作成してください。

スタッフ名：${staffName}
面談日：${meetingDate}
達成・成長したこと：${achievements || '未記録'}
課題・取り組み：${challenges || '未記録'}
成長ステージ：${growthStage || '未記録'}

条件：
- 3〜4文の温かいメッセージ
- スタッフの具体的な行動・成長を称える内容
- 次への期待と応援を込める
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
