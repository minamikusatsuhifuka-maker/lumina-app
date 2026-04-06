import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PDFParse } from 'pdf-parse';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let extractedText = '';
  try {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    extractedText = textResult.text;
  } catch {
    return NextResponse.json({ error: 'PDF解析に失敗しました' }, { status: 500 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemContext = await buildSystemContext(
    'あなたは人材アセスメントの専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。',
    'hiring'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemContext,
      messages: [{
        role: 'user',
        content: `以下の適性試験結果を解析し、このJSONで返してください：
{
  "testType": "試験の種類・名称",
  "scores": [{"category": "カテゴリ名", "score": "点数・レベル", "description": "説明"}],
  "strengths": ["強み・得意な領域"],
  "weaknesses": ["弱み・課題の領域"],
  "suitableRoles": ["向いている役割・職種"],
  "developmentPoints": ["育成・研修で伸ばすべき点"],
  "clinicFitComment": "クリニック勤務への適性コメント（3〜5文）"
}

試験結果テキスト：
${extractedText}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const analysis = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json({ analysis, rawText: extractedText });
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
