// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 276: 喩え話・比喩表現 — **ターゲット層1つ = 1リクエスト**（§8-2）
//
// 269（1リクエスト=1記事）・275（1リクエスト=1ページ）と同じ方針。
// 3層をまとめて1リクエストにすると、1層の失敗で全部が消える（R-39に反する）。
//
// R-73（内部タイムアウトはリトライ込みで積算）:
//   生成 45秒 ×（本番1回 + 再試行1回）= 90秒
//   ＋ 医療広告チェック 15秒（分野が医療のときだけ・落ちても比喩は返す）
//   = 最悪 105秒 ≤ maxDuration 120秒。数値は lib/metaphor.ts の定数が正本。
//
// ガードの順序（§10・R-69）: ナレッジ（PART-A）→ 普遍層 → 医療層（最後＝後勝ち）。
// 組み立ては lib/metaphor.ts の buildMetaphorPrompt に集約する（プロンプト直書きをしない）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import {
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_MODEL_LABEL,
  GEMINI_TEXT_THINKING_LOW,
  geminiMaxTokens,
} from '@/lib/ai-models';
import { checkMedicalAd, type AdCheck } from '@/lib/medical-ad-check';
import { getPlaybook } from '@/lib/knowledge/noteXPlaybook';
import {
  METAPHOR_AD_CHECK_TIMEOUT_MS,
  METAPHOR_INPUT_MAX,
  METAPHOR_RETRIES,
  METAPHOR_TIMEOUT_MS,
  alignAxes,
  audiencesForField,
  buildMetaphorPrompt,
  isAxisNotApplicable,
  metaphorAudienceOf,
  metaphorFieldOf,
  type MetaphorAudienceKey,
} from '@/lib/metaphor';

export const runtime = 'nodejs';
// R-83: セグメント設定はリテラルのみ。正本は lib/metaphor.ts の METAPHOR_MAX_DURATION_S。
// ズレは unit U48 がこのファイルの文字列と vercel.json を読んで判定する。
export const maxDuration = 120;

/** §10: 分野が医療のときだけ注入する参考ナレッジ（PART-A 専門領域補正） */
const MEDICAL_KNOWLEDGE_IDS = ['PART-A'];

async function callGeminiOnce(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          // 3.7 は思考を0にできないため、本文ぶんの枠に思考分を上乗せする（241）
          maxOutputTokens: geminiMaxTokens(2048),
          ...GEMINI_TEXT_THINKING_LOW,
        },
      }),
      signal: AbortSignal.timeout(METAPHOR_TIMEOUT_MS),
    },
  );
  const data = await res.json().catch(() => null);
  // 失敗を空文字で握りつぶさない（R-33）
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${res.status})`);
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p?.text ?? '').join('')
    : '';
  if (!text.trim()) throw new Error('Geminiから空の応答が返りました');
  return text;
}

export async function POST(req: NextRequest) {
  // AIを呼ぶルートは認証必須（160）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: '喩えにしたい文章を入力してください' }, { status: 400 });
  }
  if (text.length > METAPHOR_INPUT_MAX) {
    return NextResponse.json(
      { error: `文章は${METAPHOR_INPUT_MAX.toLocaleString()}字までです（現在${text.length.toLocaleString()}字）` },
      { status: 400 },
    );
  }

  // §2-3: 分野は受け取った値のみで決める。文面からの自動判定はしない（誤判定の実害が非対称）
  const field = metaphorFieldOf(body.field);
  const audience = metaphorAudienceOf(body.audience);
  // 一般分野で医療特化の層を指定されたら弾く（画面の出し分けをサーバー側でも担保する）
  if (!audiencesForField(field).some((a) => a.key === audience.key)) {
    return NextResponse.json(
      { error: 'この分野では選べないターゲット層です' },
      { status: 400 },
    );
  }

  const prompt = buildMetaphorPrompt({
    field,
    audienceKey: audience.key as MetaphorAudienceKey,
    text,
    // §10: ナレッジは医療分野のときだけ。ガードより前に置く（R-69）
    knowledge: field === 'medical' ? getPlaybook(MEDICAL_KNOWLEDGE_IDS) : undefined,
  });

  let raw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= METAPHOR_RETRIES; attempt++) {
    try {
      raw = await callGeminiOnce(apiKey, prompt);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError || !raw) {
    const message = lastError instanceof Error ? lastError.message : '比喩の生成に失敗しました';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let parsed: { items?: unknown };
  try {
    parsed = robustJsonParse<{ items?: unknown }>(raw);
  } catch {
    return NextResponse.json({ error: 'AIの応答を解釈できませんでした' }, { status: 502 });
  }

  // §6-2: 3軸・固定順に整える（軸の並びも欠けもAIに委ねない＝R-74）
  const items = alignAxes(parsed.items);
  // 全部「該当なし」＝比喩として成立していない（偽の成功を返さない）
  if (items.every(isAxisNotApplicable)) {
    return NextResponse.json(
      { error: 'この文章からは比喩を作れませんでした（内容を少し具体的にしてお試しください）' },
      { status: 502 },
    );
  }

  // 医療分野のときだけ広告チェック。時間切れは null＝「未実施」として正直に返す（R-39）
  let adCheck: AdCheck | null = null;
  if (field === 'medical') {
    const target = items
      .map((i) => [i.metaphor, i.appliesTo, i.doesNotApply].join('\n'))
      .join('\n');
    adCheck = await Promise.race([
      checkMedicalAd(target),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), METAPHOR_AD_CHECK_TIMEOUT_MS)),
    ]);
  }

  return NextResponse.json({
    audience: audience.key,
    field,
    items,
    adCheck,
    _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL },
  });
}
