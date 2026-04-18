import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { year, month } = await req.json();

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const reports = await sql`
    SELECT report_type, notice_category, incident, reflection,
           prevention_team, same_experience_count, status, reporter_name
    FROM near_miss_reports
    WHERE created_at >= ${start} AND created_at < ${end}
    ORDER BY created_at DESC
  `;

  if ((reports as any[]).length === 0) {
    return NextResponse.json({ summary: 'この期間のシェアはありませんでした。', count: 0 });
  }

  const reportText = (reports as any[]).map((r, i) =>
    `[${i + 1}] 種類:${r.report_type === 'near_miss' ? 'ヒヤリハット' : '気づきシェア'} ` +
    `カテゴリ:${r.notice_category ?? '-'} 内容:${r.incident?.slice(0, 100)} ` +
    `同じ経験:${r.same_experience_count}件 ステータス:${r.status}`
  ).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `以下は${year}年${month}月のヒヤリハット・気づきシェアの一覧です。
チームの朝礼や月次ミーティングで共有できる、温かく前向きな月次まとめを作成してください。

${reportText}

## まとめの構成
1. **今月の全体サマリー**（件数・傾向・特徴を2〜3文で）
2. **特に多かったテーマ・気づき**（上位2〜3テーマ）
3. **今月の学び・チームへの贈り物**（このデータから見えるチームの強み）
4. **来月に向けて**（前向きなメッセージ・アクション提案）

## トーン
- 温かく、チームを讃える前向きな表現
- リードマネジメントの精神（責めない・承認・内発的動機）
- 「みなさんのおかげで」「チームの力で」という表現を使う
- 400〜500文字程度

まとめのテキストのみ出力してください。`,
    }],
  });

  const summary = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ summary, count: (reports as any[]).length });
}
