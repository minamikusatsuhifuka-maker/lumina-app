export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM employment_rules ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json(rows[0] || null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  // ファイルアップロードの場合
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const formTitle = formData.get('title') as string ?? '';

    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    let extractedText = '';

    // .txt / .md — 全文読み込み（制限なし）
    if (fileName.match(/\.(txt|md)$/)) {
      extractedText = await file.text();
    }
    // .pdf → Claude API直接渡し（全ページ）
    else if (fileName.endsWith('.pdf')) {
      const buffer = Buffer.from(await file.arrayBuffer());

      // まず pdf-parse を試みる
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        if (textResult.text && textResult.text.trim().length > 100) {
          extractedText = textResult.text;
        }
      } catch { /* フォールバック */ }

      // テキスト取れなかった場合 → Claude document API
      if (!extractedText) {
        const base64 = buffer.toString('base64');
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
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
                text: 'この就業規則PDFの全条文を第1条から最後まで完全に書き起こしてください。条文番号・見出しを含め、一切省略しないでください。',
              },
            ],
          }],
        });
        extractedText = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as any).text)
          .join('');
      }
    } else {
      return NextResponse.json({ error: '.txt / .md / .pdf ファイルのみ対応しています' }, { status: 400 });
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json({ error: 'テキストを抽出できませんでした' }, { status: 400 });
    }

    // DBに保存（全文・制限なし）
    const sql = neon(process.env.DATABASE_URL!);
    const existing = await sql`SELECT id FROM employment_rules LIMIT 1`;
    const saveTitle = formTitle || file.name;
    if (existing.length > 0) {
      await sql`UPDATE employment_rules
        SET title = ${saveTitle}, content = ${extractedText},
            file_name = ${file.name}, updated_at = NOW()
        WHERE id = ${existing[0].id}`;
    } else {
      await sql`INSERT INTO employment_rules (title, content, file_name)
        VALUES (${saveTitle}, ${extractedText}, ${file.name})`;
    }

    return NextResponse.json({
      success: true,
      charCount: extractedText.length,
      content: extractedText,
      title: saveTitle,
    });
  }

  // テキスト直接入力の場合（JSON）
  const { title, content } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: 'title と content は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const existing = await sql`SELECT id FROM employment_rules LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE employment_rules SET
      title = ${title}, content = ${content}, updated_at = NOW()
    WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id, charCount: content.length });
  }

  const rows = await sql`INSERT INTO employment_rules (title, content)
    VALUES (${title}, ${content}) RETURNING id`;
  return NextResponse.json({ success: true, id: rows[0].id, charCount: content.length });
}
