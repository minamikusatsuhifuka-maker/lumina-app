import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { month, staffSummary } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはリードマネジメントの専門家です。
クリニックのスタッフ成長レポートを作成してください。
院長がスタッフの成長を把握し、次の関わり方を考えるための月次レポートです。
温かく・具体的で・行動につながる内容にしてください。`,
    'mindset'
  );

  const staffText = Array.isArray(staffSummary)
    ? staffSummary.map((s: any) =>
        `- ${s.name}（${s.position || '職種未設定'}）: 等級G${s.grade_level_number || '未設定'}, 評価${s.total_score || '未実施'}点, 最終1on1${s.last_meeting_days === null ? '未実施' : s.last_meeting_days + '日前'}, ステージ${s.last_growth_stage || '未記録'}`
      ).join('\n')
    : '（スタッフデータなし）';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `${month}のクリニックスタッフ成長レポートを作成してください。

スタッフ情報（${Array.isArray(staffSummary) ? staffSummary.length : 0}名）：
${staffText}

以下の構成でシンプルに書いてください。Markdownの見出しは##まで使用可。太字は最小限に。

## 今月のハイライト
・（チーム全体の成長・特筆すべき変化を3点箇条書き）

## 院長へのメッセージ
（リードマネジメントの観点から、来月に向けた温かい言葉・2〜3文）

## 来月フォーカス
・（特に関わりを深めると良いスタッフや領域を2〜3点）`,
      }],
    }),
  });

  const data = await response.json();
  const report = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  return NextResponse.json({ report });
}
