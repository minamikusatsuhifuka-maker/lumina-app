import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIModel = 'claude' | 'gemini';
// SSEの出力フォーマット: 'standard' = {type:'text', content}、'delta' = {type:'delta', text}
export type StreamFormat = 'standard' | 'delta';

export const MODEL_OPTIONS = [
  {
    id: 'claude' as AIModel,
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: '高品質・バランス型。創造的な文章生成に強い',
    icon: '🤖',
  },
  {
    id: 'gemini' as AIModel,
    name: 'Gemini 3.5 Flash',
    provider: 'Google',
    description: '安定・高精度。複雑な分析・長文処理に強い',
    icon: '✨',
  },
];

const GEMINI_MODEL_ID = 'gemini-3.5-flash';
const CLAUDE_MODEL_ID = 'claude-sonnet-4-6';

function getGemini() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

// 通常生成（非ストリーミング）
// geminiGenerationConfig: gemini の generationConfig を追加上書きする（例: responseMimeType:'application/json'）。
//   既存呼び出しは未指定のため挙動不変。JSON抽出が必要な用途(AIメモtriage等)でのみ渡す。
export async function generateWithModel(
  model: AIModel,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4000,
  geminiGenerationConfig?: Record<string, unknown>,
): Promise<string> {
  if (model === 'gemini') {
    const genAI = getGemini();
    const geminiModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL_ID,
      ...(systemPrompt && { systemInstruction: systemPrompt }),
    });
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, ...geminiGenerationConfig },
    });
    return result.response.text();
  }

  // Claude (default)
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: CLAUDE_MODEL_ID,
      max_tokens: maxTokens,
      ...(systemPrompt && { system: systemPrompt }),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// SSEストリーミング生成
// format で SSE 出力形式を選択（既存 API との互換性のため）
// 戻り値で input/output トークン使用量を返す（trackUsage 用）
export async function streamWithModel(
  model: AIModel,
  prompt: string,
  systemPrompt: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  maxTokens = 8000,
  format: StreamFormat = 'standard',
): Promise<{ inputTokens: number; outputTokens: number }> {
  let inputTokens = 0;
  let outputTokens = 0;

  const enqueueText = (text: string) => {
    const payload =
      format === 'delta'
        ? { type: 'delta', text }
        : { type: 'text', content: text };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  if (model === 'gemini') {
    const genAI = getGemini();
    const geminiModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL_ID,
      systemInstruction: systemPrompt,
    });
    const result = await geminiModel.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) enqueueText(text);
    }
    const finalResponse = await result.response;
    inputTokens = finalResponse.usageMetadata?.promptTokenCount ?? 0;
    outputTokens = finalResponse.usageMetadata?.candidatesTokenCount ?? 0;
    if (format === 'standard') {
      controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
    }
  } else {
    // Claude streaming
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL_ID,
        max_tokens: maxTokens,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'message_start' && data.message?.usage) {
            inputTokens = data.message.usage.input_tokens ?? 0;
          } else if (
            data.type === 'content_block_delta' &&
            data.delta?.type === 'text_delta'
          ) {
            enqueueText(data.delta.text);
          } else if (data.type === 'message_delta' && data.usage) {
            outputTokens = data.usage.output_tokens ?? 0;
          } else if (data.type === 'message_stop') {
            if (format === 'standard') {
              controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            }
          }
        } catch {}
      }
    }
  }
  return { inputTokens, outputTokens };
}
