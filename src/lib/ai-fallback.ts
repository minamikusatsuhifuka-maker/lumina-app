// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claude → Gemini 自動フォールバック（指示書235・共通層）
//
// 背景: 234でAnthropicが利用上限に達し、Claude系の全機能が停止した。
// 院長判断により「上限は引き上げず、Geminiへ自動フォールバックする」。
//
// 設計方針:
// - **共通層に1本だけ置く**。各ルートに個別実装しない（R-01の精神）
// - フォールバックするのは「上限・混雑」系のみ（isFallbackWorthy）。
//   認証エラー・リクエスト不正は隠さずそのまま表面化させる（R-33）
// - 戻り値に provider を必ず含める。無言で品質が変わる状態を作らない（235要件2）
// - Geminiも失敗したら throw する。偽の成功を返さない（R-05 fail-closed）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  CLAUDE_TEXT_MODEL,
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_MODEL_LABEL,
  CLAUDE_TEXT_MODEL_LABEL,
  GEMINI_TEXT_THINKING_LOW,
  GEMINI_TEXT_THINKING_MEDIUM,
} from '@/lib/ai-models';
import { extractAnthropicText } from '@/lib/anthropic-text';
import { describeAnthropicError, isFallbackWorthy } from '@/lib/anthropic-error';

export type AIProvider = 'claude' | 'gemini';

export interface AIProviderInfo {
  provider: AIProvider;
  /** UI表示用のモデル名（例: 'Gemini 3.7 Flash'） */
  modelLabel: string;
  /** claude→gemini に切り替わった場合のみ、その理由 */
  fallbackReason?: string;
}

export interface TextAIRequest {
  system?: string;
  /** Anthropic 形式のメッセージ（Gemini へは自動変換する） */
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export interface TextAIResult extends AIProviderInfo {
  text: string;
}

/** フォールバック発生時にUIへ出す定型文（画面ごとに書き分けない） */
export const FALLBACK_BADGE = `✨ ${GEMINI_TEXT_MODEL_LABEL}で生成`;

export function providerBadge(info: AIProviderInfo | null | undefined): string | null {
  if (!info || info.provider !== 'gemini') return null;
  return FALLBACK_BADGE;
}

/* ══════════════ Gemini 呼び出し（REST・SDKの型に縛られない） ══════════════ */

// Gemini 3.x は思考が既定で枠を消費する。長文（章執筆・記事生成＝枠8000以上）は
// 品質優先で medium、短めの機械的タスクは速度優先で low を使う（ai-models.ts の使い分けに準拠）。
function thinkingFor(maxTokens: number) {
  return maxTokens >= 8000 ? GEMINI_TEXT_THINKING_MEDIUM : GEMINI_TEXT_THINKING_LOW;
}

export async function callGeminiText(req: TextAIRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

  const contents = req.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        generationConfig: { maxOutputTokens: req.maxTokens, ...thinkingFor(req.maxTokens) },
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${res.status})`);
  }
  // parts が複数に割れることがあるため全連結する（content[0]固定参照と同じ罠・R-02）
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? '').join('') : '';
  if (!text.trim()) throw new Error('Geminiの応答が空でした');
  return text;
}

/* ══════════════ Claude → Gemini（非ストリーミング） ══════════════ */

/**
 * Claude で生成し、上限・混雑エラーなら Gemini に切り替えて継続する。
 * どちらのプロバイダで生成したかを必ず返す（UIでの明示に使う）。
 */
export async function generateTextWithFallback(req: TextAIRequest): Promise<TextAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Anthropicキーが無い環境ではGeminiを本命として使う（フォールバックではない）
  if (!apiKey) {
    return { text: await callGeminiText(req), provider: 'gemini', modelLabel: GEMINI_TEXT_MODEL_LABEL };
  }

  let fallbackReason: string | null = null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_TEXT_MODEL,
        // 209: thinking既定ONのため下限2048を保証（R-03）
        max_tokens: Math.max(req.maxTokens, 2048),
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      // 上限・混雑以外（認証・リクエスト不正）は隠さずそのまま上げる（R-33）
      if (!isFallbackWorthy(response.status, data)) {
        throw new Error(describeAnthropicError(response.status, data));
      }
      fallbackReason = describeAnthropicError(response.status, data);
    } else {
      const text = extractAnthropicText(data.content);
      if (text.trim()) {
        return { text, provider: 'claude', modelLabel: CLAUDE_TEXT_MODEL_LABEL };
      }
      // 200なのに本文が空＝枠切れ等。Geminiで取り直す価値があるためフォールバック扱い
      fallbackReason = 'Claudeの応答が空でした';
    }
  } catch (e) {
    // ネットワーク断など。describeAnthropicError由来の非フォールバック例外はそのまま投げ直す
    const msg = e instanceof Error ? e.message : String(e);
    if (/認証に失敗|AI呼び出しに失敗しました \(4[0-9][0-9]\)/.test(msg)) throw e;
    fallbackReason = msg;
  }

  // ── Gemini へ切り替え ──
  try {
    const text = await callGeminiText(req);
    return {
      text,
      provider: 'gemini',
      modelLabel: GEMINI_TEXT_MODEL_LABEL,
      fallbackReason: fallbackReason ?? undefined,
    };
  } catch (geminiErr) {
    // fail-closed: 両方失敗したら、どちらがなぜ落ちたかを両方載せて throw（R-05）
    const gMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    throw new Error(`AI生成に失敗しました。Claude: ${fallbackReason ?? '不明'} ／ Gemini: ${gMsg}`);
  }
}

/* ══════════════ Claude → Gemini（ストリーミング） ══════════════ */

/**
 * ストリーミング生成。Claudeが上限・混雑で落ちたら Gemini のストリーミングに切り替える。
 * onDelta で差分を流し、最終的に全文と provider を返す。
 *
 * 注意: Claudeが**流し始めてから**落ちた場合は、途中まで出た文章と重複しないよう
 * onReset を呼んで受け手側の蓄積を捨ててから Gemini 分を流す。
 */
export async function streamTextWithFallback(
  req: TextAIRequest,
  handlers: { onDelta: (text: string) => void; onReset?: () => void },
): Promise<TextAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let fallbackReason: string | null = null;
  let emitted = false;

  if (apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: CLAUDE_TEXT_MODEL,
          max_tokens: Math.max(req.maxTokens, 2048),
          stream: true,
          ...(req.system ? { system: req.system } : {}),
          messages: req.messages,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        if (!isFallbackWorthy(response.status, errBody)) {
          throw new Error(describeAnthropicError(response.status, errBody));
        }
        fallbackReason = describeAnthropicError(response.status, errBody);
      } else {
        let full = '';
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                full += ev.delta.text;
                emitted = true;
                handlers.onDelta(ev.delta.text);
              }
            } catch {
              /* SSEの断片行は無視（次チャンクで揃う） */
            }
          }
        }
        if (full.trim()) return { text: full, provider: 'claude', modelLabel: CLAUDE_TEXT_MODEL_LABEL };
        fallbackReason = 'Claudeの応答が空でした';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/認証に失敗/.test(msg)) throw e;
      fallbackReason = msg;
    }
  }

  // ── Gemini へ切り替え ──
  // Gemini はストリーミングも可能だが、途中まで出た文章との整合を単純に保つため
  // 一括生成して分割送出する（受け手のSSE形式は変えない）
  if (emitted) handlers.onReset?.();
  try {
    const text = await callGeminiText(req);
    // 受け手のUIが「生成中」に見えるよう適度な粒度で流す
    const CHUNK = 200;
    for (let i = 0; i < text.length; i += CHUNK) handlers.onDelta(text.slice(i, i + CHUNK));
    return {
      text,
      provider: 'gemini',
      modelLabel: GEMINI_TEXT_MODEL_LABEL,
      fallbackReason: fallbackReason ?? undefined,
    };
  } catch (geminiErr) {
    const gMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    throw new Error(`AI生成に失敗しました。Claude: ${fallbackReason ?? '不明'} ／ Gemini: ${gMsg}`);
  }
}
