import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { trackUsage } from '@/lib/trackUsage';
import { sanitizeForJson } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// 保存済みテキストをAIが自動カテゴライズして、既存folderカラムを更新する
// （text_analysis_saves.folder = カテゴリ名 として運用されているため folder を更新）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  // 保存済みテキストを取得（最大200件）
  const saves = (await sql`
    SELECT id, auto_title AS title, content, folder AS category
    FROM text_analysis_saves
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
      { error: '保存済みテキストがありません' },
      { status: 400 },
    );
  }

  const prompt = `あなたは情報整理・カテゴリ分析の専門家です。
以下の${saves.length}件のテキスト保存データを分析し、最適なカテゴリに分類してください。

## 分類の考え方
- 内容・トピック・用途の類似性でグループ化
- カテゴリ数は5〜15個が最適
- カテゴリ名は日本語で簡潔に（10字以内）
- 1つのテキストが複数カテゴリに属する場合は最も適切な1つを選ぶ
- 既存のカテゴリがあれば優先的に使用し、新しいカテゴリは必要最小限に

## 保存済みテキスト一覧
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
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
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

  // DBの folder カラムを一括更新（既存UIがfolder参照のため）
  let updatedCount = 0;
  for (const cat of result.categories ?? []) {
    const targetIds: number[] = [];
    for (const itemIndex of cat.item_ids ?? []) {
      const save = saves[itemIndex - 1]; // 1-indexed → 0-indexed
      if (save) targetIds.push(save.id);
    }
    if (targetIds.length === 0) continue;
    await sql`
      UPDATE text_analysis_saves
      SET folder = ${cat.name}, updated_at = NOW()
      WHERE id = ANY(${targetIds}::integer[]) AND user_id = ${userId}
    `;
    updatedCount += targetIds.length;
  }

  // API使用量記録
  await trackUsage({
    userId,
    featureKey: 'text_analysis',
    stepLabel: '自動カテゴライズ',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  // 件数はAIの自由記述にせず、プログラム側の実カウント値をテンプレートに埋め込む
  // （見出しと本文サマリーで数字が食い違う問題の再発防止。AIには傾向コメントのみ書かせる）。
  const categoryCount = result.categories?.length ?? 0;
  const trendComment = (result.summary ?? '').trim();
  const summary = trendComment
    ? `${updatedCount}件を${categoryCount}カテゴリに分類。${trendComment}`
    : `${updatedCount}件を${categoryCount}カテゴリに分類しました。`;

  return NextResponse.json({
    categories: result.categories,
    summary,
    updatedCount,
    totalItems: saves.length,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
