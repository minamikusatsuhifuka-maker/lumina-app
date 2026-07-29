import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  CATEGORY_KEYWORDS,
  isWordBoundaryKeyword,
  stripSpaces,
  toIlikePattern,
  toWordBoundaryPattern,
} from '@/lib/category-keywords';
import { CANONICAL_CATEGORIES } from '@/lib/category-vocabulary';

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
// 202: 辞書を Tier A(primary)/Tier B(secondary) の2層化。
// - primary は単独ヒット（201と同じ）
// - secondary は「同一文書内（タイトル＋本文）に primary が共起する場合のみ」ヒット。
//   検索範囲（タイトルのみ/本文込み）は secondary の発見側にだけ適用し、
//   共起チェックは常に全文書（タイトル＋本文）で行う
//   （タイトルのみモードでも「タイトル=ミュー・本文にニナファーム」を拾えるように）。
// - ILIKE照合は両側から空白（半角/全角）を除去して比較（NINA PHARM / ゼロ グラビティ等の揺れ対策）。
//   SOD/ROS等の単語境界判定（~*+\y）は原文照合を維持
//
// 203: 任意ワード検索を追加（APIの引数化）。preview に words[]＋category を渡すと、
// 辞書の代わりに院長が入力したワード（複数=OR）で検索し、選んだ正規カテゴリへの
// 移動候補としてプレビューする。判定規則（英数字の単語境界・スペース除去照合・
// 対象カテゴリ既設行の除外）は辞書検索と共通。ガード（1文字拒否等）はサーバ側でも検証。
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
  keywords: string[]; // ヒットしたキーワード（Tier Bは「ミュー（＋ニナファーム）」形式）
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

// 空白（半角/全角）を除去した列式（202: スペース無視照合）。列式は定数のみ＝SQL注入なし
function noSpace(expr: string): string {
  return `REPLACE(REPLACE(${expr}, ' ', ''), '　', '')`;
}

const TABLE_DEFS = {
  ta: {
    name: 'text_analysis_saves',
    titleExpr: `COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題')`,
    titleSearchExpr: `COALESCE(NULLIF(auto_title, ''), file_name, '')`,
    bodyExprs: ['content'],
    currentExpr: `COALESCE(folder, '')`,
  },
  ctx: {
    name: 'context_saves',
    titleExpr: `COALESCE(NULLIF(topic, ''), '無題')`,
    titleSearchExpr: `COALESCE(topic, '')`,
    bodyExprs: ['context_text', `COALESCE(research_text, '')`],
    currentExpr: `COALESCE(category, 'general')`,
  },
} as const;

// 1キーワードの一致条件SQL（$1 = パターン）。
// 単語境界キーワードは原文に ~*、それ以外は空白除去したうえで ILIKE
function keywordCondition(kw: string, exprs: string[]): string {
  const boundary = isWordBoundaryKeyword(kw);
  return exprs
    .map((e) => (boundary ? `${e} ~* $1` : `${noSpace(e)} ILIKE $1`))
    .join(' OR ');
}

function keywordPattern(kw: string): string {
  return isWordBoundaryKeyword(kw) ? toWordBoundaryPattern(kw) : toIlikePattern(kw);
}

// 1キーワード×1テーブルの検索（scope = 検索範囲）。キーワードごとに分けることで
// 「どのキーワードでヒットしたか」をプレビューに出せる（誤検出の判断材料）
async function searchKeyword(
  table: 'ta' | 'ctx',
  userId: string,
  category: string,
  kw: string,
  includeBody: boolean,
): Promise<Array<{ id: number; title: string; current: string }>> {
  const t = TABLE_DEFS[table];
  const exprs = includeBody ? [t.titleSearchExpr, ...t.bodyExprs] : [t.titleSearchExpr];
  const rows = await sql.query(
    `SELECT id, ${t.titleExpr} AS title, ${t.currentExpr} AS current
     FROM ${t.name}
     WHERE user_id = $2 AND ${t.currentExpr} <> $3
       AND (${keywordCondition(kw, exprs)})`,
    [keywordPattern(kw), userId, category],
  );
  return rows as Array<{ id: number; title: string; current: string }>;
}

// 202: Tier B候補IDに対する Tier A の共起チェック（常に全文書=タイトル＋本文）。
// 戻り値 = 共起した行ID集合
async function cooccurIds(
  table: 'ta' | 'ctx',
  userId: string,
  primaryKw: string,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const t = TABLE_DEFS[table];
  const exprs = [t.titleSearchExpr, ...t.bodyExprs];
  const rows = await sql.query(
    `SELECT id FROM ${t.name}
     WHERE user_id = $2 AND id = ANY($3::integer[])
       AND (${keywordCondition(primaryKw, exprs)})`,
    [keywordPattern(primaryKw), userId, ids],
  );
  return new Set((rows as Array<{ id: number }>).map((r) => Number(r.id)));
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

      // key = `${table}:${id}` で重複マージ（複数キーワードにヒットした行は1件にまとめる）
      const merged = new Map<string, KeywordHit>();
      const addHit = (
        table: 'ta' | 'ctx',
        r: { id: number; title: string; current: string },
        category: string,
        kwLabel: string,
      ) => {
        const key = `${table}:${r.id}`;
        const prev = merged.get(key);
        if (prev) {
          // 両カテゴリにヒットした行は辞書の先頭カテゴリ（ニナファーム）優先。
          // キーワードは合算表示して院長が判断できるようにする
          if (!prev.keywords.includes(kwLabel)) prev.keywords.push(kwLabel);
        } else {
          merged.set(key, {
            table,
            id: Number(r.id),
            title: r.title,
            current: r.current === 'general' ? '' : r.current,
            category,
            keywords: [kwLabel],
          });
        }
      };

      // 203: 任意ワード検索（words＋category 指定時は辞書を使わない）
      if (Array.isArray(body?.words)) {
        const category = typeof body?.category === 'string' ? body.category.trim() : '';
        if (!CANONICAL_CATEGORIES.includes(category)) {
          return NextResponse.json(
            { error: '反映先カテゴリは正規カテゴリから選択してください' },
            { status: 400 },
          );
        }
        const words = [
          ...new Set(body.words.map((w: unknown) => String(w ?? '').trim()).filter(Boolean)),
        ].slice(0, 8) as string[];
        if (words.length === 0) {
          return NextResponse.json({ error: '検索ワードを入力してください' }, { status: 400 });
        }
        if (words.some((w) => stripSpaces(w).length < 2)) {
          return NextResponse.json(
            { error: '1文字のワードは誤検出が多すぎるため検索できません（2文字以上）' },
            { status: 400 },
          );
        }
        if (words.some((w) => w.length > 40)) {
          return NextResponse.json({ error: 'ワードが長すぎます（40文字以内）' }, { status: 400 });
        }

        const wordJobs: Array<Promise<void>> = [];
        for (const kw of words) {
          for (const table of ['ta', 'ctx'] as const) {
            wordJobs.push(
              searchKeyword(table, userId, category, kw, includeBody).then((rows) => {
                for (const r of rows) addHit(table, r, category, kw);
              }),
            );
          }
        }
        await Promise.all(wordJobs);

        const hits = [...merged.values()].sort((a, b) => a.table.localeCompare(b.table) || b.id - a.id);
        return NextResponse.json({
          hits,
          counts: { [category]: hits.length },
          elapsedMs: Date.now() - started,
        });
      }

      // 1) Tier A（primary）: 単独ヒット（選択スコープで検索・キーワード×テーブル並列）
      const primaryJobs: Array<Promise<void>> = [];
      for (const category of CATEGORIES) {
        for (const kw of CATEGORY_KEYWORDS[category].primary) {
          for (const table of ['ta', 'ctx'] as const) {
            primaryJobs.push(
              searchKeyword(table, userId, category, kw, includeBody).then((rows) => {
                for (const r of rows) addHit(table, r, category, kw);
              }),
            );
          }
        }
      }

      // 2) Tier B（secondary）: 選択スコープで候補を検索（この時点ではヒット扱いにしない）
      type Candidate = { id: number; title: string; current: string; kw: string };
      const secondaryCandidates: Record<'ta' | 'ctx', Map<string, Candidate[]>> = {
        ta: new Map(),
        ctx: new Map(),
      };
      const secondaryJobs: Array<Promise<void>> = [];
      for (const category of CATEGORIES) {
        for (const kw of CATEGORY_KEYWORDS[category].secondary) {
          for (const table of ['ta', 'ctx'] as const) {
            secondaryJobs.push(
              searchKeyword(table, userId, category, kw, includeBody).then((rows) => {
                if (rows.length === 0) return;
                const list = secondaryCandidates[table].get(category) ?? [];
                for (const r of rows) list.push({ ...r, id: Number(r.id), kw });
                secondaryCandidates[table].set(category, list);
              }),
            );
          }
        }
      }
      await Promise.all([...primaryJobs, ...secondaryJobs]);

      // 3) Tier B候補に Tier A の共起チェック（常にタイトル＋本文の全文書）。
      //    共起した Tier A 名も控えて「ミュー（＋ニナファーム）」形式で表示する
      const cooccurJobs: Array<Promise<void>> = [];
      for (const table of ['ta', 'ctx'] as const) {
        for (const [category, candidates] of secondaryCandidates[table]) {
          const ids = [...new Set(candidates.map((c) => c.id))];
          if (ids.length === 0) continue;
          const coById = new Map<number, string[]>();
          const jobs = CATEGORY_KEYWORDS[category].primary.map((pkw) =>
            cooccurIds(table, userId, pkw, ids).then((hitIds) => {
              for (const id of hitIds) {
                const list = coById.get(id) ?? [];
                if (!list.includes(pkw)) list.push(pkw);
                coById.set(id, list);
              }
            }),
          );
          cooccurJobs.push(
            Promise.all(jobs).then(() => {
              for (const c of candidates) {
                const co = coById.get(c.id);
                if (!co || co.length === 0) continue; // 共起なし＝Tier B単独では採用しない
                addHit(table, c, category, `${c.kw}（＋${co.join('・')}）`);
              }
            }),
          );
        }
      }
      await Promise.all(cooccurJobs);

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
      // テーブル×カテゴリでまとめて一括UPDATE（owner検証つき）。
      // 203: 任意ワード検索の適用に対応するため、対象カテゴリは辞書キー限定から
      // 正規カテゴリ（CANONICAL_CATEGORIES）検証に一般化（語彙統制は維持）
      const itemCategories = [
        ...new Set(items.map((i: KeywordHit) => String(i?.category ?? ''))),
      ].filter((c): c is string => CANONICAL_CATEGORIES.includes(c as string));
      for (const category of itemCategories) {
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
