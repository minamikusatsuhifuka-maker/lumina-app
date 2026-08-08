import { GEMINI_TEXT_MODEL, GEMINI_TEXT_THINKING_MINIMAL } from '@/lib/ai-models';
import { generateTextWithFallback, type AIProviderInfo } from '@/lib/ai-fallback';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CallAIOptions {
  model: 'claude' | 'gemini';
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
}

export async function callAI(options: CallAIOptions): Promise<string> {
  return (await callAIWithProvider(options)).text;
}

/**
 * callAI と同じ処理で、どのモデルが実際に生成したかも返す（235）。
 * フォールバックが起きたことを画面に出したい呼び出し側はこちらを使う。
 */
export async function callAIWithProvider(
  options: CallAIOptions,
): Promise<{ text: string } & AIProviderInfo> {
  // 195: Sonnet 5はthinking既定ON＝max_tokensが思考+本文の合算上限になるため既定枠を増額
  const { model, system, messages, maxTokens = 2048 } = options;

  if (model === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

    const geminiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // systemプロンプトをuserメッセージの先頭に追加
    if (system && geminiMessages.length > 0) {
      geminiMessages[0].parts[0].text = `${system}\n\n${geminiMessages[0].parts[0].text}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          // 3.6 Flashでtemperatureは廃止（将来400エラー）のため送らない。
          // 呼び出し元は対話・短文JSON抽出（枠500〜1000）で、思考既定mediumだと
          // 思考が枠を食い潰して本文が空になるため minimal を明示。
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...GEMINI_TEXT_THINKING_MINIMAL,
          },
        }),
      },
    );

    const data = await response.json();
    // 235: 失敗を空文字で握りつぶさない（R-33）
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini呼び出しに失敗しました (${response.status})`);
    }
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? '').join('') : '';
    return { text, provider: 'gemini', modelLabel: 'Gemini 3.6 Flash' };
  }

  // 235: Claude選択時は、上限・混雑ならGeminiへ自動フォールバック（共通層で一括対応）
  return await generateTextWithFallback({ system, messages, maxTokens });
}
