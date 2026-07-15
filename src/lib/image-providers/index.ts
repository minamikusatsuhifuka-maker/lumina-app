// 画像生成プロバイダ層（171）。モデルごとのAPI差異をここに閉じ込め、画面側はモデル固有の
// パラメータを持たない（抽象値 aspect/quality だけを渡す）。各プロバイダは同じ形で返す。
//
// - GPT Image 2 … OpenAI images/generations（既存 /api/image-gen と同じ呼び出しを踏襲）
// - Nano Banana 2 … Gemini 3.1 Flash Image（新SDK @google/genai・model=gemini-3.1-flash-image）
// - Nano Banana Pro … Gemini 3 Pro Image（同・model=gemini-3-pro-image）
//
// テキスト生成の旧SDK(@google/generative-ai)には触れない（画像だけ新SDKを使う・一括移行しない）。

import { GoogleGenAI } from '@google/genai';

export type ImageModelKey = 'gpt-image-2' | 'nano-banana-2' | 'nano-banana-pro';
export type ImageAspect = 'square' | 'landscape' | 'portrait';
export type ImageQuality = 'low' | 'medium' | 'high';

// UI表示用のアスペクト選択肢（モデル固有の値はUIに出さない）
export const ASPECT_OPTIONS: { value: ImageAspect; label: string }[] = [
  { value: 'square', label: '正方形' },
  { value: 'landscape', label: '横長' },
  { value: 'portrait', label: '縦長' },
];

export interface ImageGenParams {
  prompt: string;
  aspect: ImageAspect;
  quality: ImageQuality;
}

export type ProviderResult =
  | { ok: true; model: ImageModelKey; base64: string; mimeType: string; sizeLabel: string; elapsedMs: number }
  | { ok: false; model: ImageModelKey; error: string; elapsedMs: number };

// UI表示用メタ（コスト目安は静的な定数＝AIに数値を出させない。複数選択＝枚数分課金）
export interface ImageModelMeta {
  key: ImageModelKey;
  label: string;
  note: string;
  approxCost: string;
}

export const IMAGE_MODELS: ImageModelMeta[] = [
  { key: 'gpt-image-2', label: 'GPT Image 2', note: '現行の既定・堅実', approxCost: '画質により変動' },
  { key: 'nano-banana-2', label: 'Nano Banana 2', note: '高速・低コスト', approxCost: '約 $0.02〜0.04 / 枚' },
  { key: 'nano-banana-pro', label: 'Nano Banana Pro', note: '高品質・文字に強い', approxCost: '約 $0.13 / 枚' },
];

export const DEFAULT_MODELS: ImageModelKey[] = ['gpt-image-2'];

// 抽象 aspect → 各モデルのサイズ表現
const GPT_SIZE: Record<ImageAspect, string> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
};
const GEMINI_ASPECT: Record<ImageAspect, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
};

const GEMINI_MODEL_ID: Record<'nano-banana-2' | 'nano-banana-pro', string> = {
  'nano-banana-2': 'gemini-3.1-flash-image',
  'nano-banana-pro': 'gemini-3-pro-image',
};

// モデルごとの個別タイムアウト（1つの遅延で全体を巻き込まない）
const TIMEOUT_MS: Record<ImageModelKey, number> = {
  'gpt-image-2': 150_000,
  'nano-banana-2': 90_000,
  'nano-banana-pro': 120_000,
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} がタイムアウトしました（${ms / 1000}秒）`)), ms),
    ),
  ]);
}

// --- GPT Image 2（OpenAI）--------------------------------------------------
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenAI APIへの接続に失敗しました');
}

async function generateGpt(params: ImageGenParams): Promise<{ base64: string; mimeType: string; sizeLabel: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY が設定されていません');
  const size = GPT_SIZE[params.aspect];
  const res = await fetchWithRetry('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-2', prompt: params.prompt, size, quality: params.quality, n: 1 }),
  });
  if (!res.ok) {
    const errorData = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errorData?.error?.message || `OpenAI APIエラー (${res.status})`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('画像が生成されませんでした');
  return { base64: b64, mimeType: 'image/png', sizeLabel: size };
}

// --- Gemini（Nano Banana 2 / Pro）------------------------------------------
let _genai: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!_genai) {
    const apiKey = process.env.GEMINI_API_KEY?.replace(/[^\x20-\x7E]/g, '') || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
    _genai = new GoogleGenAI({ apiKey });
  }
  return _genai;
}

async function generateGemini(
  key: 'nano-banana-2' | 'nano-banana-pro',
  params: ImageGenParams,
): Promise<{ base64: string; mimeType: string; sizeLabel: string }> {
  const genai = getGenAI();
  const aspect = GEMINI_ASPECT[params.aspect];
  const res = await genai.models.generateContent({
    model: GEMINI_MODEL_ID[key],
    contents: params.prompt,
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
  });
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    throw new Error('画像が生成されませんでした（安全フィルター等でブロックされた可能性）');
  }
  return {
    base64: img.inlineData.data,
    mimeType: img.inlineData.mimeType || 'image/png',
    sizeLabel: aspect,
  };
}

// 単一モデルの生成（例外を投げず ProviderResult で返す＝並列で部分成功にできる）
export async function generateWithProvider(
  model: ImageModelKey,
  params: ImageGenParams,
): Promise<ProviderResult> {
  const t = Date.now();
  try {
    const core =
      model === 'gpt-image-2'
        ? generateGpt(params)
        : generateGemini(model, params);
    const out = await withTimeout(core, TIMEOUT_MS[model], model);
    return { ok: true, model, ...out, elapsedMs: Date.now() - t };
  } catch (e) {
    return {
      ok: false,
      model,
      error: e instanceof Error ? e.message : '生成に失敗しました',
      elapsedMs: Date.now() - t,
    };
  }
}
