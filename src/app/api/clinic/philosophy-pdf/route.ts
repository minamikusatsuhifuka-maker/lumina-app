import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PDFParse } from 'pdf-parse';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    return NextResponse.json({ content: textResult.text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'PDF解析に失敗しました';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
