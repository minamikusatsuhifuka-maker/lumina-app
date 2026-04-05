import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIModel = 'claude' | 'gemini';

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
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: '安定・高精度。複雑な分析・長文処理に強い',
    icon: '✨',
  },
];

function getGemini() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

// 通常生成（非ストリーミング）
export async function generateWithModel(
  model: AIModel,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4000
): Promise<string> {
  if (model === 'gemini') {
    const genAI = getGemini();
    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      ...(systemPrompt && { systemInstruction: systemPrompt }),
    });
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });
    return result.response.text();
  }

  // Claude (default)
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      ...(systemPrompt && { system: systemPrompt }),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// SSEストリーミング生成
export async function streamWithModel(
  model: AIModel,
  prompt: string,
  systemPrompt: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  maxTokens = 8000
) {
  if (model === 'gemini') {
    const genAI = getGemini();
    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      systemInstruction: systemPrompt,
    });
    const result = await geminiModel.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`));
      }
    }
    controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
  } else {
    // Claude streaming
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: data.delta.text })}\n\n`));
            } else if (data.type === 'message_stop') {
              controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            }
          } catch {}
        }
      }
    }
  }
}
