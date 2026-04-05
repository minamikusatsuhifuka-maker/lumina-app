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

// ルールベースで章分割（JSONパースエラー回避）
function splitIntoChapters(extractedText: string): { title: string; chapters: { orderIndex: number; title: string; content: string }[] } {
  const lines = extractedText.split('\n');
  const headingPattern = /^(#{1,3}\s+.+|第\d+章.+|\d+[\.．]\s*.+|【.+】|■.+|▼.+|◆.+)/;
  const chapters: { orderIndex: number; title: string; content: string }[] = [];
  let currentTitle = '';
  let currentContent: string[] = [];
  let orderIndex = 1;

  // タイトル推定
  let docTitle = '';
  for (const line of lines.slice(0, 10)) {
    if (line.trim().length > 3) { docTitle = line.trim(); break; }
  }

  for (const line of lines) {
    if (headingPattern.test(line.trim()) && line.trim().length > 2) {
      if (currentTitle && currentContent.join('\n').trim()) {
        chapters.push({ orderIndex: orderIndex++, title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = line.trim().replace(/^#{1,3}\s+/, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.join('\n').trim()) {
    chapters.push({ orderIndex: orderIndex++, title: currentTitle || 'その他', content: currentContent.join('\n').trim() });
  }

  // 章が1つ以下 → 均等5分割
  if (chapters.length <= 1) {
    const chunkSize = Math.ceil(lines.length / 5);
    const newChapters = [];
    for (let i = 0; i < 5; i++) {
      const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n').trim();
      if (chunk) newChapters.push({ orderIndex: i + 1, title: i === 0 ? (docTitle || 'はじめに') : `セクション ${i + 1}`, content: chunk });
    }
    return { title: docTitle || 'ハンドブック', chapters: newChapters };
  }

  return { title: docTitle || 'ハンドブック', chapters };
}

// AIでタイトルだけ生成
async function getAiTitle(extractedText: string): Promise<string> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 100,
        messages: [{ role: 'user', content: `以下のテキストの最初の部分からドキュメントのタイトルを1行で答えてください。タイトル���み返してください：\n\n${extractedText.slice(0, 500)}` }],
      }),
    });
    const data = await res.json();
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  } catch { return ''; }
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

    // ルールベースで章分割（JSONパースエラー回避）
    const result = splitIntoChapters(extractedText);

    // AIでタイトル補完
    const aiTitle = await getAiTitle(extractedText);
    if (aiTitle) result.title = aiTitle;

    return NextResponse.json({ title: result.title, chapters: result.chapters, extractedLength: extractedText.length });
  } catch (e) {
    console.error('Import error:', e);
    return NextResponse.json({ error: `読み込みエラー: ${String(e)}` }, { status: 500 });
  }
}
