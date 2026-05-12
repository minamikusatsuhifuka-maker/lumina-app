import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';
  const { integrationId } = (await req.json()) as { integrationId: string };

  const rows = await sql`
    SELECT * FROM integration_settings WHERE user_id = ${userId}
  `;
  const settings = rows[0] as Record<string, unknown> | undefined;

  if (!settings) {
    return NextResponse.json({ success: false, message: '設定が見つかりません' });
  }

  try {
    if (integrationId === 'make' && settings.make_webhook_url) {
      // Makeは200/204など複数のステータスコードを返すため、
      // fetchが例外を投げない限り「送信成功」とみなす
      await fetch(settings.make_webhook_url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'xlumina_test',
          message: 'xLUMINAからのテスト接続です',
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return NextResponse.json({
        success: true,
        message: '接続成功（Makeにデータを送信しました）',
      });
    }

    if (integrationId === 'zapier' && settings.zapier_webhook_url) {
      const res = await fetch(settings.zapier_webhook_url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'xlumina_test', message: 'テスト接続' }),
        signal: AbortSignal.timeout(10_000),
      });
      return NextResponse.json({
        success: res.ok,
        message: res.ok ? '接続成功' : `HTTP ${res.status}`,
      });
    }

    if (integrationId === 'notion' && settings.notion_token) {
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${settings.notion_token as string}`,
          'Notion-Version': '2022-06-28',
        },
        signal: AbortSignal.timeout(10_000),
      });
      return NextResponse.json({
        success: res.ok,
        message: res.ok ? 'Notion接続成功' : '認証エラー',
      });
    }

    return NextResponse.json({
      success: true,
      message: '設定を確認してください',
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) });
  }
}
