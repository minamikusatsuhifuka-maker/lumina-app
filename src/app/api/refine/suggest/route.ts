import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { safeJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 生成テキストの「AI修正指示」（モードB）。全文を再出力させず、変更が必要な箇所だけを
// {before, after, reason} の配列で返させる（161-162の差分ペア方式）。
// 適用はクライアント側で確定的に置換する（このAPIは候補の起案のみ・人間確認型）。

interface RawEdit {
  before?: unknown;
  after?: unknown;
  reason?: unknown;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const instruction = typeof body.instruction === 'string' ? body.instruction : '';
    if (!sourceText.trim()) {
      return NextResponse.json({ error: '対象テキストがありません' }, { status: 400 });
    }
    if (!instruction.trim()) {
      return NextResponse.json({ error: '修正指示を入力してください' }, { status: 400 });
    }

    const prompt = `あなたは日本語の編集者です。次の「指示」に該当する箇所だけを、変更前後のペアで列挙してください。全文は書き直しません。

【指示】
${instruction}

【厳守事項】
- 出力はJSONのみ（前置き・コードフェンス・説明は一切不要）。
- 形式: [{"before": "原文に完全一致する文字列", "after": "修正後の文字列", "reason": "簡潔な理由"}]
- before は本文に出現する通りの完全一致で、一意に特定できる長さにすること（後段のローカル置換に使用）。
- 指示に該当しない箇所は変更しない。無関係な言い回しを勝手に直さない。
- 数値・割合・金額を新たに書いたり書き換えたりしない。
- 該当が無ければ [] を返す。

【対象テキスト】
${sourceText}`;

    // 出力は「差分だけ」なので枠は控えめでよい。ただしGemini 3.xは思考でトークンを食うため
    // 少し余裕を持たせ、JSON強制で抽出を安定させる（166/triageの確立方式）。
    const raw = await generateWithModel('gemini', prompt, undefined, 4096, {
      responseMimeType: 'application/json',
    });

    // 配列部分だけを取り出して堅牢にパース（```json フェンス等に耐える）
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : '[]';
    const arr = safeJsonParse<RawEdit[]>(slice, []);

    const edits = (Array.isArray(arr) ? arr : [])
      .map((it) => ({
        before: String(it.before ?? ''),
        after: String(it.after ?? ''),
        reason: String(it.reason ?? ''),
      }))
      // before が空、または本文に存在しないものは適用不能なので除外
      .filter((e) => e.before && sourceText.includes(e.before));

    return NextResponse.json({ success: true, edits });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[refine/suggest]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
