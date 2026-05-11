import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PIPELINES, type PipelineStep, type StepResult } from '@/lib/pipelines';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ExecuteRequest {
  jobId: number;
}

// SSEストリームからテキストを収集
// deepresearch: { type: 'text', content: ... } / { type: 'done' }
// 他: { type: 'delta', text: ... } / { type: 'done' }
const collectSseText = async (res: Response): Promise<string> => {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'delta' && typeof event.text === 'string') {
            fullText += event.text;
          } else if (event.type === 'text' && typeof event.content === 'string') {
            fullText += event.content;
          }
        } catch {
          /* skip */
        }
      }
    }
  }
  return fullText;
};

const executeStep = async (
  step: PipelineStep,
  input: Record<string, unknown>,
  origin: string,
  cookieHeader: string,
): Promise<string> => {
  const res = await fetch(`${origin}${step.apiEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* skip */
    }
    throw new Error(
      `API ${step.apiEndpoint} エラー (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    return await collectSseText(res);
  }

  const data = (await res.json()) as Record<string, unknown>;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.result === 'string') return data.result;
  if (data.saved && Array.isArray(data.saved)) {
    return `${data.count ?? data.saved.length}件保存しました: ${JSON.stringify(data.saved).slice(0, 200)}`;
  }
  return JSON.stringify(data);
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: ExecuteRequest;
  try {
    body = (await req.json()) as ExecuteRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { jobId } = body;
  if (!jobId) {
    return new Response('jobIdが必要です', { status: 400 });
  }

  const jobRows = await sql`
    SELECT * FROM pipeline_jobs
    WHERE id = ${jobId} AND user_id = ${userId}
  `;
  const job = jobRows[0] as
    | {
        id: number;
        intent: string;
        pipeline_type: string;
      }
    | undefined;

  if (!job) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'ジョブが見つかりません' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const pipeline = PIPELINES.find((p) => p.id === job.pipeline_type);
  if (!pipeline) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'パイプラインが見つかりません' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  // クッキーをサブAPIに転送するため取得
  const cookieHeader = req.headers.get('cookie') ?? '';
  const origin = new URL(req.url).origin;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        await sql`
          UPDATE pipeline_jobs
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE id = ${jobId}
        `;
        send({ type: 'started', jobId });

        const results: Record<string, StepResult> = {};
        const steps = pipeline.steps;
        let completedCount = 0;

        for (const step of steps) {
          // 依存ステップが完了しているか確認
          if (step.dependsOn) {
            const incomplete = step.dependsOn.filter(
              (depId) => !results[depId] || results[depId].status !== 'completed',
            );
            if (incomplete.length > 0) {
              send({
                type: 'step_skip',
                stepId: step.id,
                label: step.label,
                reason: `依存ステップ未完了: ${incomplete.join(', ')}`,
              });
              continue;
            }
          }

          send({ type: 'step_start', stepId: step.id, label: step.label });

          try {
            const input = step.inputMapper(job.intent, results);
            const result = await executeStep(step, input, origin, cookieHeader);
            results[step.id] = { result, status: 'completed' };
            completedCount++;
            const progress = Math.round((completedCount / steps.length) * 100);

            await sql`
              UPDATE pipeline_jobs SET
                results = ${JSON.stringify(results)}::jsonb,
                progress = ${progress},
                updated_at = NOW()
              WHERE id = ${jobId}
            `;

            send({
              type: 'step_complete',
              stepId: step.id,
              label: step.label,
              progress,
              preview:
                typeof result === 'string'
                  ? result.slice(0, 200)
                  : JSON.stringify(result).slice(0, 200),
            });
          } catch (stepErr) {
            const errMsg =
              stepErr instanceof Error ? stepErr.message : String(stepErr);
            results[step.id] = { result: errMsg, status: 'failed' };
            send({
              type: 'step_error',
              stepId: step.id,
              label: step.label,
              message: errMsg,
            });
          }
        }

        await sql`
          UPDATE pipeline_jobs SET
            status = 'completed',
            results = ${JSON.stringify(results)}::jsonb,
            progress = 100,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${jobId}
        `;

        send({ type: 'completed', jobId, results });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await sql`
            UPDATE pipeline_jobs SET
              status = 'failed',
              error_message = ${message},
              updated_at = NOW()
            WHERE id = ${jobId}
          `;
        } catch {
          /* skip */
        }
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
