export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';
import { buildSystemContext } from '@/lib/clinic-context';
import { callAI } from '@/lib/call-ai';

const CONTEXT_PROMPTS: Record<string, string> = {
  philosophy: 'あなたはクリニックの理念・ビジョン策定の専門コンサルタントです。院長の想いを丁寧に引き出しながら、心に響く理念を一緒に作り上げてください。質問は一度に1〜2つまで。',
  grade: 'あなたはクリニックの人事制度設計の専門家です。等級制度・昇格条件・必要なスキルについて、院長の考えを丁寧に引き出してください。同心円モデル（G1自分→G5地域）の視点を活かすこと。',
  evaluation: 'あなたはクリニックの評価制度設計の専門家です。「何を評価するか」「どう測るか」について院長の価値観を引き出してください。「実」（実行・実績・実力・誠実）で評価する原則を重視。',
  'red-zone': 'あなたはクリニックの人事・コンプライアンスの専門家です。4ゾーン行動基準（🔴レッド・🟡イエロー・🟢グリーン・🩵ティール）に基づいてアドバイスしてください。リードマネジメントの視点を忘れずに。',
  strategy: 'あなたはクリニックの経営戦略アドバイザーです。院長の目指す姿を引き出しながら、実行可能な戦略を一緒に作ります。',
  handbook: 'あなたはクリニックのハンドブック編集の専門家です。どんな内容を伝えたいか、どんな文化を作りたいかを丁寧に引き出してください。',
  staff: 'あなたはクリニックの人材育成・組織開発の専門家です。スタッフの育成・採用・マネジメントについて、5大欲求とリードマネジメントの視点でアドバイスしてください。',
  hiring: 'あなたはクリニックの採用・人材育成の専門家です。「どんな人と一緒に働きたいか」を具体的に引き出してください。',
  mindset: 'あなたはクリニックのスタッフ育成・マインド開発の専門家です。「スタッフにどう成長してほしいか」を院長の言葉で引き出してください。',
  growth: 'あなたはクリニックの組織文化・成長哲学の専門家です。「このクリニックで働くことの意味」について院長の深い想いを引き出してください。',
  marketing: 'あなたはクリニックのマーケティング・ブランディング専門家です。「どんな患者さんに来てほしいか」「クリニックの強みは何か」を引き出します。',
  evaluation_framework: 'あなたはクリニックの評価フレームワーク設計の専門家です。マインド5段階（アチーブメント原則）と「実」の原則を軸にアドバイスしてください。',
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contextType = searchParams.get('contextType') || 'philosophy';
  const contextLabel = searchParams.get('contextLabel') || '';
  const existingSessionId = searchParams.get('sessionId');

  const sql = neon(process.env.DATABASE_URL!);

  if (existingSessionId) {
    const rows = await sql`SELECT * FROM ai_dialogue_sessions WHERE id = ${existingSessionId}`;
    if (rows[0]) return NextResponse.json({ session: rows[0], messages: JSON.parse(rows[0].messages) });
  }

  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '';

  const aiModel = searchParams.get('model') as 'claude' | 'gemini' || 'claude';
  const systemPrompt = await buildSystemContext(CONTEXT_PROMPTS[contextType] || CONTEXT_PROMPTS.philosophy, contextType);

  const firstQuestion = await callAI({
    model: aiModel,
    system: systemPrompt,
    messages: [{ role: 'user', content: `クリニックの理念：${philosophy}\nテーマ：${contextLabel}\n\nこの内容について対話を始めてください。最初の質問を1つだけ投げかけてください。温かく・答えやすい質問にしてください。` }],
    maxTokens: 500,
  });
  const initialMessages = [{ role: 'assistant', content: firstQuestion, timestamp: new Date().toISOString() }];

  const id = uuidv4();
  await sql`INSERT INTO ai_dialogue_sessions (id, context_type, context_label, messages) VALUES (${id}, ${contextType}, ${contextLabel}, ${JSON.stringify(initialMessages)})`;

  return NextResponse.json({ session: { id }, messages: initialMessages });
}

export async function POST(req: NextRequest) {
  const authSession = await auth();
  if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, userMessage, model: reqModel } = await req.json();
  const aiModel = (reqModel || 'claude') as 'claude' | 'gemini';
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM ai_dialogue_sessions WHERE id = ${sessionId}`;
  if (!rows[0]) return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });

  const dialogueSession = rows[0];
  const messages = JSON.parse(dialogueSession.messages);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '';

  messages.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

  const turnCount = messages.filter((m: any) => m.role === 'user').length;
  const isSummaryTime = turnCount >= 5;
  const systemPrompt = await buildSystemContext(
    (CONTEXT_PROMPTS[dialogueSession.context_type] || CONTEXT_PROMPTS.philosophy) +
    (isSummaryTime ? '\n\n【重要】十分な対話ができました。これまでの対話で引き出せた重要な想いを整理し、「これをもとに作成しましょうか？」と提案してください。' : ''),
    dialogueSession.context_type
  );

  const apiMessages = [
    { role: 'user' as const, content: `クリニックの理念：${philosophy}\n\n以下の対話を続けてください。` },
    { role: 'assistant' as const, content: 'はい、続けましょう。' },
    ...messages.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const aiResponse = await callAI({
    model: aiModel,
    system: systemPrompt,
    messages: apiMessages,
    maxTokens: 800,
  });
  messages.push({ role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() });

  // 5往復後に洞察抽出
  let insights = null;
  if (isSummaryTime && !dialogueSession.extracted_insights) {
    try {
      const insightText = await callAI({
        model: aiModel,
        system: '必ずJSON形式のみで返してください。',
        messages: [{ role: 'user', content: `以下の対話から重要な判断基準・価値観を抽出してください：\n{"insights":["洞察"],"criteria":[{"criterion":"判断基準","priority":8}],"summary":"要約"}\n\n${messages.map((m: any) => `${m.role === 'user' ? '院長' : 'AI'}: ${m.content}`).join('\n\n')}` }],
        maxTokens: 1000,
      });
      const clean = insightText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      insights = JSON.parse(clean.match(/(\{[\s\S]*\})/)?.[1] || clean);

      for (const c of insights.criteria || []) {
        await sql`INSERT INTO clinic_decision_criteria (id, category, criterion, source_session_id, priority) VALUES (${uuidv4()}, ${dialogueSession.context_type}, ${c.criterion}, ${sessionId}, ${c.priority || 5})`;
      }
    } catch (e) { console.error('Insight extraction failed:', e); }
  }

  await sql`UPDATE ai_dialogue_sessions SET messages = ${JSON.stringify(messages)}, extracted_insights = ${insights ? JSON.stringify(insights) : dialogueSession.extracted_insights}, updated_at = NOW() WHERE id = ${sessionId}`;

  return NextResponse.json({ message: aiResponse, messages, insights, isSummaryTime, turnCount });
}
