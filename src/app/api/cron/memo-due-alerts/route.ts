import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ensureMemoTables } from '@/lib/memo-db';
import { notify } from '@/lib/notify';
import { sendEmail, renderEmailLayout, escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';

// 122: 期限アラート日次cron。
//   未完了で due_at を持つ memo を JST(Asia/Tokyo) で残り日数算出し、
//   7日前 / 3日前 / 1日前 の「最も近い未送信閾値」で1回だけ通知する。
//   - アプリ内通知(必須): 既存の通知センター/ベル(notifications)へ notify() で差す。
//   - メール(任意): RESEND_API_KEY があり、owner のメールが解決できれば送付。
//   - 二重送信防止: memo_alerts UNIQUE(memo_id, threshold)。挿入できた時だけ通知。
//   既存cron作法に倣い CRON_SECRET を検証。Vercel Cron は GET で叩くため GET/POST 両対応。

// 近い順(1d→3d→7d)に評価し、最初に該当する未送信閾値を採用(過剰通知を抑制)。
const THRESHOLDS: { key: '1d' | '3d' | '7d'; days: number }[] = [
  { key: '1d', days: 1 },
  { key: '3d', days: 3 },
  { key: '7d', days: 7 },
];

// JSTの「今日0時」を基準に due_at までの暦日差を返す(cron実行時刻の時分に依存しない)。
function daysUntilJst(dueIso: string, nowMs: number): number {
  const jstMidnight = (ms: number) => {
    const j = new Date(ms + 9 * 3600 * 1000); // JST壁時計
    return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
  };
  return Math.round((jstMidnight(Date.parse(dueIso)) - jstMidnight(nowMs)) / 86400000);
}

// JSTの M/D 表記(通知文面用)。
function jstDateLabel(iso: string): string {
  const j = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
}

interface MemoRow {
  id: string;
  owner: string;
  raw_text: string;
  ai_summary: string | null;
  due_at: string;
}

async function run(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureMemoTables(sql);

    const nowMs = Date.now();
    const emailable = Boolean(process.env.RESEND_API_KEY);

    // 未完了(done/archived 以外)で due_at を持つメモ(全ユーザー横断)。
    const memos = (await sql`
      SELECT id, owner, raw_text, ai_summary, due_at
      FROM memos
      WHERE due_at IS NOT NULL AND status NOT IN ('done', 'archived')
    `) as unknown as MemoRow[];

    // 既送信の (memo_id, threshold) 集合(DB一括取得→メモリ判定)。
    const sentRows = (await sql`SELECT memo_id, threshold FROM memo_alerts`) as unknown as { memo_id: string; threshold: string }[];
    const sentSet = new Set(sentRows.map((r) => `${r.memo_id}:${r.threshold}`));

    // メール宛先(owner→email)はRESEND採用時のみ、必要に応じて1回だけ引く。
    const emailCache = new Map<string, string | null>();
    const resolveEmail = async (owner: string): Promise<string | null> => {
      if (emailCache.has(owner)) return emailCache.get(owner)!;
      const u = (await sql`SELECT email FROM users WHERE id = ${owner}`) as unknown as { email: string }[];
      const email = u[0]?.email ?? null;
      emailCache.set(owner, email);
      return email;
    };

    let created = 0;

    for (const m of memos) {
      const days = daysUntilJst(m.due_at, nowMs);
      if (days > 7) continue; // まだ範囲外(7日前より先)

      // 最も近い未送信閾値を採用。期限超過(days<=0)も 1d 扱いで1回だけ拾う。
      const hit = THRESHOLDS.find((t) => days <= t.days && !sentSet.has(`${m.id}:${t.key}`));
      if (!hit) continue;

      // 二重防止: 競合時は何も挿入されない。挿入できた時だけ通知する。
      const ins = (await sql`
        INSERT INTO memo_alerts (owner, memo_id, threshold)
        VALUES (${m.owner}, ${m.id}, ${hit.key})
        ON CONFLICT (memo_id, threshold) DO NOTHING
        RETURNING id
      `) as unknown as { id: string }[];
      if (ins.length === 0) continue;
      sentSet.add(`${m.id}:${hit.key}`);
      created++;

      const title = (m.ai_summary || m.raw_text || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'TODO';
      const remain = days <= 0 ? '本日が期限です' : `あと${days}日です`;
      const msg = `「${title}」の期限まで${remain}（${jstDateLabel(m.due_at)}）`;

      // アプリ内通知(必須・fire-and-forget)。
      await notify({ userId: m.owner, title: '⏰ 期限が近いTODO', message: msg, href: '/dashboard/memo', type: 'warning' });

      // メール(任意)。RESEND未設定/宛先不明なら送らない。
      if (emailable) {
        const to = await resolveEmail(m.owner);
        if (to) {
          const html = renderEmailLayout({
            title: '⏰ 期限が近いTODO',
            bodyHtml: `<p>${escapeHtml(msg)}</p><p><a href="https://xlumina.jp/dashboard/memo" style="color:#1D9E75;font-weight:700;">AIメモを開く →</a></p>`,
          });
          await sendEmail({ to, subject: `⏰ 期限が近いTODO：${title}`, text: msg, html });
        }
      }
    }

    return NextResponse.json({ ok: true, scanned: memos.length, created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '期限アラートの処理に失敗しました';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
