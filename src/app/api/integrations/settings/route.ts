import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const rows = await sql`
    SELECT * FROM integration_settings WHERE user_id = ${userId}
  `;
  const settings = rows[0] as Record<string, unknown> | undefined;
  // トークン類はマスキングして返す
  if (settings) {
    if (typeof settings.notion_token === 'string' && settings.notion_token) {
      settings.notion_token = '••••' + settings.notion_token.slice(-4);
    }
    if (typeof settings.x_api_key === 'string' && settings.x_api_key) {
      settings.x_api_key = '••••' + settings.x_api_key.slice(-4);
    }
  }
  return NextResponse.json({ settings: settings ?? null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';
  const body = (await req.json()) as Record<string, unknown>;

  const rows = await sql`
    INSERT INTO integration_settings (
      user_id,
      notion_token, notion_database_id, notion_enabled,
      x_api_key, x_api_secret, x_access_token, x_access_secret, x_enabled,
      make_webhook_url, make_enabled,
      zapier_webhook_url, zapier_enabled,
      sheets_spreadsheet_id, sheets_enabled,
      trigger_on_pipeline_complete, trigger_on_blog_published
    ) VALUES (
      ${userId},
      ${(body.notionToken as string) ?? null},
      ${(body.notionDatabaseId as string) ?? null},
      ${(body.notionEnabled as boolean) ?? false},
      ${(body.xApiKey as string) ?? null},
      ${(body.xApiSecret as string) ?? null},
      ${(body.xAccessToken as string) ?? null},
      ${(body.xAccessSecret as string) ?? null},
      ${(body.xEnabled as boolean) ?? false},
      ${(body.makeWebhookUrl as string) ?? null},
      ${(body.makeEnabled as boolean) ?? false},
      ${(body.zapierWebhookUrl as string) ?? null},
      ${(body.zapierEnabled as boolean) ?? false},
      ${(body.sheetsSpreadsheetId as string) ?? null},
      ${(body.sheetsEnabled as boolean) ?? false},
      ${(body.triggerOnPipelineComplete as boolean) ?? true},
      ${(body.triggerOnBlogPublished as boolean) ?? true}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      notion_token = COALESCE(NULLIF(${(body.notionToken as string) ?? ''}, ''), integration_settings.notion_token),
      notion_database_id = COALESCE(${(body.notionDatabaseId as string) ?? null}, integration_settings.notion_database_id),
      notion_enabled = ${(body.notionEnabled as boolean) ?? false},
      x_enabled = ${(body.xEnabled as boolean) ?? false},
      make_webhook_url = COALESCE(NULLIF(${(body.makeWebhookUrl as string) ?? ''}, ''), integration_settings.make_webhook_url),
      make_enabled = ${(body.makeEnabled as boolean) ?? false},
      zapier_webhook_url = COALESCE(NULLIF(${(body.zapierWebhookUrl as string) ?? ''}, ''), integration_settings.zapier_webhook_url),
      zapier_enabled = ${(body.zapierEnabled as boolean) ?? false},
      sheets_enabled = ${(body.sheetsEnabled as boolean) ?? false},
      trigger_on_pipeline_complete = ${(body.triggerOnPipelineComplete as boolean) ?? true},
      trigger_on_blog_published = ${(body.triggerOnBlogPublished as boolean) ?? true},
      updated_at = NOW()
    RETURNING id, user_id, notion_enabled, x_enabled, make_enabled, zapier_enabled, sheets_enabled
  `;
  return NextResponse.json({ settings: rows[0] });
}
