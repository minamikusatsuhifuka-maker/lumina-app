import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { fetchKindleMaterials, validateKindleMaterialLimits } from '@/lib/kindle-materials';
import { getKindlePurpose, KINDLE_PURPOSE_KEYS } from '@/lib/kindle-purposes';
import { getKindleStyle, KINDLE_STYLE_KEYS } from '@/lib/kindle-styles';
import { validateMandalaBookSource, type MandalaBookSource } from '@/lib/mandala-kindle';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface WizardOutlineChapter {
  chapter_num: number;
  title: string;
  summary?: string;
  target_chars?: number;
  source_ids?: string[];
}

// 307: 出どころの記録（§4-3 方式1）。オプトイン＝渡されたときだけ book_meta.mandala に載る。既存経路の挙動は不変（R-88）

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
  // 307: mandala が渡されたときは形を検証し、不正なら作らない（黙って記録を落とさない＝fail-closed）
  let mandala: MandalaBookSource | null = null;
  if (body?.mandala !== undefined && body?.mandala !== null) {
    mandala = validateMandalaBookSource(body.mandala);
    if (!mandala) return NextResponse.json({ error: 'mandala（出どころの記録）の形が不正です' }, { status: 400 });
  }

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
  // 225c: standard解禁（生成は従来どおり1リクエスト=1章×status駆動レジューム＝上限内）
  if (preset !== 'leadmagnet' && preset !== 'standard') {
    return NextResponse.json({ error: '対応しているプリセットは leadmagnet / standard です' }, { status: 400 });
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
    // 307: マンダラから起こす本は素材0件でも作れる（骨子＝章の summary が本文生成の土台。generate-chapter は
    // 「割当素材なし」を扱える）。上限（件数・字数）の検証は素材があるときは従来どおり
    if (materials.length > 0 || !mandala) {
      const check = validateKindleMaterialLimits(materials);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
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

    const sql = neon(process.env.DATABASE_URL!);

    // 307 R-87: 同じプレビュー（nonce）×同じ目的の本が既にあれば作らず、その本を返す（クライアントの ref と二重の遮断）
    if (mandala) {
      const [dup] = await sql`
        SELECT id FROM kindle_books
        WHERE user_id = ${userId}
          AND book_meta->'mandala'->>'nonce' = ${mandala.nonce}
          AND book_meta->>'purposeKey' = ${getKindlePurpose(purposeKey).key}
        ORDER BY id ASC LIMIT 1
      `;
      if (dup) {
        return NextResponse.json({ bookId: (dup as any).id as number, chapterCount: chapters.length, duplicate: true });
      }
    }

    const bookMeta = {
      origin: 'wizard',
      preset,
      purposeKey: getKindlePurpose(purposeKey).key,
      styleKey: getKindleStyle(styleKey).key,
      // 225a: fail-closed検証（wz-uuid形式の英数ハイフンのみ・64字まで。不正値はnull=束ねなし）
      seriesKey: typeof seriesKey === 'string' && /^[\w-]{1,64}$/.test(seriesKey) ? seriesKey : null,
      sourceIds,
      chapterSourceRefs,
      // 307: 出どころ（マンダラから起こした本だけ）。再取込・反応記録の土台（本の情報は本の側に・R-107）
      ...(mandala ? { mandala } : {}),
    };
    const targetWordCount = chapters.reduce(
      (sum, c) => sum + (typeof c.target_chars === 'number' && c.target_chars > 0 ? c.target_chars : 3500),
      0,
    );

    // 307: 本＋章を CTE 1文で書く＝章の INSERT が1つでも失敗すれば本も残らない（1トランザクション・fail-closed）。
    // 以前は本→章の順に別文で書き、章の失敗時に本を削除して補償していた（クラッシュ時に本だけ残り得た）
    const nums = chapters.map((c) => c.chapter_num);
    const titles = chapters.map((c) => c.title.trim());
    const summaries = chapters.map((c) => c.summary ?? '');
    const words = chapters.map((c) => (typeof c.target_chars === 'number' && c.target_chars > 0 ? c.target_chars : 3500));
    const [created] = await sql`
      WITH b AS (
        INSERT INTO kindle_books
          (user_id, title, subtitle, language, target_reader, target_word_count, status, phase, book_meta)
        VALUES
          (${userId}, ${outline.book_title.trim()}, ${outline.subtitle ?? null}, 'ja',
           ${outline.target_reader ?? null}, ${targetWordCount}, 'writing', 5, ${JSON.stringify(bookMeta)}::jsonb)
        RETURNING id
      ), c AS (
        INSERT INTO kindle_chapters (book_id, chapter_number, title, summary, target_word_count, status)
        SELECT b.id, x.n, x.t, x.s, x.w, 'pending'
        FROM b, unnest(${nums}::int[], ${titles}::text[], ${summaries}::text[], ${words}::int[]) AS x(n, t, s, w)
        RETURNING id
      )
      SELECT b.id AS id, (SELECT COUNT(*) FROM c) AS chapter_count FROM b
    `;
    const bookId = (created as any)?.id as number;
    if (!bookId || Number((created as any)?.chapter_count) !== chapters.length) {
      // 行数が合わなければ偽の成功を返さない（R-05）。CTE は同一文なので、ここに来るときは書かれていないか全て書かれている
      throw new Error(`章の作成件数が一致しません（期待 ${chapters.length} / 実際 ${(created as any)?.chapter_count ?? 0}）`);
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
