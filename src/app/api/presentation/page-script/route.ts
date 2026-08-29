// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 275: プレゼン発表原稿 — **スライド1枚 = 1リクエスト**（§2-4）
//
// 全ページを1リクエストで回さない。20ページ一括なら maxDuration 300秒を確実に超えるため、
// 逐次呼び出し（269「1リクエスト=1記事」と同じ方針）にして、1枚の失敗を1枚に閉じ込める（R-39）。
//
// R-73（内部タイムアウトはリトライ込みで積算）:
//   原稿生成 45秒 ×（本番1回 + 再試行1回）= 90秒
//   ＋ 医療広告チェック 15秒（付加情報。落ちても原稿は返す）
//   = 最悪 105秒 ≤ maxDuration 120秒。数値は lib/presentation.ts の定数が正本。
//
// 画像は**保存しない**（§2-3）。リクエストのメモリ内でGeminiへ渡すだけで、Blob等へは書かない。
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
import {
  AD_CHECK_TIMEOUT_MS,
  PAGE_SCRIPT_RETRIES,
  PAGE_SCRIPT_TIMEOUT_MS,
  audienceOf,
  buildPageScriptPrompt,
  summarizeForNext,
  type PageScriptResult,
} from '@/lib/presentation';

export const runtime = 'nodejs';
// Next.js のセグメント設定はリテラルでなければ効かない（定数を入れると Invalid segment configuration）。
// 正本は lib/presentation.ts の PAGE_SCRIPT_MAX_DURATION_S。ズレは unit U46 が機械判定する。
export const maxDuration = 120;

/** 受け付ける画像（PDFはクライアントでJPEG化済み・§2-2） */
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const DATA_URL_RE = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

function parseImage(dataUrl: unknown): { mimeType: string; data: string } | null {
  if (typeof dataUrl !== 'string' || !dataUrl) return null;
  const m = dataUrl.match(DATA_URL_RE);
  if (!m || !ALLOWED_IMAGE_MIME.includes(m[1])) return null;
  return { mimeType: m[1], data: m[2].replace(/\s+/g, '') };
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/** 1回ぶんのGemini呼び出し（マルチモーダル・内部タイムアウトつき） */
async function callGeminiOnce(apiKey: string, parts: GeminiPart[]): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          // 3.7 は思考を0にできない。本文ぶんの枠に思考分を上乗せする（241）
          maxOutputTokens: geminiMaxTokens(3000),
          ...GEMINI_TEXT_THINKING_LOW,
        },
      }),
      signal: AbortSignal.timeout(PAGE_SCRIPT_TIMEOUT_MS),
    },
  );
  const data = await res.json().catch(() => null);
  // 失敗を空文字で握りつぶさない（R-33）
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${res.status})`);
  }
  const candidateParts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(candidateParts)
    ? candidateParts.map((p: { text?: string }) => p?.text ?? '').join('')
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

  const pageNumber = Number(body.pageNumber);
  const totalPages = Number(body.totalPages);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || !Number.isFinite(totalPages) || totalPages < 1) {
    return NextResponse.json({ error: 'ページ番号が不正です' }, { status: 400 });
  }

  const image = parseImage(body.imageDataUrl);
  const pageText = typeof body.pageText === 'string' ? body.pageText : '';
  // 画像もテキストも無ければ読むものが無い（偽の原稿を作らない＝fail-closed）
  if (!image && !pageText.trim()) {
    return NextResponse.json(
      { error: 'このページから読み取れる画像・テキストがありません' },
      { status: 400 },
    );
  }

  const audience = audienceOf(body.audience);
  const theme = typeof body.theme === 'string' ? body.theme : '';
  const prompt = buildPageScriptPrompt({
    audienceKey: audience.key,
    theme,
    pageNumber,
    totalPages,
    prevSummary: typeof body.prevSummary === 'string' ? body.prevSummary : '',
    nextTitle: typeof body.nextTitle === 'string' ? body.nextTitle : '',
    pageText,
    hasImage: !!image,
  });

  // 画像 → テキストの順（既存のVision呼び出しと同じ並び）
  const parts: GeminiPart[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  parts.push({ text: prompt });

  // ── 生成（1回失敗したら1回だけ再試行。合計はR-73どおり積算済み）──
  let raw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= PAGE_SCRIPT_RETRIES; attempt++) {
    try {
      raw = await callGeminiOnce(apiKey, parts);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError || !raw) {
    const message = lastError instanceof Error ? lastError.message : '原稿の生成に失敗しました';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = robustJsonParse<Record<string, unknown>>(raw);
  } catch {
    return NextResponse.json({ error: 'AIの応答を解釈できませんでした' }, { status: 502 });
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const result: PageScriptResult = {
    slideTitle: str(parsed.slideTitle),
    sections: {
      connect: str(parsed.connect),
      main: str(parsed.main),
      supplement: str(parsed.supplement),
      handoff: str(parsed.handoff),
    },
    // 要約はAIの返答を使い、無ければ本題から決定的に導出する（R-74）
    summaryForNext: summarizeForNext(str(parsed.main), str(parsed.summary)),
    inferredTheme: theme.trim() || str(parsed.theme) || str(parsed.slideTitle),
  };

  // 本題が空＝原稿として成立していない（偽の成功を返さない）
  if (!result.sections.main) {
    return NextResponse.json({ error: '原稿の本文が生成されませんでした' }, { status: 502 });
  }

  // ── 医療広告チェック（付加情報）。時間切れは null＝「未実施」として正直に返す（R-39）──
  const checkTarget = [
    result.sections.connect,
    result.sections.main,
    result.sections.supplement,
    result.sections.handoff,
  ].join('\n');
  const adCheck: AdCheck | null = await Promise.race([
    checkMedicalAd(checkTarget),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AD_CHECK_TIMEOUT_MS)),
  ]);

  return NextResponse.json({
    ...result,
    adCheck,
    _ai: { provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL },
  });
}
