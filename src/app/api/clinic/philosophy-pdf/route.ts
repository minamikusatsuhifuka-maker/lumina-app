export const maxDuration = 300;

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'ファイルがありません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const fileName = file.name.toLowerCase();

    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      // まず pdf-parse を試みる
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        if (textResult.text && textResult.text.trim().length > 50) {
          extractedText = textResult.text;
        }
      } catch {
        // 失敗したら Claude API に直接渡す
      }

      // テキストが取れなかった場合 → Claude document API
      if (!extractedText) {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              } as any,
              {
                type: 'text',
                text: 'このPDFの全テキストを抽出してください。テキストのみ返してください。',
              },
            ],
          }],
        });
        extractedText = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as any).text)
          .join('');
      }
    } else if (fileName.match(/\.(jpg|jpeg|png)$/)) {
      // 画像 → Claude Vision OCR
      const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as any, data: base64 },
            },
            { type: 'text', text: 'この画像のテキストを全て書き起こしてください。テキストのみ返してください。' },
          ],
        }],
      });
      extractedText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');
    } else {
      return Response.json({ error: 'PDF・画像ファイルのみ対応しています' }, { status: 400 });
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return Response.json(
        { error: 'テキストを抽出できませんでした' },
        { status: 400 }
      );
    }

    return Response.json({ content: extractedText });

  } catch (e) {
    console.error('Philosophy PDF error:', e);
    return Response.json(
      { error: `読み込みエラー: ${String(e)}` },
      { status: 500 }
    );
  }
}
