import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ContactLog {
  log_date: string;
  web_bookings: number;
  phone_bookings: number;
  line_inquiries: number;
  other_inquiries: number;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { logs, gaSessions } = await req.json();
    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: 'logs が必要です' }, { status: 400 });
    }

    const typedLogs = logs as ContactLog[];
    const totalWeb = typedLogs.reduce((s, l) => s + (l.web_bookings || 0), 0);
    const totalPhone = typedLogs.reduce((s, l) => s + (l.phone_bookings || 0), 0);
    const totalLine = typedLogs.reduce((s, l) => s + (l.line_inquiries || 0), 0);
    const totalOther = typedLogs.reduce((s, l) => s + (l.other_inquiries || 0), 0);
    const totalContacts = totalWeb + totalPhone + totalLine + totalOther;
    const conversionRate = gaSessions > 0 ? (totalContacts / gaSessions) * 100 : 0;

    const recent = typedLogs.slice(0, 14);

    const prompt = `あなたは皮膚科クリニックのマーケティング責任者です。
直近の問い合わせ・予約ログとGA4セッション数から、転換率改善策を日本語で提案してください。

## 集計データ
- 期間内合計: Web予約 ${totalWeb} / 電話予約 ${totalPhone} / LINE問い合わせ ${totalLine} / その他 ${totalOther}
- 合計問い合わせ数: ${totalContacts}
- GA4セッション数(同期間): ${gaSessions}
- セッション→予約転換率: ${conversionRate.toFixed(2)}%

## 日次ログ(直近14日)
${recent.map((l) => `${l.log_date}: Web${l.web_bookings} / 電話${l.phone_bookings} / LINE${l.line_inquiries} / 他${l.other_inquiries}`).join('\n')}

## 回答フォーマット（必ずこのJSON形式）
{
  "summary": "全体サマリー（2〜3文）",
  "insights": [
    { "title": "気づき", "body": "詳細", "type": "positive|warning|info" }
  ],
  "recommendations": [
    { "title": "改善策", "description": "具体策", "priority": "high|medium|low" }
  ]
}

指示:
- insights は 3〜5 個（チャネル偏り・曜日変動・転換率の評価など）
- recommendations は 4〜6 個（Web予約導線改善、LINE誘導、電話受付改善、LPのCTA改善 等）
- 皮膚科クリニックの実務視点で`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        summary: text.slice(0, 200),
        insights: [],
        recommendations: [],
      });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      summary: parsed.summary || '',
      insights: parsed.insights || [],
      recommendations: parsed.recommendations || [],
      conversionRate,
      totalContacts,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[contacts/insight] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
