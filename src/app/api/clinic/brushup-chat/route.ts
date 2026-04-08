import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

const CONTEXT_PROMPTS: Record<string, string> = {
  'AI判断基準': 'AIの判断基準・価値観の専門家として、クリニックのAI判断基準をより深く・具体的・一貫性のあるものに改善してください。',
  '理念': 'クリニック理念の言語化専門家として、院長の想いがスタッフと患者に伝わる、心に響く理念文章に改善してください。',
  '行動基準': 'クリニックの行動基準・レッドゾーン設計の専門家として、スタッフが迷わず判断できる明確な基準に改善してください。',
  '就業規則': '医療クリニックの就業規則専門家として、スタッフが安心して働ける、温かみのある就業規則に改善してください。',
  '等級制度': 'スタッフ成長支援の専門家として、スタッフが自分の成長を実感できる等級制度に改善してください。',
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contextLabel = searchParams.get('contextLabel') || '';
  const sql = neon(process.env.DATABASE_URL!);

  // 対話セッション取得
  const sessions = await sql`
    SELECT * FROM ai_dialogue_sessions
    WHERE context_label = ${contextLabel}
    ORDER BY updated_at DESC LIMIT 1
  `;

  // 改善履歴取得（テーブルが存在しない場合は自動作成）
  await sql`
    CREATE TABLE IF NOT EXISTS brushup_histories (
      id TEXT PRIMARY KEY,
      context_label TEXT NOT NULL,
      before_text TEXT,
      after_text TEXT,
      instruction TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  const histories = await sql`
    SELECT * FROM brushup_histories
    WHERE context_label = ${contextLabel}
    ORDER BY created_at DESC LIMIT 10
  `;

  return NextResponse.json({
    session: sessions[0] || null,
    messages: sessions[0] ? JSON.parse(sessions[0].messages || '[]') : [],
    histories,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { chatMode, contextLabel, contextContent, messages, sessionId,
          saveHistory, beforeText, afterText, instruction } = body;
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const sql = neon(process.env.DATABASE_URL!);

  // 改善履歴の保存
  if (saveHistory && beforeText && afterText) {
    await sql`
      CREATE TABLE IF NOT EXISTS brushup_histories (
        id TEXT PRIMARY KEY,
        context_label TEXT NOT NULL,
        before_text TEXT,
        after_text TEXT,
        instruction TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO brushup_histories (id, context_label, before_text, after_text, instruction)
      VALUES (${uuidv4()}, ${contextLabel}, ${beforeText}, ${afterText}, ${instruction || ''})
    `;
    return NextResponse.json({ success: true });
  }

  const basePrompt = CONTEXT_PROMPTS[contextLabel] || `${contextLabel}の専門家として改善をサポートしてください。`;

  let modePrompt = '';
  if (chatMode === 'propose') {
    modePrompt = `院長が「こうしたい」と話しかけてきます。
具体的な改善案を提示する際は必ず以下の形式で返してください：

【案①】タイトル
BEFORE:
（現在の文章または問題のある部分）
AFTER:
（改善後の文章）

【案②】タイトル
BEFORE:
（現在の文章）
AFTER:
（改善後の文章）

「どれが近いですか？」と問いかけてください。`;
  } else if (chatMode === 'analyze') {
    modePrompt = `以下の観点で分析し、★5段階評価と具体的改善提案を返してください：
1. 📖 わかりやすさ
2. 💡 具体性・行動につながるか
3. ❤️ 温かみ・スタッフへの敬意
4. 🔄 一貫性・矛盾がないか
5. ✅ 完全性・抜けがないか

改善提案は必ずBEFORE/AFTER形式で提示してください：
BEFORE:
（問題のある部分）
AFTER:
（改善案）`;
  } else {
    modePrompt = `院長と自由に対話してください。
具体的な改善文章を提示する際は必ず以下の形式で返してください：

BEFORE:
（現在の文章）
AFTER:
（改善後の文章）`;
  }

  const systemPrompt = await buildSystemContext(
    `${basePrompt}\n\n${modePrompt}\n\n【現在の${contextLabel}の内容】\n${contextContent || '（まだ内容がありません）'}`,
    'handbook'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages || [{ role: 'user', content: `この${contextLabel}を分析してください。` }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  // 対話セッション保存
  const newMessages = [...(messages || []), { role: 'assistant', content: result }];
  if (sessionId) {
    await sql`
      UPDATE ai_dialogue_sessions SET messages = ${JSON.stringify(newMessages)}, updated_at = NOW()
      WHERE id = ${sessionId}
    `;
  } else {
    const newId = uuidv4();
    await sql`
      INSERT INTO ai_dialogue_sessions (id, context_type, context_label, messages)
      VALUES (${newId}, ${'brushup'}, ${contextLabel}, ${JSON.stringify(newMessages)})
    `.catch(() => {});
    return NextResponse.json({ result, sessionId: newId });
  }

  return NextResponse.json({ result, sessionId });
}
