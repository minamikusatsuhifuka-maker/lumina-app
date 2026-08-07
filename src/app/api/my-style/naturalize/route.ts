import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sql } from '@/lib/db';
import { generateWithModel } from '@/lib/ai-client';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { buildMyStyleBlock, normalizeMyStyleProfile } from '@/lib/my-style';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 228c: 「🗣もっと自然に」。生成文章をマイ文体に寄せる言い換えを before/after ペアで起案する。
// - 169（refine/suggest）の差分ペア方式を踏襲: 全文を再出力させない・適用はクライアント側の
//   確定的置換・✅/✕の個別判断（人間確認型）
// - 【厳守】意味・事実・数値を変えない言い換えに限定（fail-closed: 失敗時は空配列＝原文維持）
// - プロファイルはサーバ側で取得（リクエストから受け取らない＝改ざん経路を作らない）

interface RawEdit {
  before?: unknown;
  after?: unknown;
  reason?: unknown;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) return NextResponse.json({ error: '本文が必要です' }, { status: 400 });

    const [row] = await sql`
      SELECT profile, enabled FROM my_style_profiles WHERE owner = ${guard.userId}
    `.catch(() => [] as never[]);
    const profile = row && row.enabled ? normalizeMyStyleProfile(row.profile) : null;
    if (!profile) {
      return NextResponse.json(
        { error: 'マイ文体プロファイルが未設定です（設定 > マイ文体 で抽出・保存してください）' },
        { status: 400 },
      );
    }

    const sourceText = content.slice(0, 40_000);
    const system = `あなたは日本語の編集者です。筆者本人の文体プロファイルに合わせて、文章の語り口だけを自然に寄せる言い換えを提案します。`;
    const prompt = `次の文章を「マイ文体プロファイル」の語り口に寄せるため、変更した方がよい箇所だけを変更前後のペアで列挙してください。全文は書き直しません。

${buildMyStyleBlock(profile)}

【厳守事項】
- 意味・事実・数値・固有名詞を一切変えない（語り口・言い回しの調整のみ）
- 出力はJSONのみ（前置き・コードフェンス・説明は一切不要）
- 形式: [{"before": "原文に完全一致する文字列", "after": "修正後の文字列", "reason": "簡潔な理由"}]
- before は本文に出現する通りの完全一致で、一意に特定できる長さにすること（後段のローカル置換に使用）
- 見出し・箇条書きの構造は変えない
- 提案は効果の大きい順に最大12件。該当が無ければ [] を返す

【対象テキスト】
${sourceText}`;

    // 文体の質感を扱うため主力Claude。差分のみの出力だが思考込みで枠に余裕を持たせる
    const raw = await generateWithModel('claude', prompt, system, 6000);
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : '[]';
    const arr = robustJsonParse<RawEdit[]>(slice);

    const edits = (Array.isArray(arr) ? arr : [])
      .map((it) => ({
        before: String(it.before ?? ''),
        after: String(it.after ?? ''),
        reason: String(it.reason ?? '').slice(0, 120),
      }))
      // before が空・本文に不在・変更なしは適用不能のため除外（fail-closed）
      .filter((e) => e.before && e.after && e.before !== e.after && sourceText.includes(e.before))
      .slice(0, 12);

    return NextResponse.json({ edits });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/naturalize]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
