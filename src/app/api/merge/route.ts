import { anthropicFetch } from '@/lib/anthropic-compat';
import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
// 317 §3-1: 二段出力（mode: summary|detail）。長さの指示と maxTokens は lib/merge-report が正本。時間切れは明示の終端（timedOut・R-118）
import { MERGE_MAX_TOKENS, MERGE_RETRIES, MERGE_TIMEOUT_MESSAGE, MERGE_TIMEOUT_MS, isMergeMode, mergeLengthInstruction } from '@/lib/merge-report';

// R-83: リテラル必須。正本は lib/merge-report.ts の MERGE_MAX_DURATION_S（U89 で一致を固定）
export const maxDuration = 300;

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await anthropicFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 529) && i < retries) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
}

export async function POST(req: NextRequest) {
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { items, mode: modeRaw } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  // 317: mode 未指定＝従来どおり（構造も長さも不変・R-88）。summary＝従来の構造＋1,000〜2,000字／detail＝拡張構造＋5,000〜8,000字
  const mode = isMergeMode(modeRaw) ? modeRaw : null;
  if (modeRaw !== undefined && modeRaw !== null && mode === null) {
    return NextResponse.json({ error: 'mode は summary / detail のいずれかです' }, { status: 400 });
  }

  if (!items || items.length < 2) {
    return NextResponse.json({ error: '2件以上のアイテムが必要です' }, { status: 400 });
  }

  const itemsText = items.map((item: any, i: number) =>
    `【資料${i + 1}：${item.title || '無題'}】\n${(item.content || '（内容なし）').slice(0, 2000)}`
  ).join('\n\n---\n\n');

  const detailStructure = `

## 📚 各資料の要点（資料ごとに小見出し）
（資料1件ごとに「### 資料名」を置き、要点・根拠・数字を3〜6行で）

## 🔍 詳細インサイト
（主要インサイトのそれぞれについて、根拠となる資料の記述と数字を示しながら深掘り）

## 🧭 実践手順
（アクション推奨事項を実行する手順に分解。順序・前提・注意点）`;
  try {
    const data = await Promise.race([
      callAnthropic(apiKey, {
      model: CLAUDE_TEXT_MODEL,
      max_tokens: mode ? MERGE_MAX_TOKENS[mode] : 8000,
      // 287 §2-5: 見出しは ## で揃える（# を複数並べると h1 が複数になり、Wordでは「見出し1」が乱立する）。
      // 出力は Markdown のまま（構造の指定として）。画面は renderMarkdown で整形し、コピーは Word体裁のリッチコピーにする。
      system: `あなたは優秀なリサーチアナリストです。
複数の調査・分析結果を横断的に分析し、以下の構造でレポートを生成してください。
必ず各セクションを明確に分けて出力してください。
見出しは必ず「## 」（見出しレベル2）で書き、「# 」（レベル1）は使わないでください。小見出しが必要なら「### 」を使ってください。
強調は **太字**、列挙は「- 」の箇条書きで書いてください。

## 🎯 エグゼクティブサマリー
（全体を3行で要約）

## 🔗 共通テーマ・キーワード
（複数のアイテムに共通して現れるテーマや概念を箇条書きで）

## 💡 主要インサイト
（データから導き出せる重要な洞察を優先度順に3〜5個）

## ⚡ 矛盾点・対立する見解
（アイテム間で意見や事実が異なる点を明示。なければ「特になし」）

## 📊 総合評価
（全体的な傾向と結論）

## ✅ アクション推奨事項
（このデータをもとに取るべき具体的なアクションを3つ）${mode === 'detail' ? detailStructure : ''}${mode ? mergeLengthInstruction(mode) : ''}`,
      messages: [{
        role: 'user',
        content: `以下の${items.length}件の調査・分析結果を統合分析してください。\n\n${itemsText}`,
      }],
      }, MERGE_RETRIES),
      // R-118: 時間切れは無音で落とさず、明示の終端（timedOut）で返す。リトライ込みで maxDuration の内側（R-73）
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error(MERGE_TIMEOUT_MESSAGE), { timedOut: true })), MERGE_TIMEOUT_MS)),
    ]);

    const result = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    if (!result) {
      return NextResponse.json({ error: '統合レポートの生成に失敗しました（空の応答）' }, { status: 502 });
    }

    return NextResponse.json({ result, mode, chars: result.length });
  } catch (e: any) {
    console.error('[merge]', e.message);
    if (e?.timedOut) return NextResponse.json({ error: e.message, timedOut: true, mode }, { status: 504 });
    return NextResponse.json({ error: e.message, mode }, { status: 502 });
  }
}
