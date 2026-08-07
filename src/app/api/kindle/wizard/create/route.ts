import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { fetchKindleMaterials, validateKindleMaterialLimits } from '@/lib/kindle-materials';
import { getKindlePurpose, KINDLE_PURPOSE_KEYS } from '@/lib/kindle-purposes';
import { getKindleStyle, KINDLE_STYLE_KEYS } from '@/lib/kindle-styles';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface WizardOutlineChapter {
  chapter_num: number;
  title: string;
  summary?: string;
  target_chars?: number;
  source_ids?: string[];
}

// ウィザード④目次確定 → kindle_books + kindle_chapters を一括作成。AI不使用。
// 素材ID・目的・文体・プリセットは book_meta JSON に格納（スキーマ変更なし）。
// 章は全件 status='pending' で作成し、⑤の章status駆動レジュームの起点になる。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const { outline, sourceIds, purposeKey, styleKey, preset, seriesKey } = body ?? {};

  // ── 入力検証（fail-closed: 不正な状態をDBに書かない） ──
  if (!outline || typeof outline.book_title !== 'string' || !outline.book_title.trim()) {
    return NextResponse.json({ error: 'outline.book_title は必須です' }, { status: 400 });
  }
  const chapters: WizardOutlineChapter[] = Array.isArray(outline.chapters) ? outline.chapters : [];
  if (chapters.length === 0) {
    return NextResponse.json({ error: 'outline.chapters が空です' }, { status: 400 });
  }
  if (chapters.some((c) => typeof c.title !== 'string' || !c.title.trim())) {
    return NextResponse.json({ error: '章タイトルが空の章があります' }, { status: 400 });
  }
  if (!Array.isArray(sourceIds) || sourceIds.some((v: unknown) => typeof v !== 'string')) {
    return NextResponse.json({ error: 'sourceIds（文字列配列）が必要です' }, { status: 400 });
  }
  if (!KINDLE_PURPOSE_KEYS.includes(purposeKey)) {
    return NextResponse.json({ error: `purposeKey が不正です（${KINDLE_PURPOSE_KEYS.join('/')}）` }, { status: 400 });
  }
  if (!KINDLE_STYLE_KEYS.includes(styleKey)) {
    return NextResponse.json({ error: `styleKey が不正です（${KINDLE_STYLE_KEYS.join('/')}）` }, { status: 400 });
  }
  if (preset !== 'leadmagnet') {
    return NextResponse.json({ error: '現在対応しているプリセットは leadmagnet のみです' }, { status: 400 });
  }

  try {
    // 素材の実在・owner・上限を確定時にも再検証（クライアント検証をすり抜けた値を弾く）
    const materials = await fetchKindleMaterials(userId, sourceIds);
    if (materials.length !== sourceIds.length) {
      return NextResponse.json(
        { error: `選択素材のうち${sourceIds.length - materials.length}件が見つかりません（削除済みの可能性）` },
        { status: 400 },
      );
    }
    const check = validateKindleMaterialLimits(materials);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // 章ごとの素材割当は実在IDのみ通す（AI出力のハルシネーションIDを捨てる）
    const validIdSet = new Set(sourceIds as string[]);
    const chapterSourceRefs: Record<string, string[]> = {};
    for (const c of chapters) {
      const assigned = Array.isArray(c.source_ids)
        ? c.source_ids.filter((id) => typeof id === 'string' && validIdSet.has(id))
        : [];
      chapterSourceRefs[String(c.chapter_num)] = assigned;
    }

    const bookMeta = {
      origin: 'wizard',
      preset,
      purposeKey: getKindlePurpose(purposeKey).key,
      styleKey: getKindleStyle(styleKey).key,
      seriesKey: typeof seriesKey === 'string' && seriesKey ? seriesKey : null,
      sourceIds,
      chapterSourceRefs,
    };
    const targetWordCount = chapters.reduce(
      (sum, c) => sum + (typeof c.target_chars === 'number' && c.target_chars > 0 ? c.target_chars : 3500),
      0,
    );

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = await sql`
      INSERT INTO kindle_books
        (user_id, title, subtitle, language, target_reader, target_word_count, status, phase, book_meta)
      VALUES
        (${userId}, ${outline.book_title.trim()}, ${outline.subtitle ?? null}, 'ja',
         ${outline.target_reader ?? null}, ${targetWordCount}, 'writing', 5, ${JSON.stringify(bookMeta)}::jsonb)
      RETURNING id
    `;
    const bookId = (book as any).id as number;

    try {
      for (const c of chapters) {
        await sql`
          INSERT INTO kindle_chapters
            (book_id, chapter_number, title, summary, target_word_count, status)
          VALUES
            (${bookId}, ${c.chapter_num}, ${c.title.trim()}, ${c.summary ?? ''},
             ${typeof c.target_chars === 'number' && c.target_chars > 0 ? c.target_chars : 3500}, 'pending')
        `;
      }
    } catch (chapterErr) {
      // 章の作成に失敗したら書籍ごと削除（CASCADE）して部分状態を残さない
      await sql`DELETE FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}`;
      throw chapterErr;
    }

    // 229B: 方向Aの関連付け＝素材にしたnote記事（library）のmetadataへ usedInBookIds を追記。
    // metadataはTEXT列（JSON文字列）のため読み書きで更新。失敗しても本の作成は成功扱い（ベストエフォート）
    try {
      const noteMaterialIds = materials.filter((m) => m.source === 'note-article').map((m) => m.id);
      for (const libId of noteMaterialIds) {
        const [row] = await sql`
          SELECT metadata FROM library WHERE id = ${libId} AND user_id = ${userId}
        `;
        if (!row) continue;
        let meta: Record<string, unknown> = {};
        try {
          meta = row.metadata ? JSON.parse(row.metadata) : {};
        } catch {
          meta = {};
        }
        const used = Array.isArray(meta.usedInBookIds) ? meta.usedInBookIds : [];
        if (!used.includes(bookId)) {
          meta.usedInBookIds = [...used, bookId];
          await sql`
            UPDATE library SET metadata = ${JSON.stringify(meta)} WHERE id = ${libId} AND user_id = ${userId}
          `;
        }
      }
    } catch (linkErr) {
      console.warn('[kindle/wizard/create] usedInBookIds追記に失敗（本の作成は成功）:', linkErr);
    }

    return NextResponse.json({ bookId, chapterCount: chapters.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `プロジェクトの作成に失敗しました: ${msg}` }, { status: 500 });
  }
}
