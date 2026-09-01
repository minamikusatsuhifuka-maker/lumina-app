// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281: 📔 エピソード記録 — 参考例（あるある）の生成。**1リクエスト**（§8）
//
// 参考例は「思い出すための引き金」であって記録ではない（§2）。
// このルートは文字列の配列を返すだけで、DBには何も書かない＝記録欄へ流れる経路を持たない。
// 断定形はサーバ側で落とす（normalizeExamples・決定的）。件数は5〜7（多すぎると誘導になる）。
//
// R-73: 25秒 ×（本番1回＋再試行1回）= 50秒 ≤ maxDuration 60秒。定数は lib/episodes.ts が正本。
// R-39: 失敗しても記録の入力は妨げない（画面側は参考例なしで続行できる）。
// §5-2: テーマ（院長の入力）をログに出さない。
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
import {
  EXAMPLES_RETRIES,
  EXAMPLES_TIMEOUT_MS,
  EXAMPLE_THEME_MAX,
  buildExamplesPrompt,
  normalizeExamples,
} from '@/lib/episodes';

export const runtime = 'nodejs';
// R-83: セグメント設定はリテラルのみ。正本は lib/episodes.ts の EXAMPLES_MAX_DURATION_S（U55が整合を判定）
export const maxDuration = 60;

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
          maxOutputTokens: geminiMaxTokens(1024),
          ...GEMINI_TEXT_THINKING_LOW,
        },
      }),
      signal: AbortSignal.timeout(EXAMPLES_TIMEOUT_MS),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${res.status})`);
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? '').join('') : '';
  if (!text.trim()) throw new Error('Geminiから空の応答が返りました');
  return text;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
  if (!theme) return NextResponse.json({ error: '記録したいテーマを入力してください' }, { status: 400 });
  if (theme.length > EXAMPLE_THEME_MAX) {
    return NextResponse.json({ error: `テーマは${EXAMPLE_THEME_MAX}字までです` }, { status: 400 });
  }

  const prompt = buildExamplesPrompt(theme);
  let raw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= EXAMPLES_RETRIES; attempt++) {
    try {
      raw = await callGeminiOnce(apiKey, prompt);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError || !raw) {
    const message = lastError instanceof Error ? lastError.message : '参考例の生成に失敗しました';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let parsed: { items?: unknown };
  try {
    parsed = robustJsonParse<{ items?: unknown }>(raw);
  } catch {
    return NextResponse.json({ error: 'AIの応答を解釈できませんでした' }, { status: 502 });
  }
  const items = normalizeExamples(parsed?.items);
  if (items.length === 0) {
    // 断定形しか返らなかった等。偽の成功にしない（R-33）
    return NextResponse.json({ error: '問いかけの形の参考例が得られませんでした。もう一度お試しください' }, { status: 502 });
  }
  return NextResponse.json({
    items,
    _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL },
  });
}
