export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });

    const fileName = file.name.toLowerCase();
    let extractedText = '';

    // テキスト系
    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = await file.text();

    // PDF
    } else if (fileName.endsWith('.pdf')) {
      try {
        const { PDFParse } = await import('pdf-parse');
        const buffer = Buffer.from(await file.arrayBuffer());
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        extractedText = textResult.text;
      } catch (e) {
        console.error('PDF parse error:', e);
        return NextResponse.json({ error: 'PDFの読み込みに失敗しました。テキスト形式でお試しください。' }, { status: 400 });
      }

    // Word
    } else if (fileName.endsWith('.docx')) {
      try {
        const mammoth = await import('mammoth');
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (e) {
        console.error('DOCX parse error:', e);
        return NextResponse.json({ error: '.docxの読み込みに失敗しました。テキスト形式でお試しください。' }, { status: 400 });
      }

    } else {
      return NextResponse.json({ error: '.txt / .md / .pdf / .docx のみ対応しています' }, { status: 400 });
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: 'ファイルからテキストを抽出できませんでした' }, { status: 400 });
    }

    // AIで章に分割
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
          content: `以下のハンドブックテキストを章・セクションごとに分割してください。
見出し（#・第〇章・数字+ドットなど）を章の区切りとして認識し、
以下のJSON形式のみで返してください：
{
  "title": "ハンドブックのタイトル（冒頭から推測）",
  "chapters": [
    {
      "orderIndex": 1,
      "title": "章タイトル",
      "content": "章の本文テキスト全文"
    }
  ]
}

テキスト：
${extractedText.slice(0, 15000)}`,
        }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `AI解析に失敗しました: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = clean.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : clean);

    return NextResponse.json({
      title: parsed.title,
      chapters: parsed.chapters,
      extractedLength: extractedText.length,
    });

  } catch (e) {
    console.error('Handbook import error:', e);
    return NextResponse.json({ error: `読み込みエラー: ${String(e)}` }, { status: 500 });
  }
}
