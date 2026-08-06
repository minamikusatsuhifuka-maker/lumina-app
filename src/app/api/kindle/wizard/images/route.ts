import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { put, del } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { blobAuthOptions, hasBlobCredentials } from '@/lib/blob-auth';
import { generateWithModel } from '@/lib/ai-client';
import { generateWithProvider, IMAGE_MODELS, type ImageModelKey } from '@/lib/image-providers';
import { getKindlePurpose } from '@/lib/kindle-purposes';
import {
  getKindleImageStyle,
  KINDLE_IMAGE_SLOT_ASPECT,
  type KindleImageEntry,
  type KindleImageSlot,
} from '@/lib/kindle-image-styles';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 226 Phase1: Kindleウィザードの表紙・章扉画像。
// - POST { action:'draft', bookId, slot, chapterId? }: 本の内容から画像プロンプトをAI起案（人間確認型・編集可）
// - POST { action:'generate', bookId, slot, chapterId?, engine, styleKey, prompt }:
//     171のプロバイダ層で生成 → Vercel Blob保存 → book_meta.images へ jsonb_set マージ（224方式）
// - DELETE { bookId, slot, chapterId? }: メタ削除＋Blob削除（✕不使用）
// fail-closed: 生成・保存の失敗はエラー返却のみ（既存画像・本文・レイアウトは無傷）。
// 生成画像に文字を入れない（文字化け防止=227C院長懸念と同方針）・実在人物/患部写実/誇張の禁止を
// プロンプトガードとしてサーバ側で必ず付与する。

// 起案ルール（eyecatch/prompt の190是正と同方針: 主題が伝わる具体的情景＋医療ガード）
const KINDLE_IMAGE_PROMPT_RULES = `【必ず反映すること】
- 本（または章）の主題が視覚的に伝わる具体的な情景・モチーフを入れる
- 読者が自分ごと化できる日常の文脈（生活シーン・季節感など）を添える
- 主題と雰囲気（色調・光・構図・モチーフ）を簡潔に描写する

【禁止】
- 画像内に文字・ロゴ・数字を一切入れない（タイトル等の文字は入れない前提）
- 実在の人物・顔が特定できる描写
- 患部・症状の写実的描写（健常な肌・手元の描写はよい）・ビフォーアフター的対比
- 効果効能を示唆する演出・具体的な数値`;

// 生成時にユーザー編集後プロンプトへ必ず付ける厳守ガード（編集で消されても効かせる）
const KINDLE_IMAGE_GUARD_SUFFIX =
  '【厳守】画像内に文字・ロゴ・数字を入れない。実在の人物や特定できる顔を描かない。患部・症状の写実的描写や効果効能を示唆する演出をしない。';

const VALID_ENGINES = new Set<string>(IMAGE_MODELS.map((m) => m.key));

interface SlotTarget {
  slot: KindleImageSlot;
  chapterId: number | null;
  book: any;
  chapter: any | null;
}

async function resolveTarget(
  sql: any,
  userId: string,
  body: any,
): Promise<{ target?: SlotTarget; error?: NextResponse }> {
  const bookId = Number(body.bookId);
  if (!Number.isFinite(bookId)) {
    return { error: NextResponse.json({ error: 'bookIdが必要です' }, { status: 400 }) };
  }
  const slot: KindleImageSlot = body.slot === 'chapter' ? 'chapter' : body.slot === 'cover' ? 'cover' : (null as any);
  if (!slot) return { error: NextResponse.json({ error: 'slotはcover/chapterのいずれかです' }, { status: 400 }) };

  const [book] = await sql`
    SELECT id, title, subtitle, target_reader, book_meta FROM kindle_books
    WHERE id = ${bookId} AND user_id = ${userId}
  `;
  if (!book) return { error: NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 }) };

  let chapter: any = null;
  let chapterId: number | null = null;
  if (slot === 'chapter') {
    chapterId = Number(body.chapterId);
    if (!Number.isFinite(chapterId)) {
      return { error: NextResponse.json({ error: 'chapterIdが必要です' }, { status: 400 }) };
    }
    const [ch] = await sql`
      SELECT id, chapter_number, title, summary, content FROM kindle_chapters
      WHERE id = ${chapterId} AND book_id = ${bookId}
    `;
    if (!ch) return { error: NextResponse.json({ error: '章が見つかりません' }, { status: 404 }) };
    chapter = ch;
  }
  return { target: { slot, chapterId, book, chapter } };
}

// book_meta.images 配下へのサーバ側マージ（224で確立したjsonb_set方式）
async function saveImageEntry(sql: any, bookId: number, target: SlotTarget, entry: KindleImageEntry) {
  if (target.slot === 'cover') {
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{images}', COALESCE(book_meta->'images', '{}'::jsonb), true),
          '{images,cover}', ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${bookId}
    `;
  } else {
    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{images}', COALESCE(book_meta->'images', '{}'::jsonb), true),
            '{images,chapters}', COALESCE(book_meta->'images'->'chapters', '{}'::jsonb), true
          ),
          ${['images', 'chapters', String(target.chapterId)]}::text[], ${JSON.stringify(entry)}::jsonb, true
        ),
        updated_at = NOW()
      WHERE id = ${bookId}
    `;
  }
}

function existingEntry(target: SlotTarget): KindleImageEntry | null {
  const images = target.book?.book_meta?.images ?? {};
  if (target.slot === 'cover') return images.cover ?? null;
  return images.chapters?.[String(target.chapterId)] ?? null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL!);
    const { target, error } = await resolveTarget(sql, userId, body);
    if (error) return error;
    const t = target!;

    // ── プロンプト起案（人間確認型・編集可。生成はしない） ──
    if (body.action === 'draft') {
      const purpose = getKindlePurpose(t.book.book_meta?.purposeKey);
      const context =
        t.slot === 'cover'
          ? `本のタイトル: ${t.book.title}\nサブタイトル: ${t.book.subtitle || '（なし）'}\nターゲット読者: ${t.book.target_reader || '（未設定）'}\n本の目的: ${purpose.label}`
          : `章タイトル: 第${t.chapter.chapter_number}章 ${t.chapter.title}\n章の概要: ${t.chapter.summary || ''}\n章の冒頭:\n${(t.chapter.content || '').slice(0, 1500)}`;
      const kindHint =
        t.slot === 'cover'
          ? 'Kindle本の表紙ビジュアル（縦長・本の主題が一目で伝わる・文字は入れない）'
          : '章の扉絵（横長・章の内容を象徴する情景・文字は入れない)';

      const prompt = `以下の内容に合う画像の生成プロンプトを日本語で1つ作ってください。用途: ${kindHint}。

${KINDLE_IMAGE_PROMPT_RULES}

【出力形式】
プロンプト本文のみを出力（前置き・見出し・引用符・番号は不要）。

${context}`;
      const raw = await generateWithModel(
        'gemini',
        prompt,
        'あなたは医療クリニックの広報デザイナーです。書籍の内容に合う画像生成プロンプトを1つ作成します。',
        4096,
      );
      const suggestion = raw.trim();
      if (!suggestion) {
        return NextResponse.json({ error: 'プロンプトを起案できませんでした（再試行してください）' }, { status: 502 });
      }
      return NextResponse.json({ success: true, prompt: suggestion });
    }

    // ── 生成＋Blob保存＋book_metaマージ ──
    if (body.action === 'generate') {
      if (!hasBlobCredentials()) {
        return NextResponse.json({ error: 'Blobストアが未設定です（BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN）' }, { status: 500 });
      }
      const engine = String(body.engine || '');
      if (!VALID_ENGINES.has(engine)) {
        return NextResponse.json({ error: `engineが不正です（対応: ${[...VALID_ENGINES].join('/')}）` }, { status: 400 });
      }
      const style = getKindleImageStyle(body.styleKey);
      const userPrompt = String(body.prompt || '').trim();
      if (!userPrompt) return NextResponse.json({ error: 'プロンプトが空です' }, { status: 400 });

      const finalPrompt = `${userPrompt}\n\n${style.promptBlock}\n${KINDLE_IMAGE_GUARD_SUFFIX}`;
      const result = await generateWithProvider(engine as ImageModelKey, {
        prompt: finalPrompt,
        aspect: KINDLE_IMAGE_SLOT_ASPECT[t.slot],
        quality: 'high',
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }

      const buffer = Buffer.from(result.base64, 'base64');
      if (buffer.length === 0) return NextResponse.json({ error: '画像データが不正です' }, { status: 502 });
      const suffix = t.slot === 'cover' ? 'cover' : `ch${t.chapterId}`;
      const { url, pathname } = await put(
        `kindle/${userId}/${t.book.id}/${suffix}-${randomUUID()}.png`,
        buffer,
        { access: 'public', contentType: 'image/png', ...blobAuthOptions() },
      );

      const old = existingEntry(t);
      const entry: KindleImageEntry = {
        url,
        pathname,
        engine,
        styleKey: style.key,
        prompt: userPrompt,
        updatedAt: new Date().toISOString(),
      };
      await saveImageEntry(sql, t.book.id, t, entry);

      // 再生成時: 旧Blobは保存成功後にベストエフォートで削除（失敗しても無害）
      if (old?.pathname) {
        try {
          await del(old.pathname, blobAuthOptions());
        } catch {
          /* 孤児Blobは実害なし（コスト極小）のため握りつぶす */
        }
      }
      return NextResponse.json({ success: true, entry, elapsedMs: result.elapsedMs });
    }

    return NextResponse.json({ error: 'actionはdraft/generateのいずれかです' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/images POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ✕不使用: メタ削除＋Blob削除
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL!);
    const { target, error } = await resolveTarget(sql, userId, body);
    if (error) return error;
    const t = target!;

    const old = existingEntry(t);
    if (!old) return NextResponse.json({ error: '対象の画像がありません' }, { status: 404 });

    const path = t.slot === 'cover' ? ['images', 'cover'] : ['images', 'chapters', String(t.chapterId)];
    await sql`
      UPDATE kindle_books SET book_meta = book_meta #- ${path}::text[], updated_at = NOW()
      WHERE id = ${t.book.id}
    `;
    if (old.pathname) {
      try {
        await del(old.pathname, blobAuthOptions());
      } catch {
        /* Blob削除失敗は孤児化のみ（メタは消えている）のため握りつぶす */
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/images DELETE] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
