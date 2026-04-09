import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 300;

// 前回の収集結果を取得
async function getPreviousResult(userId: string, topic: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const prev = await sql`
    SELECT content FROM library
    WHERE user_id = ${userId}
      AND group_name = 'アラート'
      AND title LIKE ${`%${topic}%`}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return prev[0]?.content ?? null;
}

// 差分分析
async function analyzeDiff(previous: string, current: string, keyword: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `あなたは情報分析の専門家です。
前回と今回の収集結果を比較して、変化点を分析してください。
JSON形式のみで返答。マークダウン不要。

{
  "newInfo": ["新しく出てきた情報1", "新しく出てきた情報2"],
  "changedInfo": ["変化した情報1"],
  "summary": "変化の総括（100字以内）"
}`,
      messages: [{
        role: 'user',
        content: `キーワード：${keyword}\n\n前回の結果：\n${previous?.slice(0, 800) ?? 'なし'}\n\n今回の結果：\n${current.slice(0, 800)}`,
      }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const userId = (session.user as any).id;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `あなたは優秀なリサーチアナリストです。指定されたトピックの最新情報を収集し、
要点を箇条書きでまとめてください。引用元URLも明記してください。`,
      messages: [{
        role: 'user',
        content: `「${topic}」について最新情報を詳しく収集してください。\n以下の構成でまとめてください：\n## 概要\n## 主要トピック（8〜12点）\n## 注目ポイント\n## まとめ\n各項目に日付・出典URLを必ず明記してください。`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

  // 前回結果との差分分析（ノンブロッキングではなく結果に含める）
  let diffAnalysis = null;
  try {
    const previous = await getPreviousResult(userId, topic);
    if (previous) {
      diffAnalysis = await analyzeDiff(previous, result, topic);
    }
  } catch {}

  return NextResponse.json({ result, topic, date: new Date().toLocaleDateString('ja-JP'), diffAnalysis });
}
