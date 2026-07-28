import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { trackUsage } from '@/lib/trackUsage';
import { sanitizeForJson } from '@/lib/sanitize';
import { normalizeCategory, vocabularyPromptText, OTHER_CATEGORY } from '@/lib/category-vocabulary';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// 保存済みコンテキストをAIが自動カテゴライズして、既存categoryカラムを更新する
// （テキスト分析(text_analysis_saves.folder)の自動カテゴライズ実装を context_saves 向けに流用）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  await sql`ALTER TABLE context_saves ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`;

  // 保存済みコンテキストを取得（最大200件）
  const saves = (await sql`
    SELECT id, topic AS title, context_text AS content, COALESCE(category, 'general') AS category
    FROM context_saves
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 200
  `) as Array<{
    id: number;
    title: string | null;
    content: string;
    category: string | null;
  }>;

  if (saves.length === 0) {
    return NextResponse.json(
      { error: '保存済みの素材がありません' },
      { status: 400 },
    );
  }

  const prompt = `あなたは情報整理・カテゴリ分析の専門家です。
以下の${saves.length}件のコンテキスト保存データを分析し、最適なカテゴリに分類してください。

## 使えるカテゴリ（192: この一覧から選ぶだけ。新しいカテゴリ名を作らない）
${vocabularyPromptText()}

## 分類の考え方
- カテゴリ名は必ず上の一覧から一字一句そのまま使う（一覧に無い名前は無効として破棄される）
- 1つのコンテキストが複数カテゴリに属する場合は最も適切な1つを選ぶ
- どれにも当てはまらない場合のみ「${OTHER_CATEGORY}」を使う

## 保存済みコンテキスト一覧
${saves
  .map(
    (s, i) => `
[${i + 1}] ID:${s.id}
タイトル: ${sanitizeForJson(s.title ?? '無題')}
現在のカテゴリ: ${sanitizeForJson(s.category ?? '未分類')}
内容プレビュー: ${sanitizeForJson(s.content ?? '').slice(0, 150)}
`,
  )
  .join('\n---\n')}

## 出力形式（必ずこのJSON形式のみ出力。前置き・後書き不要）
\`\`\`json
{
  "categories": [
    {
      "name": "カテゴリ名",
      "description": "このカテゴリの説明（20字以内）",
      "color": "#xxxxxx",
      "icon": "絵文字1文字",
      "item_ids": [1, 3, 5]
    }
  ],
  "uncategorized_ids": [],
  "summary": "分類結果の傾向・特徴についてのコメントのみ（件数・カテゴリ数などの数字は一切含めない。100字以内）"
}
\`\`\`

## 重要: summaryフィールドについて
- 件数（「◯件」「◯カテゴリ」等）は書かないでください。件数はプログラム側で表示するため、AIが書く必要はありません。
- 傾向・特徴のコメントのみを書いてください（例:「健康・医療系が最多で、業務効率化系がそれに続く」）。`;

  // 保険として prompt 全体にも一度サニタイズを通す
  const safePrompt = sanitizeForJson(prompt);

  let response;
  try {
    response = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: safePrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const firstBlock = response.content[0];
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);

  if (!jsonMatch) {
    return NextResponse.json(
      { error: 'AIの応答をパースできませんでした', raw: text.slice(0, 500) },
      { status: 500 },
    );
  }

  let result: {
    categories?: Array<{
      name: string;
      description?: string;
      color?: string;
      icon?: string;
      item_ids?: number[];
    }>;
    uncategorized_ids?: number[];
    summary?: string;
  };
  try {
    result = JSON.parse(jsonMatch[1]);
  } catch (err) {
    return NextResponse.json(
      { error: 'JSONパース失敗', raw: text.slice(0, 500) },
      { status: 500 },
    );
  }

  // DBの category カラムを一括更新（既存UIがcategory参照のため）。
  // 192: AIが一覧外のカテゴリ名を返したらサーバ側で破棄（そのグループは更新しない）。
  let updatedCount = 0;
  const rejectedNames: string[] = [];
  for (const cat of result.categories ?? []) {
    const canonical = normalizeCategory(cat.name);
    if (!canonical) {
      rejectedNames.push(cat.name);
      continue;
    }
    const targetIds: number[] = [];
    for (const itemIndex of cat.item_ids ?? []) {
      const save = saves[itemIndex - 1]; // 1-indexed → 0-indexed
      if (save) targetIds.push(save.id);
    }
    if (targetIds.length === 0) continue;
    await sql`
      UPDATE context_saves
      SET category = ${canonical}
      WHERE id = ANY(${targetIds}::integer[]) AND user_id = ${userId}
    `;
    updatedCount += targetIds.length;
  }

  // API使用量記録
  await trackUsage({
    userId,
    featureKey: 'context_library',
    stepLabel: '自動カテゴライズ',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  // 件数はAIの自由記述にせず、プログラム側の実カウント値をテンプレートに埋め込む
  // （見出しと本文サマリーで数字が食い違う問題の再発防止。AIには傾向コメントのみ書かせる）。
  // 192: 応答のカテゴリ名も正規化後の名前で返す（一覧外＝破棄分は除外）。
  const validCategories = (result.categories ?? [])
    .map((c) => ({ ...c, name: normalizeCategory(c.name) as string }))
    .filter((c) => c.name);
  const categoryCount = validCategories.length;
  const trendComment = (result.summary ?? '').trim();
  const summary = trendComment
    ? `${updatedCount}件を${categoryCount}カテゴリに分類。${trendComment}`
    : `${updatedCount}件を${categoryCount}カテゴリに分類しました。`;

  return NextResponse.json({
    categories: validCategories,
    summary,
    updatedCount,
    rejected: rejectedNames,
    totalItems: saves.length,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
