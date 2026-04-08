import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  await params;
  const { instruction, chapterContent } = await req.json();
  if (!chapterContent) return new Response('chapterContent は必須です', { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const encoder = new TextEncoder();

  const systemPrompt = await buildSystemContext(
    `あなたはクリニックのハンドブック編集専門家です。
指示に従い、章の内容を改善してください。改善後の完全なテキストのみを返してください。`,
    'handbook'
  );

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'interleaved-thinking-2025-05-14',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 4000,
            stream: true,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: `以下の章の内容を改善してください。

【現在の内容】
${chapterContent}

【改善指示】
${instruction || '全体的に読みやすく、わかりやすく改善してください。'}

改善後の完全なテキストのみを返してください。`,
            }],
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
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', content: data.delta.text })}\n\n`
                  ));
                } else if (data.type === 'message_stop') {
                  controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
                }
              } catch {
                // パースエラーは無視
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'ストリームエラー';
        controller.enqueue(encoder.encode(
          `data: {"type":"error","message":"${msg}"}\n\n`
        ));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
