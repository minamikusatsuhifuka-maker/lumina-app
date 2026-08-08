import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { getKindlePurpose } from '@/lib/kindle-purposes';
import { KINDLE_ASSET_META, type KindleAssetEntry, type KindleAssetKind } from '@/lib/kindle-assets';
import { buildKindleAssetPrompt, type KindleAssetContext } from '@/lib/kindle-asset-prompts';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 225b: 出版・販促アセット（kindle-studioの販促5APIをウィザードへ吸収）。
// - POST { bookId, kind }: owner検証→本と章からサーバ側で入力を組む（クライアントから本文を受けない）
//   →既存5APIのプロンプト（lib/kindle-asset-prompts.tsへ内製化）でClaude直呼び→
//   book_meta.assets.<kind> へ jsonb_setマージ（224方式・他キーと同居）
// - DELETE { bookId, kind }: book_meta #- '{assets,<kind>}'
// - fail-closed: パース失敗・形不一致は保存せず502（既存アセット・本文は無傷）

async function resolveBook(sql: any, userId: string, body: any) {
  const bookId = Number(body.bookId);
  if (!Number.isFinite(bookId)) {
    return { error: NextResponse.json({ error: 'bookIdが必要です' }, { status: 400 }) };
  }
  const kind = typeof body.kind === 'string' && body.kind in KINDLE_ASSET_META ? (body.kind as KindleAssetKind) : null;
  if (!kind) {
    return { error: NextResponse.json({ error: `kindが不正です（対応: ${Object.keys(KINDLE_ASSET_META).join('/')}）` }, { status: 400 }) };
  }
  const [book] = await sql`
    SELECT id, title, subtitle, target_reader, book_meta FROM kindle_books
    WHERE id = ${bookId} AND user_id = ${userId}
  `;
  if (!book) return { error: NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 }) };
  return { bookId, kind, book };
}

// kindごとの最小の形チェック（fail-closed: 主要キーが無ければ保存しない）
function hasRequiredShape(kind: KindleAssetKind, data: Record<string, unknown>): boolean {
  if (kind === 'description') return typeof data.amazon_description === 'string' && !!data.amazon_description;
  if (kind === 'keywords') return Array.isArray(data.top7_keywords) && data.top7_keywords.length > 0;
  if (kind === 'coverPrompt') return Array.isArray(data.prompts) && data.prompts.length > 0;
  if (kind === 'promotion') return Array.isArray(data.posts) && data.posts.length > 0;
  return Array.isArray(data.pre_publish_checks) && data.pre_publish_checks.length > 0;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL!);
    const r = await resolveBook(sql, userId, body);
    if ('error' in r) return r.error;
    const { bookId, kind, book } = r;

    const chapters = (await sql`
      SELECT title FROM kindle_chapters WHERE book_id = ${bookId} ORDER BY chapter_number ASC
    `) as { title: string }[];

    // 227Bの章まとめ要点を「内容の芯」として結合（無ければ空＝タイトル・章立てから推測させる）
    const summaries = book.book_meta?.summaries ?? {};
    const essence = Object.values(summaries as Record<string, { points?: string[] }>)
      .flatMap((s) => (Array.isArray(s?.points) ? s.points : []))
      .join('／')
      .slice(0, 600);

    const ctx: KindleAssetContext = {
      bookTitle: book.title,
      subtitle: book.subtitle || '',
      targetReader: book.target_reader || '',
      purposeLabel: getKindlePurpose(book.book_meta?.purposeKey).label,
      chapters: chapters.map((c) => c.title),
      essence,
      hasImages: !!book.book_meta?.images?.cover,
    };

    const { system, user, maxTokens } = buildKindleAssetPrompt(kind, ctx);
    // 既存5APIと同一の直呼び作法（thinkingなし・extractAnthropicText→robustJsonParse）
    // 235: 共通層でClaude→Gemini自動フォールバック（上限・混雑時のみ切替）
    const ai = await generateTextWithFallback({
      system,
      maxTokens,
      messages: [{ role: 'user', content: user }],
    });
    const text = ai.text;
    let data: Record<string, unknown>;
    try {
      data = robustJsonParse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '生成結果の解析に失敗しました（もう一度お試しください）' }, { status: 502 });
    }
    if (!data || !hasRequiredShape(kind, data)) {
      return NextResponse.json({ error: '生成結果が不完全でした（もう一度お試しください）' }, { status: 502 });
    }

    const entry: KindleAssetEntry = { generatedAt: new Date().toISOString(), data };
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{assets}', COALESCE(book_meta->'assets', '{}'::jsonb), true),
          ${['assets', kind]}::text[], ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${bookId} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true, kind, entry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/assets POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL!);
    const r = await resolveBook(sql, userId, body);
    if ('error' in r) return r.error;
    const { bookId, kind } = r;
    await sql`
      UPDATE kindle_books SET book_meta = book_meta #- ${['assets', kind]}::text[], updated_at = NOW()
      WHERE id = ${bookId} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/assets DELETE] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
