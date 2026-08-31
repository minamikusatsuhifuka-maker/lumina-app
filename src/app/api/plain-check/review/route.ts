// 279 §2-4: AI判定（参考）— 文脈上の分かりにくさ・論理の飛躍・前提の省略を指摘するだけ（言い換えはしない）。
// 機械検出とは別の経路で、画面では「参考」ラベルで区別して表示する（混ぜない）。
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import {
  AI_ISSUE_KIND_DEFS,
  PLAIN_INPUT_MAX,
  REPHRASE_RETRIES,
  REPHRASE_TIMEOUT_MS,
  buildReviewPrompt,
  plainAudienceOf,
  type AiIssueKind,
} from '@/lib/plain-check';
import { callGeminiJson } from '../_gemini';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 }); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: '文章（text）が必要です' }, { status: 400 });
  if (text.length > PLAIN_INPUT_MAX) return NextResponse.json({ error: `文章は${PLAIN_INPUT_MAX.toLocaleString()}字までです` }, { status: 400 });

  const prompt = buildReviewPrompt(text, plainAudienceOf(body.audience).key);
  let raw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= REPHRASE_RETRIES; attempt++) {
    try { raw = await callGeminiJson(apiKey, prompt, 1500, REPHRASE_TIMEOUT_MS); lastError = null; break; }
    catch (e) { lastError = e; }
  }
  if (lastError || !raw) {
    return NextResponse.json({ error: lastError instanceof Error ? lastError.message : 'AI判定に失敗しました' }, { status: 502 });
  }
  let parsed: { items?: unknown };
  try { parsed = robustJsonParse(raw); } catch { return NextResponse.json({ error: 'AIの応答を解釈できませんでした' }, { status: 502 }); }
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const kind = (typeof o.kind === 'string' && o.kind in AI_ISSUE_KIND_DEFS ? o.kind : 'context') as AiIssueKind;
      return { kind, excerpt: typeof o.excerpt === 'string' ? o.excerpt.trim() : '', note: typeof o.note === 'string' ? o.note.trim() : '' };
    })
    // 引用が本文に無い指摘は捨てる（AIの創作を「参考」にも載せない）
    .filter((it) => it.excerpt && text.includes(it.excerpt))
    .slice(0, 5);
  return NextResponse.json({ items, _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL } });
}
