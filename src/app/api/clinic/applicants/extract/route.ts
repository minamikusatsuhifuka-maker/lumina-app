import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });

    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは3MB以下にしてください' }, { status: 400 });
    }

    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'PDF・JPG・PNG・WEBPのみ対応しています' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const isPdf = file.type === 'application/pdf';

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: '履歴書・職務経歴書・適性検査の内容をテキストで書き出してください。氏名・年齢・経歴・志望動機・資格・検査結果を含めてください。',
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    const extractedText = data.content?.[0]?.text || '';

    if (!extractedText) {
      return NextResponse.json({ error: 'テキストを抽出できませんでした' }, { status: 500 });
    }

    return NextResponse.json({ text: extractedText });

  } catch (e: any) {
    console.error('extract error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
