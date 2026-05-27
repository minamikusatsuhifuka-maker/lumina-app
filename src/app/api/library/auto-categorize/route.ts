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

// エラーメッセージから失敗理由を分類
function classifyError(message: string): { code: string; label: string } {
  const m = (message || '').toLowerCase();

  if (m.includes('短すぎる') || m.includes('too short')) {
    return { code: 'too_short', label: '本文が短すぎ' };
  }
  if (m.includes('json') && (m.includes('parse') || m.includes('unexpected') || m.includes('expected'))) {
    return { code: 'json_parse', label: 'AI応答が不正' };
  }
  if (m.includes('jsonパース') || m.includes('parse失敗')) {
    return { code: 'json_parse', label: 'AI応答が不正' };
  }
  if (m.includes('empty') || m.includes('空') || m.includes('no content')) {
    return { code: 'empty_response', label: 'AI応答が空' };
  }
  if (m.includes('rate') || m.includes('429') || m.includes('limit')) {
    return { code: 'rate_limit', label: 'AI制限' };
  }
  if (m.includes('timeout') || m.includes('time out') || m.includes('timed out')) {
    return { code: 'timeout', label: '処理時間超過' };
  }
  if (m.includes('too long') || m.includes('context length') || m.includes('exceed') || m.includes('長すぎ')) {
    return { code: 'too_long', label: '本文が長すぎ' };
  }
  if (m.includes('safety') || m.includes('blocked') || m.includes('filter')) {
    return { code: 'safety_filter', label: 'AIフィルタ' };
  }

  return { code: 'unknown', label: '不明エラー' };
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

    // 失敗時の DB 更新ヘルパー（catch内で使う・二重失敗時はログのみ）
    const writeFailureToDb = async (item: any, errMessage: string): Promise<{ code: string; label: string }> => {
      const errorCategory = classifyError(errMessage);
      const existingMeta = parseMeta(item.metadata);
      const prevAttempts = Number(existingMeta?.classifyAttempts || 0);
      try {
        await sql`
          UPDATE library
          SET metadata = ${JSON.stringify({
            ...existingMeta,
            classifyError: errorCategory.label,
            classifyErrorDetail: (errMessage || '').slice(0, 300),
            classifyErrorCode: errorCategory.code,
            classifyErrorAt: new Date().toISOString(),
            classifyAttempts: prevAttempts + 1,
          })}
          WHERE id = ${item.id} AND user_id = ${userId}
        `;
      } catch (dbErr) {
        console.error('[auto-categorize] DB更新も失敗:', dbErr);
      }
      return errorCategory;
    };

    // 単一アイテム処理関数
    const processOne = async (item: any): Promise<{
      id: string;
      subCategory: string;
      tags: string[];
      ok: boolean;
      error?: string;
      errorCode?: string;
    }> => {
      const title = item.title || '';
      const contentRaw = item.content || '';

      // 事前チェック: 本文が短すぎる場合は AI 呼ばずに失敗扱い
      if (contentRaw.trim().length < 50) {
        const errMsg = 'content が短すぎる（50文字未満）';
        const errCat = await writeFailureToDb(item, errMsg);
        return { id: item.id, subCategory: '', tags: [], ok: false, error: errMsg, errorCode: errCat.code };
      }

      const content = contentRaw.slice(0, 5000);
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
        if (!raw || !raw.trim()) {
          throw new Error('AI応答が空です');
        }
        const parsed = tryParseJsonObject(raw);
        if (!parsed || typeof parsed.subCategory !== 'string') {
          throw new Error('JSONパース失敗');
        }
        const subCategory = String(parsed.subCategory).trim().slice(0, 20);
        const tags: string[] = Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 8).map((t: string) => t.trim())
          : [];

        // 既存 metadata に subCategory + tags をマージして更新
        // 成功時は過去の classifyError 情報をクリア（履歴 classifyAttempts は残す）
        const existingMeta = parseMeta(item.metadata);
        const mergedMeta = {
          ...existingMeta,
          subCategory,
          tags,
          autoCategorizedAt: new Date().toISOString(),
          classifyError: null,
          classifyErrorDetail: null,
          classifyErrorCode: null,
          classifyErrorAt: null,
        };
        await sql`
          UPDATE library
          SET metadata = ${JSON.stringify(mergedMeta)}
          WHERE id = ${item.id} AND user_id = ${userId}
        `;

        return { id: item.id, subCategory, tags, ok: true };
      } catch (err: any) {
        const errMsg = err?.message || 'AI呼び出し失敗';
        console.error(`[auto-categorize] ${item.id} 失敗:`, errMsg);
        const errCat = await writeFailureToDb(item, errMsg);
        return { id: item.id, subCategory: '', tags: [], ok: false, error: errMsg, errorCode: errCat.code };
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
    const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error, errorCode: r.errorCode }));

    return NextResponse.json({ updated, failed });
  } catch (err: any) {
    console.error('[library/auto-categorize] 致命的エラー:', err);
    return NextResponse.json(
      { error: err?.message || 'サーバー内部エラー' },
      { status: 500 },
    );
  }
}
