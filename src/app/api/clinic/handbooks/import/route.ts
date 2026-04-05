export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

async function extractTextWithClaude(buffer: Buffer, fileName: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const base64 = buffer.toString('base64');
  const ext = fileName.toLowerCase().split('.').pop();

  // PDF → Claude document API
  if (ext === 'pdf') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'このPDFの全テキストを抽出してください。章・見出しの構造を維持し、全ページのテキストを書き起こしてください。テキストのみ返してく���さい。' },
        ] }],
      }),
    });
    const data = await response.json();
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }

  // 画像 → Claude Vision
  const imageTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  if (ext && imageTypes[ext]) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 4000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: imageTypes[ext], data: base64 } },
          { type: 'text', text: 'この画像のテキストを全て書き起こしてください。テキストのみ返してください。' },
        ] }],
      }),
    });
    const data = await response.json();
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }

  // DOCX → mammoth
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // PPTX → adm-zip でXML解析
  if (ext === 'pptx') {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const texts: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
        const xml = entry.getData().toString('utf8');
        const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? [];
        const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(t => t.trim()).join(' ');
        if (slideText.trim()) texts.push(slideText);
      }
    }
    return texts.join('\n\n');
  }

  throw new Error(`非対応のファイル形式: .${ext}`);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });

    const ext = file.name.toLowerCase().split('.').pop();
    let extractedText = '';

    if (ext === 'txt' || ext === 'md') {
      extractedText = await file.text();
    } else {
      extractedText = await extractTextWithClaude(Buffer.from(await file.arrayBuffer()), file.name);
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json({ error: 'テキストを抽出できませんでした' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 8000,
        system: '必ずJSON形式のみで返してください。',
        messages: [{ role: 'user', content: `以下のテキストを章・セクションごとに分割してください。
見出しを章の区切りとして認識し、以下のJSON形式のみで返してください：
{
  "title": "タイトル",
  "chapters": [
    { "orderIndex": 1, "title": "章タイトル", "content": "本文" }
  ]
}

テキスト：
${extractedText.slice(0, 15000)}` }],
      }),
    });

    const data = await response.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = clean.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : clean);

    return NextResponse.json({ title: parsed.title, chapters: parsed.chapters, extractedLength: extractedText.length });
  } catch (e) {
    console.error('Import error:', e);
    return NextResponse.json({ error: `読み込みエラー: ${String(e)}` }, { status: 500 });
  }
}
