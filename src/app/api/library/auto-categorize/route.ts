import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { generateWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Mode = 'single' | 'bulk';

interface RequestBody {
  mode: Mode;
  itemIds?: string[];
  category?: string; // group_name と同義（仕様書での呼称）
  model?: AIModel;
}

// 簡易な並列実行リミッタ（API レート制限と Vercel 制限の中間を取る）
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }).map(
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        results[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// AI 応答から JSON オブジェクトを救済パース
function tryParseJsonObject(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  s = s.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// metadata 列の解析
function parseMeta(metadata: any): any {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try { return JSON.parse(metadata); } catch { return {}; }
  }
  return metadata;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id ?? '';

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body) {
      return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
    }
    const { mode, itemIds = [], category, model = 'gemini' } = body;

    if (mode !== 'single' && mode !== 'bulk') {
      return NextResponse.json({ error: 'mode は single または bulk' }, { status: 400 });
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: 'itemIds が必要です' }, { status: 400 });
    }

    // 1. 対象アイテムを取得
    const targetItems = (await sql`
      SELECT id, title, content, metadata, group_name
      FROM library
      WHERE user_id = ${userId}
        AND id = ANY(${itemIds as any})
    `) as any[];

    if (targetItems.length === 0) {
      return NextResponse.json({ error: '対象アイテムが見つかりません' }, { status: 404 });
    }

    // 2. 既存サブカテゴリ一覧（同じカテゴリ内）を取得し AI に渡す
    // metadata カラムは TEXT 型に JSON.stringify で格納されているため
    // SQL の ->> 演算子は使わず、JS 側でパースしてユニーク化する
    const filterGroup = category || targetItems[0]?.group_name || '';
    const rawMetaRows = filterGroup
      ? ((await sql`
          SELECT metadata
          FROM library
          WHERE user_id = ${userId}
            AND group_name = ${filterGroup}
        `) as any[])
      : [];
    const existingSubList: string[] = Array.from(
      new Set(
        rawMetaRows
          .map((row) => parseMeta(row?.metadata)?.subCategory)
          .filter(
            (s: any): s is string => typeof s === 'string' && s.trim().length > 0,
          )
          .map((s: string) => s.trim()),
      ),
    );

    const systemPrompt = `あなたはライブラリ管理者として、保存されたコンテンツに最適なサブカテゴリ名と関連タグを判定します。

ルール:
- サブカテゴリは短く名詞ベースで6文字以内推奨
- 既存サブカテゴリ一覧で近いものがあれば、必ずそれをそのまま使う（表記揺れを生まない）
- 全体のサブカテゴリ数が12を超えないよう、できるだけ既存に寄せる
- タグは内容から具体的キーワードを5〜8個抽出
- 出力は単一JSONオブジェクトのみ。前後の説明・コードフェンス禁止`;

    // 単一アイテム処理関数
    const processOne = async (item: any): Promise<{
      id: string;
      subCategory: string;
      tags: string[];
      ok: boolean;
      error?: string;
    }> => {
      const title = item.title || '';
      const content = (item.content || '').slice(0, 5000);
      const userPrompt = `【カテゴリ】${filterGroup}

【既存のサブカテゴリ一覧（${existingSubList.length}個）】
${existingSubList.length > 0 ? existingSubList.map((s) => `- ${s}`).join('\n') : '（まだ存在しません）'}

【今回のコンテンツ】
タイトル: ${title}
本文: ${content}

【出力形式】（JSONオブジェクトのみ、前後の説明禁止）
{ "subCategory": "...", "tags": ["...", "..."] }`;

      try {
        const raw = await generateWithModel(model, userPrompt, systemPrompt, 800);
        const parsed = tryParseJsonObject(raw);
        if (!parsed || typeof parsed.subCategory !== 'string') {
          return { id: item.id, subCategory: '', tags: [], ok: false, error: 'JSONパース失敗' };
        }
        const subCategory = String(parsed.subCategory).trim().slice(0, 20);
        const tags: string[] = Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 8).map((t: string) => t.trim())
          : [];

        // 既存 metadata に subCategory + tags をマージして更新
        const existingMeta = parseMeta(item.metadata);
        const mergedMeta = {
          ...existingMeta,
          subCategory,
          tags,
          autoCategorizedAt: new Date().toISOString(),
        };
        await sql`
          UPDATE library
          SET metadata = ${JSON.stringify(mergedMeta)}
          WHERE id = ${item.id} AND user_id = ${userId}
        `;

        return { id: item.id, subCategory, tags, ok: true };
      } catch (err: any) {
        return { id: item.id, subCategory: '', tags: [], ok: false, error: err?.message || 'AI呼び出し失敗' };
      }
    };

    // single モード: 1件のみ
    if (mode === 'single') {
      const result = await processOne(targetItems[0]);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error || '分類失敗', id: result.id },
          { status: 502 },
        );
      }
      return NextResponse.json({
        subCategory: result.subCategory,
        tags: result.tags,
        id: result.id,
      });
    }

    // bulk モード: 並列上限 5 で処理
    const results = await mapWithConcurrency(targetItems, processOne, 5);
    const updated = results.filter((r) => r.ok).map((r) => ({ id: r.id, subCategory: r.subCategory, tags: r.tags }));
    const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error }));

    return NextResponse.json({ updated, failed });
  } catch (err: any) {
    console.error('[library/auto-categorize] 致命的エラー:', err);
    return NextResponse.json(
      { error: err?.message || 'サーバー内部エラー' },
      { status: 500 },
    );
  }
}
