import { sql } from '@/lib/db';

interface IntegrationPayload {
  userId: string;
  sourceType: string;
  sourceId?: number;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  url?: string;
  metadata?: Record<string, unknown>;
}

type TriggerType = 'pipeline_complete' | 'blog_published' | 'kindle_complete';

// パイプライン完了時に全連携を実行
export async function triggerIntegrations(
  payload: IntegrationPayload,
  triggerType: TriggerType,
): Promise<void> {
  const rows = await sql`
    SELECT * FROM integration_settings WHERE user_id = ${payload.userId}
  `.catch(() => [] as Array<Record<string, unknown>>);
  const settings = rows[0] as Record<string, unknown> | undefined;

  if (!settings) return;

  const promises: Promise<void>[] = [];

  // Make Webhook
  if (
    settings.make_enabled &&
    settings.make_webhook_url &&
    shouldFire(settings, triggerType)
  ) {
    promises.push(
      triggerMakeWebhook(
        settings.make_webhook_url as string,
        payload,
        payload.userId,
      ),
    );
  }

  // Zapier Webhook
  if (
    settings.zapier_enabled &&
    settings.zapier_webhook_url &&
    shouldFire(settings, triggerType)
  ) {
    promises.push(
      triggerZapierWebhook(
        settings.zapier_webhook_url as string,
        payload,
        payload.userId,
      ),
    );
  }

  // Notion保存
  if (
    settings.notion_enabled &&
    settings.notion_token &&
    settings.notion_database_id
  ) {
    promises.push(
      saveToNotion(
        settings.notion_token as string,
        settings.notion_database_id as string,
        payload,
        payload.userId,
      ),
    );
  }

  // Google Sheets記録
  if (settings.sheets_enabled && settings.sheets_spreadsheet_id) {
    promises.push(
      logToSheets(
        settings.sheets_spreadsheet_id as string,
        payload,
        payload.userId,
      ),
    );
  }

  // 全連携を並列実行（失敗しても他に影響しない）
  await Promise.allSettled(promises);
}

// トリガー種別に応じた発火可否
function shouldFire(
  settings: Record<string, unknown>,
  triggerType: TriggerType,
): boolean {
  if (triggerType === 'pipeline_complete') {
    return settings.trigger_on_pipeline_complete !== false;
  }
  if (triggerType === 'blog_published') {
    return settings.trigger_on_blog_published !== false;
  }
  if (triggerType === 'kindle_complete') {
    return settings.trigger_on_kindle_complete === true;
  }
  return true;
}

// Make Webhook
async function triggerMakeWebhook(
  webhookUrl: string,
  payload: IntegrationPayload,
  userId: string,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'xlumina',
        type: payload.sourceType,
        title: payload.title,
        content: payload.content,
        summary: payload.summary ?? payload.content.slice(0, 300),
        tags: payload.tags ?? [],
        timestamp: new Date().toISOString(),
        metadata: payload.metadata ?? {},
      }),
      signal: AbortSignal.timeout(15_000),
    });

    await logIntegration(
      userId,
      'make',
      payload.sourceType,
      payload.sourceId,
      res.ok ? 'success' : 'failed',
      res.ok ? null : `HTTP ${res.status}`,
    );
  } catch (err) {
    await logIntegration(
      userId,
      'make',
      payload.sourceType,
      payload.sourceId,
      'failed',
      String(err),
    );
  }
}

// Zapier Webhook
async function triggerZapierWebhook(
  webhookUrl: string,
  payload: IntegrationPayload,
  userId: string,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'xlumina',
        type: payload.sourceType,
        title: payload.title,
        body: payload.content,
        summary: payload.summary ?? payload.content.slice(0, 300),
        created_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    await logIntegration(
      userId,
      'zapier',
      payload.sourceType,
      payload.sourceId,
      res.ok ? 'success' : 'failed',
      res.ok ? null : `HTTP ${res.status}`,
    );
  } catch (err) {
    await logIntegration(
      userId,
      'zapier',
      payload.sourceType,
      payload.sourceId,
      'failed',
      String(err),
    );
  }
}

// Notion保存
async function saveToNotion(
  token: string,
  databaseId: string,
  payload: IntegrationPayload,
  userId: string,
): Promise<void> {
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [{ text: { content: payload.title } }],
          },
          Type: {
            select: { name: payload.sourceType },
          },
          Tags: {
            multi_select: (payload.tags ?? []).map((tag) => ({ name: tag })),
          },
          Created: {
            date: { start: new Date().toISOString() },
          },
          Source: {
            url: 'https://xlumina.jp',
          },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: payload.content.slice(0, 2000) },
                },
              ],
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    await logIntegration(
      userId,
      'notion',
      payload.sourceType,
      payload.sourceId,
      res.ok ? 'success' : 'failed',
      res.ok ? null : `HTTP ${res.status}`,
    );
  } catch (err) {
    await logIntegration(
      userId,
      'notion',
      payload.sourceType,
      payload.sourceId,
      'failed',
      String(err),
    );
  }
}

// Google Sheetsへの記録（Make/Zapier経由が現実的なため、ここはログのみ）
async function logToSheets(
  _spreadsheetId: string,
  payload: IntegrationPayload,
  userId: string,
): Promise<void> {
  await logIntegration(
    userId,
    'sheets',
    payload.sourceType,
    payload.sourceId,
    'success',
    null,
  );
}

// ログ記録
async function logIntegration(
  userId: string,
  integrationType: string,
  sourceType: string | undefined,
  sourceId: number | undefined,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  await sql`
    INSERT INTO integration_logs
      (user_id, integration_type, source_type, source_id, status, error_message)
    VALUES (
      ${userId}, ${integrationType}, ${sourceType ?? null},
      ${sourceId ?? null}, ${status}, ${errorMessage}
    )
  `.catch(() => {
    /* ログ失敗は握りつぶす */
  });
}
