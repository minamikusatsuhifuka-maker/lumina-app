import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PIPELINES, type PipelineStep, type StepResult } from '@/lib/pipelines';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ExecuteRequest {
  jobId: number;
}

// 並列起動数の上限（Vercel関数の同時接続数・メモリを保護）
const MAX_PARALLEL = 3;

// ステップIDに応じたタイムアウト設定（ms）
// 大量生成ステップ（LP・21通メール・SNS30日分など）は長めに確保する
const STEP_TIMEOUTS: Record<string, number> = {
  // 超長文生成（180秒〜240秒）
  lp: 180_000, // LP全文 → 3分
  step_mail: 240_000, // メール21通 → 4分
  sns_30days: 180_000, // SNS30日分 → 3分
  kindle_outline: 180_000, // Kindleアウトライン → 3分
  outline: 180_000, // Kindle本文用アウトライン → 3分
  chapter_hooks: 180_000, // 章ごとのフック → 3分
  amazon_listing: 150_000, // Amazonリスティング → 2.5分
  video_script: 150_000, // 動画台本 → 2.5分
  podcast_script: 150_000, // ポッドキャスト台本 → 2.5分
  seo_content_plan: 120_000, // SEOコンテンツ計画 → 2分
  promotion_plan: 120_000, // プロモーション計画 → 2分
  // 市場リサーチは内部Claude直接呼び出しでも長文生成のため余裕を持って3分
  market_research: 180_000,
  research: 180_000,
};
// デフォルト（通常ステップ）
const DEFAULT_STEP_TIMEOUT_MS = 90_000;
// fetch（Abort）はステップタイムアウトより5秒短く（最低60秒は確保）
const fetchTimeoutFor = (stepTimeoutMs: number): number =>
  Math.max(stepTimeoutMs - 5_000, 60_000);

// SSEストリームからテキストを収集
// deepresearch: { type: 'text', content: ... } / { type: 'done' }
// 他: { type: 'delta', text: ... } / { type: 'done' }
const collectSseText = async (res: Response): Promise<string> => {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
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
            } else if (event.type === 'error') {
              throw new Error(event.message ?? 'ストリームエラー');
            }
          } catch (err) {
            // パースエラーは無視、type==='error'の例外は再スロー
            if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
              if (err.message && !err.message.includes('JSON')) throw err;
            }
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* skip */
    }
  }
  return fullText;
};

const executeStep = async (
  step: PipelineStep,
  input: Record<string, unknown>,
  origin: string,
  cookieHeader: string,
  fetchTimeoutMs: number,
): Promise<string> => {
  const res = await fetch(`${origin}${step.apiEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
    // fetchレベルのタイムアウト（ステップ毎に動的に決定）
    signal: AbortSignal.timeout(fetchTimeoutMs),
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
    | {
        id: number;
        intent: string;
        pipeline_type: string;
        steps?: Array<{ id: string }> | null;
      }
    | undefined;

  if (!job) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'ジョブが見つかりません' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const basePipeline = PIPELINES.find((p) => p.id === job.pipeline_type);
  if (!basePipeline) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'パイプラインが見つかりません' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  // ジョブ作成時に保存された有効ステップIDを取得し、PIPELINES定義をフィルタ
  // 依存ステップが除外されている場合は dependsOn からも自動的に除外
  const enabledIds = new Set(
    Array.isArray(job.steps) && job.steps.length > 0
      ? job.steps.map((s) => s.id)
      : basePipeline.steps.map((s) => s.id),
  );
  const pipeline = {
    ...basePipeline,
    steps: basePipeline.steps
      .filter((s) => enabledIds.has(s.id))
      .map((s) => ({
        ...s,
        dependsOn: s.dependsOn?.filter((d) => enabledIds.has(d)),
      })),
  };

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
        `.catch(() => {
          /* DB更新エラーは握りつぶして続行 */
        });
        send({ type: 'started', jobId });

        const results: Record<string, StepResult> = {};
        const steps = pipeline.steps;
        const completed = new Set<string>();
        const running = new Set<string>();
        const failed = new Set<string>();
        // 実行中のPromiseを stepId をキーに保持（重複起動防止）
        const inflight = new Map<string, Promise<void>>();

        // 実行可能なステップを取得（依存がすべて完了済みのもの。失敗依存も「進行可」と見なす）
        const getReadySteps = (): PipelineStep[] =>
          steps.filter((step) => {
            if (
              completed.has(step.id) ||
              running.has(step.id) ||
              failed.has(step.id) ||
              inflight.has(step.id)
            ) {
              return false;
            }
            if (!step.dependsOn || step.dependsOn.length === 0) return true;
            // 依存ステップが完了または失敗していれば進める（依存失敗時は後段でスキップ判定）
            return step.dependsOn.every(
              (dep) => completed.has(dep) || failed.has(dep),
            );
          });

        // 1ステップを実行する非同期関数（必ず resolve、内部で例外を捕捉、タイムアウト付き）
        const runStep = async (step: PipelineStep): Promise<void> => {
          running.add(step.id);
          // ステップIDから動的にタイムアウトを決定（大量生成は長めに）
          const stepTimeout =
            STEP_TIMEOUTS[step.id] ?? DEFAULT_STEP_TIMEOUT_MS;
          const fetchTimeout = fetchTimeoutFor(stepTimeout);
          send({ type: 'step_start', stepId: step.id, label: step.label });

          // ステップ全体のタイムアウトPromise（動的）
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `タイムアウト(${stepTimeout / 1000}秒): ${step.label}`,
                  ),
                ),
              stepTimeout,
            ),
          );

          try {
            const input = step.inputMapper(job.intent, results);
            const result = await Promise.race([
              executeStep(step, input, origin, cookieHeader, fetchTimeout),
              timeoutPromise,
            ]);
            results[step.id] = { result, status: 'completed' };
            completed.add(step.id);
            running.delete(step.id);

            const progress = Math.round(
              ((completed.size + failed.size) / steps.length) * 100,
            );

            await sql`
              UPDATE pipeline_jobs SET
                results = ${JSON.stringify(results)}::jsonb,
                progress = ${progress},
                updated_at = NOW()
              WHERE id = ${jobId}
            `.catch(() => {
              /* DB更新エラーは無視して続行 */
            });

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
            console.error(`[orchestrator] ステップ失敗 ${step.id}:`, errMsg);
            results[step.id] = { result: errMsg, status: 'failed' };
            failed.add(step.id);
            running.delete(step.id);

            const progress = Math.round(
              ((completed.size + failed.size) / steps.length) * 100,
            );
            await sql`
              UPDATE pipeline_jobs SET
                results = ${JSON.stringify(results)}::jsonb,
                progress = ${progress},
                updated_at = NOW()
              WHERE id = ${jobId}
            `.catch(() => {
              /* DB更新エラーは無視 */
            });

            send({
              type: 'step_error',
              stepId: step.id,
              label: step.label,
              message: errMsg,
            });
          } finally {
            inflight.delete(step.id);
          }
        };

        // メイン実行ループ（無限ループ防止のため最大反復回数を設定）
        const MAX_LOOPS = steps.length * 10 + 50;
        let loopCount = 0;

        while (
          completed.size + failed.size < steps.length &&
          loopCount < MAX_LOOPS
        ) {
          loopCount++;
          const readySteps = getReadySteps();

          if (readySteps.length > 0) {
            // 並列起動数を制限
            const slotsAvailable = Math.max(0, MAX_PARALLEL - inflight.size);
            const toRun = readySteps.slice(0, slotsAvailable);

            if (toRun.length === 0) {
              // 既に並列上限。inflightの完了待ち
              if (inflight.size > 0) {
                await Promise.race(Array.from(inflight.values()));
              }
              continue;
            }

            if (toRun.length > 1) {
              send({
                type: 'parallel_start',
                count: toRun.length,
                labels: toRun.map((s) => s.label),
              });
            }

            // 起動して inflight に登録
            for (const step of toRun) {
              const p = runStep(step);
              inflight.set(step.id, p);
            }

            // 少なくとも1つが完了するまで待機
            if (inflight.size > 0) {
              await Promise.race(Array.from(inflight.values()));
            }
          } else if (inflight.size > 0) {
            // 実行可能な新規ステップはないが、実行中ステップが残っている
            await Promise.race(Array.from(inflight.values()));
          } else {
            // ready 0 & inflight 0 → デッドロック（依存スキップ判定）
            const remaining = steps.filter(
              (s) =>
                !completed.has(s.id) && !failed.has(s.id) && !running.has(s.id),
            );
            console.error(
              '[orchestrator] デッドロック検出。残りステップ:',
              remaining.map((s) => s.id),
            );
            for (const s of remaining) {
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
            break;
          }
        }

        // 念のため残りのinflightが完了するのを待つ
        if (inflight.size > 0) {
          await Promise.allSettled(Array.from(inflight.values()));
        }

        if (loopCount >= MAX_LOOPS) {
          console.error(
            '[orchestrator] MAX_LOOPS到達。強制終了:',
            { completed: completed.size, failed: failed.size, total: steps.length },
          );
        }

        // 最終ステータス判定
        const finalStatus =
          failed.size === steps.length
            ? 'failed'
            : failed.size > 0
              ? 'completed_with_errors'
              : 'completed';

        await sql`
          UPDATE pipeline_jobs SET
            status = ${finalStatus},
            results = ${JSON.stringify(results)}::jsonb,
            progress = 100,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${jobId}
        `.catch(() => {
          /* DB更新エラーは無視 */
        });

        send({
          type: 'completed',
          jobId,
          results,
          hadErrors: failed.size > 0,
          completedCount: completed.size,
          failedCount: failed.size,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[orchestrator] パイプライン全体エラー:', message);
        await sql`
          UPDATE pipeline_jobs SET
            status = 'failed',
            error_message = ${message},
            updated_at = NOW()
          WHERE id = ${jobId}
        `.catch(() => {
          /* skip */
        });
        send({ type: 'error', message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
