import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { trackUsage } from '@/lib/trackUsage';
import { sanitizeForJson } from '@/lib/sanitize';
import {
  SCAN_TARGET_CATEGORIES,
  SCAN_BATCH_SIZE,
  OTHER_CATEGORY,
} from '@/lib/category-vocabulary';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// 192③: 新カテゴリ（ニナファーム / ミトコンドリア・抗酸化）の抽出スキャン。
// 未分類・「その他」に埋もれている該当分をAIで拾う（全件再判定はしない）。
// 1回の呼び出しで SCAN_BATCH_SIZE 件だけ処理する段階実行方式
// （1,700件超を一度に走らせない。クライアント側がループ・進捗表示・中止を担う）。
// 判定済みは category_scan_checked_at を打って再実行時にスキップ（中断→再開しても重複コストなし）。

// 判定済みマークカラムを冪等に用意（ADD COLUMN IF NOT EXISTS・既存データ非破壊）
let checkedColumnReady: Promise<unknown> | null = null;
function ensureCheckedColumn() {
  if (!checkedColumnReady) {
    checkedColumnReady = sql`
      ALTER TABLE text_analysis_saves ADD COLUMN IF NOT EXISTS category_scan_checked_at TIMESTAMPTZ
    `.catch((e) => {
      checkedColumnReady = null;
      throw e;
    });
  }
  return checkedColumnReady;
}

// スキャン対象: 未分類（folder空）と「その他」のみ。分類済みカテゴリは触らない。
// ※ text_analysis_saves の未分類は folder='' / NULL（'general' は context_saves 側の値）

// GET: 残り対象件数（UIの事前表示用）
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    await ensureCheckedColumn();
    const rows = await sql`
      SELECT COUNT(*)::int AS n
      FROM text_analysis_saves
      WHERE user_id = ${userId}
        AND COALESCE(folder, '') IN ('', ${OTHER_CATEGORY})
        AND category_scan_checked_at IS NULL
    `;
    return NextResponse.json({ remaining: rows[0]?.n ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 1バッチ（SCAN_BATCH_SIZE件）を判定して folder を更新
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    await ensureCheckedColumn();

    const targets = (await sql`
      SELECT id, auto_title AS title, content
      FROM text_analysis_saves
      WHERE user_id = ${userId}
        AND COALESCE(folder, '') IN ('', ${OTHER_CATEGORY})
        AND category_scan_checked_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${SCAN_BATCH_SIZE}
    `) as Array<{ id: number; title: string | null; content: string }>;

    if (targets.length === 0) {
      return NextResponse.json({ processed: 0, remaining: 0, hits: [] });
    }

    const prompt = `あなたは医療クリニック院長の資料整理アシスタントです。
以下の${targets.length}件のテキストについて、次の2カテゴリのどちらかに「明確に該当するか」を判定してください。

## 判定するカテゴリ（この2つのみ。それ以外のカテゴリ名は使わない）
- ニナファーム: サプリメント企業ニナファーム（NINA PHARM）やその製品・ビジネスに関する内容
- ミトコンドリア・抗酸化: ミトコンドリア機能・活性酸素・酸化ストレス・抗酸化物質が主題の内容

## 判定の考え方
- 主題として扱っている場合のみ該当とする（一言触れている程度は「該当なし」）
- 迷ったら「該当なし」（誤分類より取りこぼしの方が安全）

## テキスト一覧
${targets
  .map(
    (t) => `
ID:${t.id}
タイトル: ${sanitizeForJson(t.title ?? '無題')}
内容プレビュー: ${sanitizeForJson(t.content ?? '').slice(0, 300)}
`,
  )
  .join('\n---\n')}

## 出力形式（必ずこのJSON形式のみ出力。前置き・後書き不要。全${targets.length}件について出力）
\`\`\`json
{
  "items": [
    { "id": 123, "category": "ニナファーム" },
    { "id": 456, "category": "該当なし" }
  ]
}
\`\`\``;

    const response = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: sanitizeForJson(prompt) }],
    });

    const firstBlock = response.content[0];
    const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'AIの応答をパースできませんでした', raw: text.slice(0, 300) },
        { status: 500 },
      );
    }

    let result: { items?: Array<{ id: number; category?: string }> };
    try {
      result = JSON.parse(jsonMatch[1]);
    } catch {
      return NextResponse.json(
        { error: 'JSONパース失敗', raw: text.slice(0, 300) },
        { status: 500 },
      );
    }

    // サーバ側検証: 対象バッチに含まれるIDのみ・カテゴリは2種の一覧内のみ更新（それ以外は破棄）
    const targetIds = new Set(targets.map((t) => t.id));
    const hits: Array<{ id: number; title: string; category: string }> = [];
    for (const item of result.items ?? []) {
      const cat = (item.category ?? '').trim();
      if (!targetIds.has(Number(item.id))) continue;
      if (!SCAN_TARGET_CATEGORIES.includes(cat)) continue;
      await sql`
        UPDATE text_analysis_saves
        SET folder = ${cat}, updated_at = NOW()
        WHERE id = ${Number(item.id)} AND user_id = ${userId}
      `;
      const t = targets.find((x) => x.id === Number(item.id));
      hits.push({ id: Number(item.id), title: t?.title ?? '無題', category: cat });
    }

    // 処理済みマーク（該当なし含む全対象。再実行時にスキップ＝重複コストなし）
    const processedIds = targets.map((t) => t.id);
    await sql`
      UPDATE text_analysis_saves
      SET category_scan_checked_at = NOW()
      WHERE id = ANY(${processedIds}::integer[]) AND user_id = ${userId}
    `;

    const remainRows = await sql`
      SELECT COUNT(*)::int AS n
      FROM text_analysis_saves
      WHERE user_id = ${userId}
        AND COALESCE(folder, '') IN ('', ${OTHER_CATEGORY})
        AND category_scan_checked_at IS NULL
    `;

    await trackUsage({
      userId,
      featureKey: 'text_analysis',
      stepLabel: '新カテゴリ抽出スキャン',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return NextResponse.json({
      processed: targets.length,
      hits,
      remaining: remainRows[0]?.n ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
