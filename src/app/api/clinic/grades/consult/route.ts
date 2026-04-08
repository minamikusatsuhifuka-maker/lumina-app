import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { message, gradeContent } = await req.json();
  if (!message) return new Response(JSON.stringify({ error: 'message は必須です' }), { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const systemPrompt = await buildSystemContext(`あなたはクリニックの人事制度設計の専門家です。
クリニックの理念：${philosophy}
${gradeContent ? `現在設計中の等級：${typeof gradeContent === 'string' ? gradeContent : JSON.stringify(gradeContent)}` : ''}

理念に沿った等級制度設計についてアドバイスしてください。具体的で実践的な提案をしてください。`, 'grade');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
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
