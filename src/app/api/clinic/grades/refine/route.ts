import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

const CATEGORY_LABELS: Record<string, string> = {
  skills: 'スキル要件', knowledge: '知識要件', mindset: 'マインド要件',
  continuousLearning: '継続学習', requiredCertifications: '必須資格',
  promotionExam: '昇格試験', requirementsDemotion: '降格条件', all: '全体',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeId, instruction, currentContent, category } = await req.json();
  if (!instruction || !currentContent) return NextResponse.json({ error: 'instruction と currentContent は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '';
  const categoryLabel = CATEGORY_LABELS[category || 'all'] || '全体';

  const systemPrompt = await buildSystemContext(`あなたはクリニック経営・人事制度の専門家です。クリニックの理念：${philosophy}\n必ずJSON形式のみで返してください。`, 'grade');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `現在の等級情報：
${typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent, null, 2)}

修正対象：${categoryLabel}
修正指示：${instruction}

修正後の等級情報全体をJSON形式で返してください。変更理由も添えてください：
{ ...(全フィールド), "changeLog": "変更した内容と理由" }`,
      }],
    }),
  });

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
