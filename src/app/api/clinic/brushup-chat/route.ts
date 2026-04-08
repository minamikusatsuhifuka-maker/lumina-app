import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

const CONTEXT_PROMPTS: Record<string, string> = {
  'AI判断基準': 'AIの判断基準・価値観の専門家として、クリニックのAI判断基準をより深く・具体的・一貫性のあるものに改善してください。',
  '理念': 'クリニック理念の言語化専門家として、院長の想いがスタッフと患者に伝わる、心に響く理念文章に改善してください。',
  '行動基準': 'クリニックの行動基準・レッドゾーン設計の専門家として、スタッフが迷わず判断できる明確な基準に改善してください。',
  '就業規則': '医療クリニックの就業規則専門家として、スタッフが安心して働ける、温かみのある就業規則に改善してください。',
  '等級制度': 'スタッフ成長支援の専門家として、スタッフが自分の成長を実感できる等級制度に改善してください。',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { chatMode, contextLabel, contextContent, messages } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const basePrompt = CONTEXT_PROMPTS[contextLabel] || `${contextLabel}の専門家として改善をサポートしてください。`;

  let modePrompt = '';
  if (chatMode === 'propose') {
    modePrompt = `院長が「こうしたい」と話しかけてきます。具体的な改善案を【案①】【案②】の形で2〜3パターン提示し、「どれが近いですか？」と問いかけてください。`;
  } else if (chatMode === 'analyze') {
    modePrompt = `以下の観点で分析し、★5段階評価と具体的改善提案を返してください：
1. 📖 わかりやすさ
2. 💡 具体性・行動につながるか
3. ❤️ 温かみ・スタッフへの敬意
4. 🔄 一貫性・矛盾がないか
5. ✅ 完全性・抜けがないか`;
  } else {
    modePrompt = `院長と自由に対話してください。具体的な改善文章を提示する際は\n---\n（改善文章）\n---\nの形式で囲んでください。`;
  }

  const systemPrompt = await buildSystemContext(
    `${basePrompt}\n\n${modePrompt}\n\n【現在の${contextLabel}の内容】\n${contextContent || '（まだ内容がありません）'}`,
    'handbook'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages || [{ role: 'user', content: `この${contextLabel}を分析してください。` }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ result });
}
