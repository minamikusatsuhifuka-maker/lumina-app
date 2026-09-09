// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 314 §3-3: OpenAI GPT-6 Astra（gpt-6-astra）をディープリサーチの並列比較で呼ぶ最小限の口（サーバ専用）
//
// - SDK は足さない。画像生成（158・lib/image-providers）と同じく `fetch` 直叩き。Responses API（/v1/responses）で
//   `web_search` ツール＋ストリーミング（Gemini のグラウンディング・Opus の web_search と条件を揃える）。
// - キーは `process.env.OPENAI_API_KEY` を読むだけ。無ければ呼ばない（ダイアログ側で無効化）。値はログに出さない。
// - 推論の強さ（reasoning.effort）は指定しない（API の既定）。前置き禁止（294）は system/user プロンプト側で効く。
// - リトライは**通信エラー（fetch の throw）だけ 1 回**。時間切れ（AbortSignal）と HTTP エラーではリトライしない（R-73）。
// - 未提供（403／404／model が不明の 400）は「このアカウントではまだ提供されていません」＝その列だけ失敗（fail-closed）。
// - web_search ツールを受け付けない 400 のときだけ、ツール無しで 1 回だけ出し直す（時間切れのリトライではない）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { OPENAI_GPT_MODEL, OPENAI_GPT_MODEL_LABEL } from '@/lib/ai-models';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const OPENAI_UNAVAILABLE_MESSAGE = `${OPENAI_GPT_MODEL_LABEL}（${OPENAI_GPT_MODEL}）はこのアカウントではまだ提供されていません（API 提供は順次）。他の列には影響しません。`;

export function hasOpenAIKey(): boolean {
  const k = process.env.OPENAI_API_KEY;
  return typeof k === 'string' && k.trim() !== '' && k !== 'your_api_key_here';
}

/** 未提供（403／404／model が不明）の判定。純関数（U85） */
export function isOpenAIUnavailable(status: number, errBody: unknown): boolean {
  if (status === 403 || status === 404) return true;
  const msg = openAIErrorMessage(errBody).toLowerCase();
  const code = ((errBody as { error?: { code?: string; param?: string } } | null)?.error?.code ?? '').toLowerCase();
  const param = ((errBody as { error?: { param?: string } } | null)?.error?.param ?? '').toLowerCase();
  if (status === 400 && (code === 'model_not_found' || param === 'model' || /model .* (does not exist|not found)|invalid model|unknown model/.test(msg))) return true;
  return false;
}

/** web_search ツールを受け付けない 400 か（ツール無しで出し直す条件）。純関数 */
export function isOpenAIToolRejected(status: number, errBody: unknown): boolean {
  if (status !== 400) return false;
  const msg = openAIErrorMessage(errBody).toLowerCase();
  const param = ((errBody as { error?: { param?: string } } | null)?.error?.param ?? '').toLowerCase();
  return param.startsWith('tools') || /web_search|tool/.test(msg);
}

export function openAIErrorMessage(errBody: unknown): string {
  const e = (errBody as { error?: { message?: string } | string } | null)?.error;
  if (typeof e === 'string') return e;
  return e?.message ?? '';
}

/** 表示用の失敗理由（原文つき・R-33）。未提供はその旨 */
export function describeOpenAIError(status: number, errBody: unknown): string {
  if (isOpenAIUnavailable(status, errBody)) return OPENAI_UNAVAILABLE_MESSAGE;
  const raw = openAIErrorMessage(errBody);
  if (status === 401) return `OpenAI の認証に失敗しました（OPENAI_API_KEY を確認してください）${raw ? `／原文: ${raw}` : ''}`;
  if (status === 429) return `OpenAI の利用上限または混雑です（アプリの不具合ではありません）${raw ? `／原文: ${raw}` : ''}`;
  return `OpenAI API エラー（HTTP ${status}）${raw ? `／原文: ${raw.slice(0, 300)}` : ''}`;
}

export interface OpenAIResearchArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  signal?: AbortSignal;
  onText: (text: string) => void;
}
export type OpenAIResearchResult =
  | { ok: true; inputTokens: number; outputTokens: number; chars: number }
  | { ok: false; message: string; unavailable: boolean };

function buildBody(args: OpenAIResearchArgs, withTools: boolean): Record<string, unknown> {
  return {
    model: OPENAI_GPT_MODEL,
    instructions: args.systemPrompt,
    input: args.userPrompt,
    max_output_tokens: Math.max(args.maxTokens, 2048), // R-03
    stream: true,
    ...(withTools ? { tools: [{ type: 'web_search' }] } : {}),
  };
}

async function postOnce(body: Record<string, unknown>, apiKey: string, signal?: AbortSignal): Promise<Response> {
  let lastErr: unknown;
  // 通信エラー（throw）だけ 1 回リトライ。Abort（時間切れ）はそのまま投げる（R-73）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('OpenAI API への接続に失敗しました');
}

/** Responses API のストリーム（SSE）を読み、本文の差分を onText へ流す。usage は response.completed から */
export async function streamOpenAIResearch(args: OpenAIResearchArgs): Promise<OpenAIResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: 'OPENAI_API_KEY が未設定です', unavailable: true };
  let res = await postOnce(buildBody(args, true), apiKey, args.signal);
  if (!res.ok) {
    const errBody = await res.clone().json().catch(() => null);
    if (isOpenAIToolRejected(res.status, errBody) && !isOpenAIUnavailable(res.status, errBody)) {
      // web_search ツール非対応のアカウント／モデル。ツール無しで 1 回だけ出し直す（時間切れのリトライではない）
      res = await postOnce(buildBody(args, false), apiKey, args.signal);
    }
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    return { ok: false, message: describeOpenAIError(res.status, errBody), unavailable: isOpenAIUnavailable(res.status, errBody) };
  }
  if (!res.body) return { ok: false, message: 'OpenAI の応答に本文がありません', unavailable: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let chars = 0;
  let failed: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev: { type?: string; delta?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string }; incomplete_details?: { reason?: string } }; error?: { message?: string }; message?: string };
      try {
        ev = JSON.parse(raw);
      } catch {
        continue;
      }
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
        chars += ev.delta.length;
        args.onText(ev.delta);
      } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
        inputTokens = ev.response?.usage?.input_tokens ?? inputTokens;
        outputTokens = ev.response?.usage?.output_tokens ?? outputTokens;
        if (ev.type === 'response.incomplete') failed = `OpenAI の生成が途中で終わりました（${ev.response?.incomplete_details?.reason ?? '理由不明'}）`;
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        failed = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? 'OpenAI のストリームがエラーで終了しました';
      }
    }
  }
  if (failed && chars === 0) return { ok: false, message: failed, unavailable: false };
  if (chars === 0) return { ok: false, message: `${OPENAI_GPT_MODEL_LABEL} の応答が空でした（推論枠の不足または生成の拒否）。`, unavailable: false };
  return { ok: true, inputTokens, outputTokens, chars };
}
