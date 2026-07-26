import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { safeJsonParse } from '@/lib/ai-json-parser';
import { HP_AD_CHECK_RULES } from '@/lib/hp-writing';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 184: HP文章の医療広告セーフガード。
// checkMedicalAd（指摘文のみ・位置情報なし）と違い、該当箇所を {before, after, reason} の
// 差分ペアで返す（169の /api/refine/suggest と同じ確立方式）。これにより
// 「該当箇所の特定（before完全一致）→ 修正案の提示 → 院長が個別に適用/却下」の人間承認型が成立する。
// このAPIは候補の起案のみ。自動で書き換えは行わない（適用はクライアント側の院長操作で確定）。

interface RawFinding {
  before?: unknown;
  after?: unknown;
  reason?: unknown;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ error: '対象テキストがありません' }, { status: 400 });
    }

    const prompt = `あなたは医療広告規制（医療法・医療広告ガイドライン／薬機法）に精通した校正者です。
次の文章（ホームページ掲載予定の公開文章）から、規制上問題となりうる表現をすべて検出し、該当箇所ごとに修正案を提示してください。

## 検出する観点
${HP_AD_CHECK_RULES}

## 厳守事項
- 出力はJSONのみ（前置き・コードフェンス・説明は一切不要）
- 形式: {"status": "ok" または "warn", "findings": [{"before": "原文に完全一致する文字列", "after": "修正案", "reason": "なぜ規制上問題か（観点名を含めて簡潔に）"}]}
- before は本文に出現する通りの完全一致で、一意に特定できる長さにすること（後段のハイライト・置換に使用）
- after は元の意味・情報をできるだけ保ちながら規制に適合する表現にする。適合が不可能なら削除（after を空文字にし、reason に削除を推奨する旨を明記）
- 数値・費用を新たに書いたり書き換えたりしない（規制適合のために断定を弱める言い換えは可）
- 問題が無ければ {"status": "ok", "findings": []} を返す
- 過剰検出しない（規制上の根拠が説明できるものだけを指摘する）

## 対象文章
${text.slice(0, 16000)}`;

    // 検出＋差分の起案＝出力は短い。JSON mime + thinking low（178の設計・確立方式）
    const raw = await generateWithModel('gemini', prompt, undefined, 8192, {
      responseMimeType: 'application/json',
      ...GEMINI_TEXT_THINKING_LOW,
    });

    const parsed = safeJsonParse<{ status?: unknown; findings?: unknown }>(raw, {
      status: 'ok',
      findings: [],
    });

    const findings = (Array.isArray(parsed.findings) ? (parsed.findings as RawFinding[]) : [])
      .map((f) => ({
        before: String(f.before ?? ''),
        after: String(f.after ?? ''),
        reason: String(f.reason ?? ''),
      }))
      // before が空、または本文に存在しないものは特定・置換不能なので除外
      .filter((f) => f.before && text.includes(f.before));

    // status は「フィルタ後に指摘が残っているか」を正とする（モデル申告とズレたら実態優先）
    const status: 'ok' | 'warn' = findings.length > 0 ? 'warn' : 'ok';

    return NextResponse.json({ success: true, status, findings });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[hp-guard]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
