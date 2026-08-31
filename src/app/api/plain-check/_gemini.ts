// 279: /api/plain-check 配下で共用する Gemini 呼び出し（JSON応答・内部タイムアウトつき）。
// 生成のみでDBに書かない。失敗は throw（空文字で握りつぶさない＝R-33）。
import {
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_THINKING_LOW,
  geminiMaxTokens,
} from '@/lib/ai-models';

export async function callGeminiJson(apiKey: string, prompt: string, maxTokens: number, timeoutMs: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: geminiMaxTokens(maxTokens), // 3.7 は思考を0にできない（241）
          ...GEMINI_TEXT_THINKING_LOW,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${res.status})`);
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? '').join('') : '';
  if (!text.trim()) throw new Error('Geminiから空の応答が返りました');
  return text;
}
