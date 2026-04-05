import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });

  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let extractedText = '';

  try {
    if (fileName.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      extractedText = textResult.text;
    } else if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = Buffer.from(await file.arrayBuffer()).toString('utf-8');
    } else {
      return NextResponse.json({ error: '対応していないファイル形式です（.txt, .md, .pdf, .docx のみ）' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'ファイルの解析に失敗しました' }, { status: 500 });
  }

  if (!extractedText.trim()) {
    return NextResponse.json({ error: 'ファイルからテキストを抽出できませんでした' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: 'あなたはドキュメント構造解析の専門家です。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `以下のテキストをハンドブックの章に分割してください。
見出し（#、第○章、1. 2. などの番号付きセクション）を基準に分割してください。
以下のJSON形式で返してください：

{
  "title": "ハンドブック全体のタイトル",
  "chapters": [
    {
      "orderIndex": 0,
      "title": "章タイトル",
      "content": "章の本文内容"
    }
  ]
}

テキスト：
${extractedText}`,
      }],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `AI解析に失敗しました: ${response.status}` }, { status: 500 });
  }

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
