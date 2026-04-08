// Claude Vision OCR ユーティリティ

export async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } },
          { type: 'text', text: 'この画像のテキストを全て書き起こしてください。テキストのみ返してください。' },
        ],
      }],
    }),
  });
  const data = await response.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}
