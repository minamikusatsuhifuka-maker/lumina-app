import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 180;

// 複数ファイル（PDF/Word/テキスト）の一括アップロード→Claude抽出+セクション分け
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  const singleFile = formData.get('file') as File | null;
  const allFiles = files.length > 0 ? files : singleFile ? [singleFile] : [];

  if (allFiles.length === 0) {
    return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const SUPPORTED_DOC_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];

  const results: Array<{
    fileName: string;
    extractedText: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const file of allFiles) {
    const mimeType = file.type;
    const isDoc = SUPPORTED_DOC_MIMES.includes(mimeType) || /\.(pdf|docx?|doc)$/i.test(file.name);
    const isText = mimeType === 'text/plain' || /\.(txt|md)$/i.test(file.name);

    if (!isDoc && !isText) {
      results.push({
        fileName: file.name,
        extractedText: '',
        success: false,
        error: 'PDF / Word(.docx) / テキストファイルのみ対応',
      });
      continue;
    }

    try {
      const bytes = await file.arrayBuffer();

      // テキスト系はそのまま
      if (isText) {
        const text = new TextDecoder('utf-8').decode(bytes);
        results.push({ fileName: file.name, extractedText: text, success: true });
        continue;
      }

      // PDF/Word は Claude で抽出
      const base64 = Buffer.from(bytes).toString('base64');
      const mediaType = mimeType === 'application/pdf'
        ? 'application/pdf'
        : mimeType === 'application/msword'
          ? 'application/msword'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: mediaType as any, data: base64 },
            },
            {
              type: 'text',
              text: `このファイル「${file.name}」の内容を全てテキストとして抽出してください。
見出し・本文・リストなどの構造を維持してください。
抽出したテキストのみを出力してください（説明文不要）。`,
            },
          ],
        }],
      });

      const block = response.content[0] as any;
      const extractedText = block?.type === 'text' ? block.text : '';
      results.push({ fileName: file.name, extractedText, success: true });
    } catch (err: any) {
      console.error('[clinic-profile/upload] 抽出失敗:', file.name, err);
      results.push({
        fileName: file.name,
        extractedText: '',
        success: false,
        error: err?.message || String(err),
      });
    }
  }

  // 結合
  const combinedText = results
    .filter(r => r.success)
    .map(r => `## ファイル: ${r.fileName}\n\n${r.extractedText}`)
    .join('\n\n---\n\n');

  // AIでセクション分け
  let sections: any[] = [];
  if (combinedText.trim()) {
    try {
      const sectionResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `以下の複数ファイルから抽出したテキストを、意味のあるセクションに整理してください。
ファイルをまたいで関連する内容はまとめてください。

カテゴリ: 理念・ビジョン、人材育成、マーケティング、診療方針、教え・学び、患者対応、その他

【テキスト】
${combinedText.slice(0, 6000)}

JSON形式のみで回答（前後の説明・コードブロック不要）:
{
  "sections": [
    {
      "title": "セクションタイトル",
      "category": "カテゴリ",
      "content": "このセクションの内容",
      "sourceFiles": ["ファイル名1"]
    }
  ]
}`,
        }],
      });
      const block = sectionResponse.content[0] as any;
      const text = block?.type === 'text' ? block.text : '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        sections = Array.isArray(parsed.sections) ? parsed.sections : [];
      }
    } catch (e) {
      console.error('[clinic-profile/upload] セクション分け失敗:', e);
    }
  }

  return NextResponse.json({
    extractedText: combinedText,
    sections,
    fileResults: results,
    totalFiles: allFiles.length,
    successCount: results.filter(r => r.success).length,
    failedCount: results.filter(r => !r.success).length,
    fileName: allFiles.length === 1 ? allFiles[0].name : `${allFiles.length}件のファイル`,
  });
}
