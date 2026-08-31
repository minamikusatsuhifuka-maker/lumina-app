// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 279: 指摘1箇所の言い換え — **1箇所 = 1リクエスト**（§6-3）。提案のみで本文は書き換えない。
// R-73: 生成45秒×(1+再試行1) + 医療広告チェック15秒 = 105秒 ≤ maxDuration 120秒（lib/plain-check.ts が正本）
// ガード順: 制約 → 事実同一性 → 普遍層 → 医療層（分野が医療のときだけ・後勝ち＝R-69）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import { checkMedicalAd, type AdCheck } from '@/lib/medical-ad-check';
import { metaphorFieldOf } from '@/lib/metaphor';
import {
  ISSUE_KIND_DEFS,
  REPHRASE_AD_CHECK_TIMEOUT_MS,
  REPHRASE_RETRIES,
  REPHRASE_TIMEOUT_MS,
  buildRephrasePrompt,
  plainAudienceOf,
  type IssueKind,
  type RephraseCandidate,
} from '@/lib/plain-check';
import { callGeminiJson } from '../_gemini';

export const runtime = 'nodejs';
// R-83: セグメント設定はリテラルのみ。正本は lib/plain-check.ts の PLAIN_MAX_DURATION_S（U53が一致を判定）
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 }); }

  const sentence = typeof body.sentence === 'string' ? body.sentence.trim() : '';
  if (!sentence) return NextResponse.json({ error: '言い換える文（sentence）が必要です' }, { status: 400 });
  const kind = (typeof body.kind === 'string' && body.kind in ISSUE_KIND_DEFS ? body.kind : 'long') as IssueKind;
  const field = metaphorFieldOf(body.field); // §5: 既定は医療・健康（R-85）。自動判定しない
  const audience = plainAudienceOf(body.audience);

  const prompt = buildRephrasePrompt({
    field,
    audienceKey: audience.key,
    issue: {
      kind,
      sentence,
      excerpt: typeof body.excerpt === 'string' ? body.excerpt : sentence,
      detail: typeof body.detail === 'string' ? body.detail : '',
    },
    before: typeof body.before === 'string' ? body.before : '',
    after: typeof body.after === 'string' ? body.after : '',
  });

  let raw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= REPHRASE_RETRIES; attempt++) {
    try { raw = await callGeminiJson(apiKey, prompt, 1500, REPHRASE_TIMEOUT_MS); lastError = null; break; }
    catch (e) { lastError = e; }
  }
  if (lastError || !raw) {
    return NextResponse.json({ error: lastError instanceof Error ? lastError.message : '言い換えの生成に失敗しました' }, { status: 502 });
  }
  let parsed: { candidates?: unknown; reason?: unknown };
  try { parsed = robustJsonParse(raw); } catch { return NextResponse.json({ error: 'AIの応答を解釈できませんでした' }, { status: 502 }); }

  const candidates: RephraseCandidate[] = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
    .map((c) => ({
      text: typeof (c as { text?: unknown })?.text === 'string' ? String((c as { text: string }).text).trim() : '',
      note: typeof (c as { note?: unknown })?.note === 'string' ? String((c as { note: string }).note).trim() : '',
    }))
    .filter((c) => c.text && c.text !== sentence)
    .slice(0, 2);
  // 候補が無いのは「同じ意味を保てなかった」という正直な結果（偽の成功にしない・fail-closed）
  if (candidates.length === 0) {
    return NextResponse.json({
      candidates: [],
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : '同じ意味を保ったまま言い換えられませんでした',
      adCheck: null,
      _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL },
    });
  }

  let adCheck: AdCheck | null = null;
  if (field === 'medical') {
    adCheck = await Promise.race([
      checkMedicalAd(candidates.map((c) => c.text).join('\n')),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REPHRASE_AD_CHECK_TIMEOUT_MS)),
    ]);
  }
  return NextResponse.json({ candidates, reason: '', adCheck, _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL } });
}
