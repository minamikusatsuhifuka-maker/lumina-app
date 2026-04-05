export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

async function extractText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return await file.text();
  }

  if (fileName.endsWith('.pdf')) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      if (textResult.text && textResult.text.trim().length > 10) return textResult.text;
      throw new Error('テキストが空です');
    } catch {
      try {
        const officeparser = await import('officeparser');
        const text = await officeparser.parseOffice(buffer, { outputErrorToConsole: true });
        return String(text);
      } catch (e2) {
        throw new Error(`PDF読み込み失敗: ${String(e2)}`);
      }
    }
  }

  if (fileName.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileName.endsWith('.pptx')) {
    const officeparser = await import('officeparser');
    const text = await officeparser.parseOffice(buffer, { outputErrorToConsole: true });
    return String(text);
  }

  throw new Error('.txt / .md / .pdf / .docx / .pptx のみ対応しています');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });

    let extractedText = '';
    try {
      extractedText = await extractText(file);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 400 });
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json({ error: 'テキストを抽出できませんでした。スキャンPDFの場合はテキスト形式でお試しください。' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: '必ずJSON形式のみで返してください。前置きや説明は不要です。',
        messages: [{
          role: 'user',
          content: `以下のハンドブック・資料テキストを章・セクションごとに分割してください。
見出し（#・第〇章・数字+ドット・スライドタイトルなど）を章の区切りとして認識してください。
以下のJSON形式のみで返してください：
{
  "title": "タイトル（冒頭から推測）",
  "chapters": [
    { "orderIndex": 1, "title": "章タイトル", "content": "本文テキスト全文" }
  ]
}

テキスト：
${extractedText.slice(0, 15000)}`,
        }],
      }),
    });

    if (!response.ok) return NextResponse.json({ error: `AI解析に失敗しました: ${response.status}` }, { status: 500 });

    const data = await response.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = clean.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : clean);

    return NextResponse.json({ title: parsed.title, chapters: parsed.chapters, extractedLength: extractedText.length });
  } catch (e) {
    console.error('Handbook import error:', e);
    return NextResponse.json({ error: `読み込みエラー: ${String(e)}` }, { status: 500 });
  }
}
