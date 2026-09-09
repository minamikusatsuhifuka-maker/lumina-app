// 315 §3-4: GPT Image 2.5（OpenAI images/generations）の最小限の口（サーバ専用・SDK なし・fetch 直叩き＝158/171 と同じ）
// キーは環境変数を読むだけ（未設定なら呼ばない・値はログに出さない）。未提供（403/404/model 不明）は 314 と同じ判定を共用。
// リトライは通信エラーだけ 1 回。時間切れ（AbortSignal）と HTTP エラーではリトライしない（R-73）
import { IMAGE_MODEL_IDS } from '@/lib/model-pricing';
import { describeOpenAIError, isOpenAIUnavailable, openAIErrorMessage } from '@/lib/openai-research';

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

export interface OpenAIImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
}
export type OpenAIImageResult =
  | { ok: true; base64: string; usage: OpenAIImageUsage | null; model: string }
  | { ok: false; message: string; unavailable: boolean };

export async function generateGptImage25(args: {
  model: keyof typeof IMAGE_MODEL_IDS;
  prompt: string;
  size: string;
  quality: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}): Promise<OpenAIImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: 'OPENAI_API_KEY が未設定です', unavailable: true };
  const modelId = IMAGE_MODEL_IDS[args.model];
  const body = JSON.stringify({ model: modelId, prompt: args.prompt, size: args.size, quality: args.quality, n: 1 });
  let res: Response | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(OPENAI_IMAGES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
        ...(args.signal ? { signal: args.signal } : {}),
      });
      break;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!res) throw lastErr instanceof Error ? lastErr : new Error('OpenAI API への接続に失敗しました');
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const unavailable = isOpenAIUnavailable(res.status, errBody);
    // R-33: 理由は原文つき（HTTP と OpenAI のメッセージ）。キーの値は含めない
    const raw = openAIErrorMessage(errBody).slice(0, 200);
    return { ok: false, message: unavailable ? `GPT Image 2.5（${modelId}）はこのアカウントではまだ提供されていません（API 提供は順次）。／HTTP ${res.status}${raw ? `・原文: ${raw}` : ''}` : describeOpenAIError(res.status, errBody), unavailable };
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[]; usage?: OpenAIImageUsage };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return { ok: false, message: '画像が生成されませんでした（安全フィルター等でブロックされた可能性）', unavailable: false };
  return { ok: true, base64: b64, usage: data.usage ?? null, model: modelId };
}
