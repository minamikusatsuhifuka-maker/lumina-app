import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { humanizeText } from '@/lib/humanize-server';
import { HUMANIZE_API_MAX_DURATION_S, humanizeDeadline } from '@/lib/humanize';

export const runtime = 'nodejs';
// R-73: 1回 100 秒 × 最大2回（数字の整え直し）＋ 余白 ＜ 300
export const maxDuration = 300;

// 336: 「✍️ 人間らしく整える」の単体API（生成後に時間切れ・エラーで整えられなかったときの「再試行」用）。
// 生成はしない。本文を受けて、整えた本文と結果の記録（humanize）を返す。
// 数字の検査に当たれば整える前の本文をそのまま返す（applied=false・reason='numbers'）。
// kind='note' でも 1文1行・見出し規約はここでは当てない（画面側の保存・コピーが従来どおり通す）。

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const startedAt = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { content?: unknown; kind?: unknown };
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) return NextResponse.json({ error: '本文が必要です' }, { status: 400 });
    const kind = body.kind === 'kindle' ? 'kindle' : 'note';
    const hz = await humanizeText({
      text: content,
      kind,
      userId: guard.userId,
      enabled: true,
      deadlineAt: humanizeDeadline(startedAt, HUMANIZE_API_MAX_DURATION_S),
    });
    return NextResponse.json({ content: hz.text, humanize: hz.info });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[humanize] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
