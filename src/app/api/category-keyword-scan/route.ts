import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  CATEGORY_KEYWORDS,
  isWordBoundaryKeyword,
  toIlikePattern,
  toWordBoundaryPattern,
} from '@/lib/category-keywords';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 201: 新カテゴリ抽出（キーワード方式・AI不使用）。
// 旧 /api/text-analysis/category-scan（AI判定・¥20/100件・パースエラーあり）を置き換え。
// - 対象: text_analysis_saves（タイトル=auto_title/file_name・本文=content）と
//         context_saves（タイトル=topic・本文=context_text/research_text）の両テーブル全件
//         （旧方式の「未分類・その他のみ」制限を撤廃＝分類済みに埋もれた分も拾う）
// - preview: ILIKE/単語境界正規表現でヒット一覧を返すだけ（何も変更しない・人間確認型）
// - apply:   院長がプレビューで確認した項目のみカテゴリを上書き。
//            旧値は *_before_201 に退避（192の *_before_192 と同じ方式・冪等）
//
// ロールバック（手動SQL）:
//   UPDATE text_analysis_saves SET folder   = folder_before_201   WHERE folder_before_201   IS NOT NULL;
//   UPDATE context_saves       SET category = category_before_201 WHERE category_before_201 IS NOT NULL;

const CATEGORIES = Object.keys(CATEGORY_KEYWORDS);

export interface KeywordHit {
  table: 'ta' | 'ctx';
  id: number;
  title: string;
  current: string; // 現在のカテゴリ（未分類は ''）
  category: string; // 判定された新カテゴリ
  keywords: string[]; // ヒットしたキーワード
}

// 退避カラムを冪等に用意（ADD COLUMN IF NOT EXISTS・既存データ非破壊）
let backupColumnsReady: Promise<unknown> | null = null;
function ensureBackupColumns() {
  if (!backupColumnsReady) {
    backupColumnsReady = (async () => {
      await sql`ALTER TABLE text_analysis_saves ADD COLUMN IF NOT EXISTS folder_before_201 TEXT`;
      await sql`ALTER TABLE context_saves ADD COLUMN IF NOT EXISTS category_before_201 TEXT`;
    })().catch((e) => {
      backupColumnsReady = null;
      throw e;
    });
  }
  return backupColumnsReady;
}

// 1キーワード×1テーブルの検索。キーワードごとに分けることで
// 「どのキーワードでヒットしたか」をプレビューに出せる（誤検出の判断材料）。
async function searchKeyword(
  table: 'ta' | 'ctx',
  userId: string,
  category: string,
  kw: string,
  includeBody: boolean,
): Promise<Array<{ id: number; title: string; current: string }>> {
  const useBoundary = isWordBoundaryKeyword(kw);
  const p = useBoundary ? toWordBoundaryPattern(kw) : toIlikePattern(kw);

  if (table === 'ta') {
    const rows = useBoundary
      ? await sql`
          SELECT id,
                 COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題') AS title,
                 COALESCE(folder, '') AS current
          FROM text_analysis_saves
          WHERE user_id = ${userId}
            AND COALESCE(folder, '') <> ${category}
            AND (COALESCE(NULLIF(auto_title, ''), file_name, '') ~* ${p}
                 OR (${includeBody}::boolean AND content ~* ${p}))
        `
      : await sql`
          SELECT id,
                 COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題') AS title,
                 COALESCE(folder, '') AS current
          FROM text_analysis_saves
          WHERE user_id = ${userId}
            AND COALESCE(folder, '') <> ${category}
            AND (COALESCE(NULLIF(auto_title, ''), file_name, '') ILIKE ${p}
                 OR (${includeBody}::boolean AND content ILIKE ${p}))
        `;
    return rows as Array<{ id: number; title: string; current: string }>;
  }

  const rows = useBoundary
    ? await sql`
        SELECT id,
               COALESCE(NULLIF(topic, ''), '無題') AS title,
               COALESCE(category, 'general') AS current
        FROM context_saves
        WHERE user_id = ${userId}
          AND COALESCE(category, 'general') <> ${category}
          AND (COALESCE(topic, '') ~* ${p}
               OR (${includeBody}::boolean AND (context_text ~* ${p} OR COALESCE(research_text, '') ~* ${p})))
      `
    : await sql`
        SELECT id,
               COALESCE(NULLIF(topic, ''), '無題') AS title,
               COALESCE(category, 'general') AS current
        FROM context_saves
        WHERE user_id = ${userId}
          AND COALESCE(category, 'general') <> ${category}
          AND (COALESCE(topic, '') ILIKE ${p}
               OR (${includeBody}::boolean AND (context_text ILIKE ${p} OR COALESCE(research_text, '') ILIKE ${p})))
      `;
  return rows as Array<{ id: number; title: string; current: string }>;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = await req.json();
    const mode = body?.mode;

    // --- プレビュー: 検索のみ・何も変更しない（人間確認型） ---
    if (mode === 'preview') {
      const includeBody = body?.includeBody === true;
      const started = Date.now();

      // キーワード×テーブルを並列検索（1,827件程度ならILIKEで一瞬）
      const jobs: Array<Promise<void>> = [];
      // key = `${table}:${id}` で重複マージ（複数キーワードにヒットした行は1件にまとめる）
      const merged = new Map<string, KeywordHit>();
      for (const category of CATEGORIES) {
        for (const kw of CATEGORY_KEYWORDS[category]) {
          for (const table of ['ta', 'ctx'] as const) {
            jobs.push(
              searchKeyword(table, userId, category, kw, includeBody).then((rows) => {
                for (const r of rows) {
                  const key = `${table}:${r.id}`;
                  const prev = merged.get(key);
                  if (prev) {
                    // 両カテゴリにヒットした行は辞書の先頭カテゴリ（ニナファーム）優先。
                    // キーワードは合算表示して院長が判断できるようにする
                    if (!prev.keywords.includes(kw)) prev.keywords.push(kw);
                  } else {
                    merged.set(key, {
                      table,
                      id: Number(r.id),
                      title: r.title,
                      current: r.current === 'general' ? '' : r.current,
                      category,
                      keywords: [kw],
                    });
                  }
                }
              }),
            );
          }
        }
      }
      await Promise.all(jobs);

      const hits = [...merged.values()].sort(
        (a, b) =>
          CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
          a.table.localeCompare(b.table) ||
          b.id - a.id,
      );
      const counts = Object.fromEntries(
        CATEGORIES.map((c) => [c, hits.filter((h) => h.category === c).length]),
      );
      return NextResponse.json({
        hits,
        counts,
        elapsedMs: Date.now() - started,
      });
    }

    // --- 適用: プレビューで院長が確認（個別除外済み）の項目のみ上書き ---
    if (mode === 'apply') {
      const items = Array.isArray(body?.items) ? body.items : [];
      if (items.length === 0) {
        return NextResponse.json({ error: '適用対象がありません' }, { status: 400 });
      }
      await ensureBackupColumns();

      let updated = 0;
      // テーブル×カテゴリでまとめて一括UPDATE（owner検証つき）
      for (const category of CATEGORIES) {
        const taIds = items
          .filter((i: KeywordHit) => i?.table === 'ta' && i?.category === category)
          .map((i: KeywordHit) => Number(i.id))
          .filter((n: number) => Number.isInteger(n));
        const ctxIds = items
          .filter((i: KeywordHit) => i?.table === 'ctx' && i?.category === category)
          .map((i: KeywordHit) => Number(i.id))
          .filter((n: number) => Number.isInteger(n));

        if (taIds.length > 0) {
          // SET内の folder 参照は更新前の値（Postgres仕様）＝退避→上書きが1文で安全に行える。
          // 退避は「まだ退避していない行」だけ（再適用しても最初の旧値を保持＝冪等）
          const rows = await sql`
            UPDATE text_analysis_saves
            SET folder_before_201 = COALESCE(folder_before_201, COALESCE(folder, '')),
                folder = ${category},
                updated_at = NOW()
            WHERE id = ANY(${taIds}::integer[]) AND user_id = ${userId}
            RETURNING id
          `;
          updated += rows.length;
        }
        if (ctxIds.length > 0) {
          const rows = await sql`
            UPDATE context_saves
            SET category_before_201 = COALESCE(category_before_201, COALESCE(category, 'general')),
                category = ${category}
            WHERE id = ANY(${ctxIds}::integer[]) AND user_id = ${userId}
            RETURNING id
          `;
          updated += rows.length;
        }
      }
      return NextResponse.json({ updated });
    }

    return NextResponse.json({ error: '不正なmodeです' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
