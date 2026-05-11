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
          } else if (
            event.type === 'text' &&
            typeof event.content === 'string'
          ) {
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
  if (typeof data.html === 'string') return data.html;
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
    | { id: number; intent: string; pipeline_type: string }
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

  // クッキー・origin を取得してサブAPIに転送
  const cookieHeader = req.headers.get('cookie') ?? '';
  const origin = new URL(req.url).origin;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* closed */
        }
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
        const completed = new Set<string>();
        const running = new Set<string>();
        const failed = new Set<string>();

        // 実行可能なステップを取得（依存がすべて完了済みのもの）
        const getReadySteps = (): PipelineStep[] =>
          steps.filter((step) => {
            if (
              completed.has(step.id) ||
              running.has(step.id) ||
              failed.has(step.id)
            ) {
              return false;
            }
            if (!step.dependsOn || step.dependsOn.length === 0) return true;
            return step.dependsOn.every((dep) => completed.has(dep));
          });

        // 1ステップを実行する非同期関数（必ず resolve、内部で例外を捕捉）
        const runStep = async (step: PipelineStep): Promise<void> => {
          running.add(step.id);
          send({ type: 'step_start', stepId: step.id, label: step.label });

          try {
            const input = step.inputMapper(job.intent, results);
            const result = await executeStep(
              step,
              input,
              origin,
              cookieHeader,
            );
            results[step.id] = { result, status: 'completed' };
            completed.add(step.id);
            running.delete(step.id);

            const progress = Math.round(
              (completed.size / steps.length) * 100,
            );

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
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            results[step.id] = { result: errMsg, status: 'failed' };
            failed.add(step.id);
            running.delete(step.id);
            send({
              type: 'step_error',
              stepId: step.id,
              label: step.label,
              message: errMsg,
            });
          }
        };

        // 並列実行ループ
        const inflight: Set<Promise<void>> = new Set();

        while (completed.size + failed.size < steps.length) {
          const readySteps = getReadySteps();

          // 実行待ちもなく、実行中もなければデッドロック（依存が満たせないステップが残存）
          if (readySteps.length === 0 && inflight.size === 0) {
            // 残ったステップを依存スキップ扱いに
            for (const s of steps) {
              if (
                !completed.has(s.id) &&
                !failed.has(s.id) &&
                !running.has(s.id)
              ) {
                const unmet = (s.dependsOn ?? []).filter(
                  (d) => !completed.has(d),
                );
                results[s.id] = {
                  result: `依存ステップ未完了: ${unmet.join(', ')}`,
                  status: 'failed',
                };
                failed.add(s.id);
                send({
                  type: 'step_skip',
                  stepId: s.id,
                  label: s.label,
                  reason: `依存ステップ未完了: ${unmet.join(', ')}`,
                });
              }
            }
            break;
          }

          // 実行可能なステップを全て並列起動
          if (readySteps.length > 1) {
            send({
              type: 'parallel_start',
              count: readySteps.length,
              labels: readySteps.map((s) => s.label),
            });
          }

          for (const step of readySteps) {
            const p = runStep(step).finally(() => {
              inflight.delete(p);
            });
            inflight.add(p);
          }

          // 少なくとも1つ完了するまで待機（残ったinflightは次の周回で待つ）
          if (inflight.size > 0) {
            await Promise.race(Array.from(inflight));
          }
        }

        // 念のため残りのinflightが完了するのを待つ
        if (inflight.size > 0) {
          await Promise.allSettled(Array.from(inflight));
        }

        const finalStatus = failed.size === 0 ? 'completed' : 'completed';
        await sql`
          UPDATE pipeline_jobs SET
            status = ${finalStatus},
            results = ${JSON.stringify(results)}::jsonb,
            progress = 100,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${jobId}
        `;

        send({
          type: 'completed',
          jobId,
          results,
          hadErrors: failed.size > 0,
        });
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
