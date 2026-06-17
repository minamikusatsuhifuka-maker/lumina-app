import { neon } from '@neondatabase/serverless';

// 共通アプリ内通知ヘルパー（提案1・2 共通）
// notifications/create/route.ts の INSERT を薄くラップし、fire-and-forget で使う。
// 失敗しても呼び出し元の処理を止めない（通知は付随処理）。
export async function notify(opts: {
  userId: string;
  title: string;
  message?: string;
  href?: string;
  type?: string; // 既存 notifications.type に合わせる（デフォルト 'info'）
}): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO notifications (user_id, title, message, type, href)
      VALUES (${opts.userId}, ${opts.title}, ${opts.message ?? ''}, ${opts.type ?? 'info'}, ${opts.href ?? null})
    `;
  } catch (e) {
    console.error('[notify] failed', e);
  }
}
