// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anthropic 互換フォールバック層（指示書242）
//
// 背景: 235でフォールバック共通層を作ったが、Anthropicを直接叩くルートが109本残っていた
// （R-41の未完了分）。241でAnthropicが利用上限に達し、これら全機能が停止した。
//
// 設計方針:
// - **入出力を Anthropic のまま**にする。呼び出し側は fetch / SDK client を1行差し替えるだけで、
//   `data.content.filter(b => b.type === 'text')` 等の下流コードは一切変更しない。
//   → 成功時は素通し＝**挙動等価が構造的に保証される**（109本を手で書き換える方式より安全）
// - フォールバックするのは「上限・混雑」系のみ（isFallbackWorthy）。
//   認証エラー・リクエスト不正は隠さずそのまま表面化させる（R-33・235の設計どおり）
// - Geminiも失敗したら Anthropic 形式のエラーではなく throw／エラーstatusで返す。
//   偽の成功を作らない（R-05 fail-closed）
// - 切替は無言にしない: 合成レスポンスの `model` に Gemini のIDを入れ、
//   HTTPヘッダ `x-ai-provider: gemini` / `x-ai-fallback-reason` を付ける（235要件2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GEMINI_TEXT_MODEL } from '@/lib/ai-models';
import { callGeminiRaw, type TextAIRequest } from '@/lib/ai-fallback';
import { describeAnthropicError, isFallbackWorthy } from '@/lib/anthropic-error';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* ══════════════ Anthropic 互換の型（SDKの型の代わりに使う） ══════════════ */

/** 非ストリーミングの戻り値。SDK の Message と同じ形（下流の content 参照がそのまま通る） */
export interface AnthropicMessageLike {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: { type: string; text?: string; [k: string]: unknown }[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number; [k: string]: unknown };
}

/** ストリーミングのイベント。SDK と同じ判別可能unionにして `event.delta.type` 等をそのまま通す */
export type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicMessageLike }
  | { type: 'content_block_start'; index: number; content_block: { type: string; text?: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null; stop_sequence: string | null }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'ping' };

/** Anthropic の messages API に渡すリクエストボディ（必要な範囲だけ型を付ける） */
export interface AnthropicBody {
  model: string;
  max_tokens: number;
  system?: string | unknown[];
  messages: { role: string; content: unknown }[];
  stream?: boolean;
  tools?: unknown[];
  [key: string]: unknown;
}

/* ══════════════ Anthropic → Gemini のリクエスト変換 ══════════════ */

/** content が配列（マルチモーダル等）でもテキスト部分だけを取り出す */
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : (b as { type?: string; text?: string })?.type === 'text' ? ((b as { text?: string }).text ?? '') : ''))
      .join('');
  }
  return '';
}

function systemToText(system: AnthropicBody['system']): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return contentToText(system) || undefined;
}

/** Claude の web_search ツールが指定されているか（Gemini側は googleSearch で代替する） */
function wantsWebSearch(tools: unknown[] | undefined): boolean {
  if (!Array.isArray(tools)) return false;
  return tools.some((t) => /web_search/.test(String((t as { type?: string; name?: string })?.type ?? (t as { name?: string })?.name ?? '')));
}

function toGeminiRequest(body: AnthropicBody): TextAIRequest {
  return {
    system: systemToText(body.system),
    messages: (body.messages || []).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: contentToText(m.content),
    })),
    maxTokens: body.max_tokens,
    webSearch: wantsWebSearch(body.tools),
  };
}

/* ══════════════ Gemini の結果 → Anthropic 形式への合成 ══════════════ */

/** 非ストリーミングの Messages レスポンス（Anthropic と同じ形） */
function buildMessage(text: string, inputTokens: number, outputTokens: number) {
  return {
    id: `msg_gemini_${Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    // 切替を無言にしないため、実際に生成したモデルを載せる（235要件2）
    model: GEMINI_TEXT_MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/** ストリーミングのイベント列（Anthropic の SSE と同じ順序・同じ type） */
function buildStreamEvents(text: string, inputTokens: number, outputTokens: number): Record<string, unknown>[] {
  const CHUNK = 200;
  const deltas: Record<string, unknown>[] = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    deltas.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + CHUNK) } });
  }
  return [
    {
      type: 'message_start',
      message: { ...buildMessage('', inputTokens, 0), content: [], stop_reason: null },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...deltas,
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } },
    { type: 'message_stop' },
  ];
}

function eventsToSSE(events: Record<string, unknown>[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

/* ══════════════ ① fetch 互換（直fetchルート向け） ══════════════ */

/**
 * `fetch('https://api.anthropic.com/v1/messages', {...})` の置き換え。
 * **戻り値は Response** なので、呼び出し側の `res.ok` / `res.json()` / `res.body` は
 * すべてそのまま動く。成功時は Anthropic のレスポンスを素通しする。
 *
 * 使い方（1行置換）:
 *   const res = await fetch('https://api.anthropic.com/v1/messages', { ...init });
 *   → const res = await fetchAnthropic(body);
 */
export async function fetchAnthropic(body: AnthropicBody): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let fallbackReason: string | null = null;

  if (apiKey) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      // 成功時はそのまま返す（ストリーミングの body もここで素通しされる）
      if (res.ok) return res;

      const errBody = await res.clone().json().catch(() => null);
      // 上限・混雑以外（認証・リクエスト不正）は隠さずそのまま返す（R-33）
      if (!isFallbackWorthy(res.status, errBody)) return res;
      fallbackReason = describeAnthropicError(res.status, errBody);
    } catch (e) {
      fallbackReason = e instanceof Error ? e.message : String(e);
    }
  } else {
    // Anthropicキーが無い環境ではGeminiを本命として使う（フォールバックではない）
    fallbackReason = null;
  }

  // ── Gemini へ切り替え ──
  try {
    const g = await callGeminiRaw(toGeminiRequest(body));
    const headers: Record<string, string> = {
      'Content-Type': body.stream ? 'text/event-stream' : 'application/json',
      'x-ai-provider': 'gemini',
    };
    // ヘッダには非ASCIIを載せられないため理由はエンコードして渡す
    if (fallbackReason) headers['x-ai-fallback-reason'] = encodeURIComponent(fallbackReason);

    const payload = body.stream
      ? eventsToSSE(buildStreamEvents(g.text, g.inputTokens, g.outputTokens))
      : JSON.stringify(buildMessage(g.text, g.inputTokens, g.outputTokens));
    return new Response(payload, { status: 200, headers });
  } catch (geminiErr) {
    // fail-closed: 両方失敗したら、どちらがなぜ落ちたかを両方載せる（R-05）
    const gMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    const message = `AI生成に失敗しました。Claude: ${fallbackReason ?? '不明'} ／ Gemini: ${gMsg}`;
    return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * `fetch(url, init)` と**同一シグネチャ**の置き換え口（242の一括接続用）。
 * 既存コードの `fetch(` を `anthropicFetch(` に変えるだけでよく、
 * init の headers / body（JSON文字列）はそのまま渡せる＝差分が最小になり、
 * 引数の括弧構造を触らないので機械置換でも壊れない。
 * url と headers は互換のために受け取るだけで、実際の送信は fetchAnthropic が行う。
 */
export async function anthropicFetch(_url: string, init: RequestInit): Promise<Response> {
  let body: AnthropicBody;
  try {
    body = JSON.parse(String(init?.body ?? '{}'));
  } catch {
    // JSON以外のbodyは想定外。素通しせず、原因の分かる形で返す（R-33 / R-05）
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'anthropicFetch: body をJSONとして解釈できませんでした' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return fetchAnthropic(body);
}

/**
 * 242: fetchAnthropic の応答に付いた provider 情報を、
 * ルートが返す Response へそのまま転送するためのヘッダを作る。
 * クライアントの AIProviderNotice がこれを見て「✨Geminiで生成」を出す。
 * Claude で生成できたときは空オブジェクト＝画面には何も出ない。
 */
export function providerHeaders(res: Response): Record<string, string> {
  const provider = res.headers.get('x-ai-provider');
  if (!provider) return {};
  const reason = res.headers.get('x-ai-fallback-reason');
  return { 'x-ai-provider': provider, ...(reason ? { 'x-ai-fallback-reason': reason } : {}) };
}

/* ══════════════ ② SDK 互換（new Anthropic() ルート向け） ══════════════ */

/** SSE の Response を「イベントを1件ずつ yield する AsyncIterable」に変える（逐次・バッファ蓄積なし） */
async function* iterateSSE(res: Response): AsyncGenerator<AnthropicStreamEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    // 最後の要素は次チャンクで揃う可能性があるため持ち越す
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch {
        /* SSEの断片行は無視（次チャンクで揃う） */
      }
    }
  }
}

/**
 * `new Anthropic({ apiKey })` の置き換え。`client.messages.create()` の
 * 非ストリーミング／ストリーミング（AsyncIterable）の双方に対応する。
 *
 * 使い方（1行置換）:
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *   → const client = createAnthropicClient();
 */
// SDK と同じ使い勝手にするための型: stream:true なら AsyncIterable、それ以外は Message。
interface AnthropicCreate {
  (body: AnthropicBody & { stream: true }): Promise<AsyncGenerator<AnthropicStreamEvent>>;
  (body: AnthropicBody): Promise<AnthropicMessageLike>;
}

export function createAnthropicClient() {
  const create = (async (body: AnthropicBody) => {
    const res = await fetchAnthropic(body);
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        (errBody as { error?: { message?: string } })?.error?.message ||
          describeAnthropicError(res.status, errBody),
      );
    }

    if (!body.stream) return (await res.json()) as AnthropicMessageLike;

    // ストリーミング: SDK と同じく「イベントを yield する AsyncIterable」を返す。
    // Anthropicが生きているときは本物の逐次ストリームをそのまま流す（体感を変えない）。
    return iterateSSE(res);
  }) as AnthropicCreate;

  return { messages: { create } };
}
