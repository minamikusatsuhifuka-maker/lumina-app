import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sql } from '@/lib/db';
import { generateWithModel } from '@/lib/ai-client';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { MY_STYLE_EXTRACT_MAX_CHARS, normalizeMyStyleProfile } from '@/lib/my-style';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 228c: マイ文体の抽出。my_style_sources（院長自身の文章のみ）から文体特徴JSONの下書きを起案する。
// - 保存はしない（人間確認型: 院長が /dashboard/my-style で編集→保存＝profile PUT が唯一の書き込み口）
// - ソースはサーバ側で owner 検証して取得（リクエストから本文を受け取らない）
// - fail-closed: パース失敗・実質空は502（既存プロファイルは無傷）

export async function POST() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const rows = (await sql`
      SELECT title, content, char_count FROM my_style_sources
      WHERE owner = ${guard.userId} ORDER BY created_at DESC
    `) as { title: string; content: string; char_count: number }[];
    if (rows.length === 0) {
      return NextResponse.json({ error: '文体ソースが未登録です（自分が書いた文章を先に登録してください）' }, { status: 400 });
    }

    // 合計文字数の上限まで新しい順に採用（超過分は切る）
    const used: { title: string; content: string }[] = [];
    let total = 0;
    for (const r of rows) {
      if (total >= MY_STYLE_EXTRACT_MAX_CHARS) break;
      const remain = MY_STYLE_EXTRACT_MAX_CHARS - total;
      used.push({ title: r.title, content: r.content.slice(0, remain) });
      total += Math.min(r.content.length, remain);
    }

    const sourcesSection = used
      .map((s, i) => `## ソース${i + 1}: ${s.title}\n${s.content}`)
      .join('\n\n---\n\n');

    const system = `あなたは文体分析の専門家です。同一の筆者が書いた文章群から、その筆者固有の文体特徴を抽出します。内容やテーマではなく「書き方」だけに注目します。`;
    const prompt = `以下は同一の筆者（クリニック院長）が自分で書いた文章です。この筆者の文体プロファイルを抽出してください。

# 抽出の作り方
- 内容・テーマではなく書き方（文の長さ・リズム・段落・語りかけ・口調・言い回し・改行や強調の癖）だけを見る
- phrases（よく使う言い回し）は本文に実際に出てくるものだけ（創作しない）。頻出順に最大10個
- avoid は本文から読み取れる「この筆者が使わない・避けている表現傾向」（推測は控えめに・最大6個）
- 各フィールドは日本語で簡潔に（summary以外は1文目安）

# 筆者の文章（${used.length}件・計${total.toLocaleString()}字）
${sourcesSection}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "summary": "文体の総評1〜2文", "sentence": "文の長さ・リズム", "paragraph": "段落の特徴", "address": "読者への語りかけ方", "tone": "口調", "phrases": ["言い回し1"], "avoid": ["避ける表現1"], "rhythm": "改行・箇条書き・強調の使い方" }`;

    // 文章の質感を読むタスクのため主力Claude。枠は思考込みで余裕を（195/209系の教訓）
    const raw = await generateWithModel('claude', prompt, system, 6000);
    const profile = normalizeMyStyleProfile(robustJsonParse(raw));
    if (!profile) {
      return NextResponse.json({ error: '文体の抽出に失敗しました（もう一度お試しください）' }, { status: 502 });
    }
    return NextResponse.json({
      profile,
      usedSources: used.length,
      usedChars: total,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/extract]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
