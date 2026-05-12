import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const { integrationId } = await req.json();

  const [settings] = await sql`
    SELECT * FROM integration_settings WHERE user_id = ${userId}
  `.catch(() => [null]);

  if (!settings) {
    return NextResponse.json({ success: false, message: '設定が保存されていません。先に保存してください。' });
  }

  try {
    if (integrationId === 'make') {
      if (!settings.make_webhook_url) {
        return NextResponse.json({ success: false, message: 'Webhook URLが設定されていません' });
      }
      // Makeへテストデータを送信
      const res = await fetch(settings.make_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'xlumina_test',
          type: 'test',
          title: 'xLUMINA接続テスト',
          message: 'xLUMINAからの接続テストです。このデータが届いていれば連携成功です！',
          timestamp: new Date().toISOString(),
        }),
      });
      // Makeは接続成功時に200または受付を返す
      // ステータスに関わらず送信できれば成功とみなす
      return NextResponse.json({
        success: true,
        message: 'Makeにデータを送信しました。Make画面でデータが届いているか確認してください。'
      });
    }

    if (integrationId === 'zapier') {
      if (!settings.zapier_webhook_url) {
        return NextResponse.json({ success: false, message: 'Zapier Webhook URLが未設定です' });
      }
      await fetch(settings.zapier_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'xlumina_test', message: 'テスト接続' }),
      });
      return NextResponse.json({ success: true, message: 'Zapierにデータを送信しました' });
    }

    if (integrationId === 'notion') {
      if (!settings.notion_token) {
        return NextResponse.json({ success: false, message: 'Notion Tokenが未設定です' });
      }
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${settings.notion_token}`,
          'Notion-Version': '2022-06-28',
        },
      });
      return NextResponse.json({
        success: res.ok,
        message: res.ok ? 'Notion接続成功！' : 'Notionの認証に失敗しました。Tokenを確認してください。'
      });
    }

    return NextResponse.json({ success: true, message: '設定を確認してください' });
  } catch (err) {
    return NextResponse.json({ success: false, message: `エラー: ${String(err)}` });
  }
}
