// Claude Vision を使ったOCR（Vercelサーバレス環境対応）

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const OCR_PROMPT = `この画像に写っているテキストを全て正確に書き起こしてください。
レイアウトは気にせず、読めるテキストを全て抽出してください。
テキスト以外の説明は不要です。テキストのみ返してください。`;

// 画像からテキスト抽出
export async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: ImageMediaType = 'image/jpeg'
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY未設定');

  const base64 = imageBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: OCR_PROMPT },
        ],
      }],
    }),
  });

  const data = await response.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// スキャンPDF からテキスト抽出（Claude PDFサポート）
export async function extractTextFromScannedPDF(pdfBuffer: Buffer): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY未設定');

  const base64 = pdfBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: `このPDF文書のテキストを全て正確に書き起こしてください。
全ページのテキストを、ページ順に漏れなく抽出してください。
テキスト以外の説明は不要です。テキストのみ返してください。` },
        ],
      }],
    }),
  });

  const data = await response.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}
