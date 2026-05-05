// Claude API などの SSE ストリームをパースして本文テキストを抽出する共通関数

export async function parseSSEStream(
  response: Response,
  onChunk: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('レスポンスボディがありません');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);

        // Claude公式SSE形式
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          const chunk = parsed.delta.text ?? '';
          if (chunk) {
            fullText += chunk;
            onChunk(fullText);
          }
          continue;
        }

        // 自前ラッパーSSE形式（{ type: 'delta', text } / { type: 'text', content }）
        if (parsed.type === 'delta' && typeof parsed.text === 'string') {
          fullText += parsed.text;
          onChunk(fullText);
          continue;
        }
        if (parsed.type === 'text' && typeof parsed.content === 'string') {
          fullText += parsed.content;
          onChunk(fullText);
          continue;
        }
      } catch {
        // JSON以外の行はスキップ
      }
    }
  }

  return fullText;
}
