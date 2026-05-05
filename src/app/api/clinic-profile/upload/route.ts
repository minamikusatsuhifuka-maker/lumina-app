import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 90;

// PDF/Wordファイルからテキスト抽出＋AIによるセクション分け
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const mimeType = file.type;

  const client = new Anthropic({ apiKey });
  let extractedText = '';

  try {
    if (mimeType === 'application/pdf') {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: `このPDFの内容を全てテキストとして抽出してください。
フォーマットを保持しながら、見出し・本文・リストなどの構造を維持してください。
抽出したテキストのみを出力してください（説明文不要）。`,
            },
          ],
        }],
      });
      const block = response.content[0] as any;
      extractedText = block?.type === 'text' ? block.text : '';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      file.name?.match(/\.(docx?|doc)$/i)
    ) {
      const mediaType = mimeType === 'application/msword'
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
              text: `このWordファイルの内容を全てテキストとして抽出してください。
構造（見出し・段落・リスト）を維持して出力してください。
抽出したテキストのみを出力してください（説明文不要）。`,
            },
          ],
        }],
      });
      const block = response.content[0] as any;
      extractedText = block?.type === 'text' ? block.text : '';
    } else if (mimeType === 'text/plain' || file.name?.match(/\.(txt|md)$/i)) {
      // プレーンテキストはそのまま
      extractedText = new TextDecoder('utf-8').decode(bytes);
    } else {
      return NextResponse.json(
        { error: 'PDF / Word(.docx) / テキストファイルのみ対応しています' },
        { status: 400 }
      );
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: 'テキスト抽出に失敗しました' }, { status: 500 });
    }

    // AIでセクション分け
    let sections: any[] = [];
    try {
      const sectionResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `以下のテキストを意味のあるセクションに分けてください。
各セクションにタイトルとカテゴリを付けてください。

カテゴリ例: 理念・ビジョン、人材育成、マーケティング、診療方針、教え・学び、患者対応、その他

【テキスト】
${extractedText.slice(0, 5000)}

JSON形式のみで回答（前後の説明・コードブロック不要）:
{
  "sections": [
    {
      "title": "セクションタイトル",
      "category": "カテゴリ",
      "content": "このセクションの内容"
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

    return NextResponse.json({
      extractedText,
      sections,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (err: any) {
    console.error('[clinic-profile/upload] エラー:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
