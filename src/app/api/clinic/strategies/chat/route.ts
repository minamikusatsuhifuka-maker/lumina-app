import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { message, strategyId } = await req.json();
  if (!message) return new Response(JSON.stringify({ error: 'message は必須です' }), { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  let strategyContext = '';
  if (strategyId) {
    const stratRows = await sql`SELECT * FROM strategies WHERE id = ${strategyId}`;
    if (stratRows[0]) {
      const s = stratRows[0];
      strategyContext = `\n現在の戦略情報：
タイトル: ${s.title}
カテゴリ: ${s.category || '未設定'}
目標: ${s.goal || '未設定'}
背景: ${s.background || '未設定'}
説明: ${s.description || '未設定'}
状態: ${s.status || '未設定'}
優先度: ${s.priority || '未設定'}`;
    }
  }

  const systemPrompt = await buildSystemContext(`あなたはクリニック経営の戦略アドバイザーです。
クリニックの理念：${philosophy}${strategyContext}

理念に基づいた経営戦略について、具体的で実践的なアドバイスをしてください。`, 'strategy');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 3000,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }],
          }),
        });

        if (!response.ok) {
          controller.enqueue(encoder.encode(`data: {"type":"error","message":"APIエラー: ${response.status}"}\n\n`));
          controller.close();
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: data.delta.text })}\n\n`));
                } else if (data.type === 'message_stop') {
                  controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
                }
              } catch {}
            }
          }
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${e.message}"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
