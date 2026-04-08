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
  const { model, system, messages, maxTokens = 1000 } = options;

  if (model === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // systemプロンプトをuserメッセージの先頭に追加
    if (system && geminiMessages.length > 0) {
      geminiMessages[0].parts[0].text = `${system}\n\n${geminiMessages[0].parts[0].text}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-03-25:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        system: system || '',
        messages,
      }),
    });

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
}
