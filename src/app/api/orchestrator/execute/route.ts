import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PIPELINES, type PipelineStep, type StepResult } from '@/lib/pipelines';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ExecuteRequest {
  jobId: number;
}

// トークン使用量
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// 拡張StepResult（実行詳細にトークン情報を含める）
interface StepResultEx extends Omit<StepResult, 'status'> {
  status: 'completed' | 'failed' | 'skipped';
  tokens?: TokenUsage;
}

// 並列起動数の上限
const MAX_PARALLEL = 3;
// メインループのポーリング間隔（イベント駆動の代わり）
const POLL_INTERVAL_MS = 200;

// ステップIDに応じたタイムアウト設定（ms）
const STEP_TIMEOUTS: Record<string, number> = {
  // 超長文生成（180秒〜240秒）
  lp: 180_000,
  step_mail: 240_000,
  sns_30days: 180_000,
  kindle: 180_000,
  kindle_outline: 180_000,
  outline: 180_000,
  chapter_hooks: 180_000,
  amazon_listing: 150_000,
  video_script: 150_000,
  podcast_script: 150_000,
  seo_content_plan: 120_000,
  promotion_plan: 120_000,
  // 市場リサーチ系
  market_research: 180_000,
  research: 180_000,
};
const DEFAULT_STEP_TIMEOUT_MS = 90_000;
// fetch（Abort）はステップタイムアウトより5秒短く（最低60秒は確保）
const fetchTimeoutFor = (stepTimeoutMs: number): number =>
  Math.max(stepTimeoutMs - 5_000, 60_000);

// SSEストリームからテキスト＋トークン使用量を収集
const collectSseTextAndTokens = async (
  res: Response,
): Promise<{ content: string; tokens?: TokenUsage }> => {
  if (!res.body) return { content: '' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let tokens: TokenUsage | undefined;

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
            } else if (event.type === 'done' && event.usage) {
              tokens = {
                inputTokens: event.usage.input_tokens ?? 0,
                outputTokens: event.usage.output_tokens ?? 0,
              };
            } else if (event.type === 'error') {
              throw new Error(event.message ?? 'ストリームエラー');
            }
          } catch (err) {
            if (
              err instanceof Error &&
              err.message &&
              !err.message.includes('JSON') &&
              err.message !== 'Unexpected end of JSON input'
            ) {
              throw err;
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
  return { content: fullText, tokens };
};

// ステップ実行（コンテンツとトークン消費を返す）
const executeStep = async (
  step: PipelineStep,
  input: Record<string, unknown>,
  origin: string,
  cookieHeader: string,
  fetchTimeoutMs: number,
): Promise<{ content: string; tokens?: TokenUsage }> => {
  const res = await fetch(`${origin}${step.apiEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
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
    const { content, tokens } = await collectSseTextAndTokens(res);
    return { content: content || '（結果なし）', tokens };
  }

  const data = (await res.json()) as Record<string, unknown>;
  let content = '';
  if (typeof data.content === 'string') content = data.content;
  else if (typeof data.result === 'string') content = data.result;
  else if (typeof data.html === 'string') content = data.html;
  else if (data.saved && Array.isArray(data.saved)) {
    content = `${data.count ?? data.saved.length}件保存しました: ${JSON.stringify(data.saved).slice(0, 200)}`;
  } else {
    content = JSON.stringify(data);
  }

  // usage が含まれていればトークン情報も返す
  let tokens: TokenUsage | undefined;
  const usage = data.usage as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  if (usage) {
    tokens = {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    };
  }
  return { content, tokens };
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

  // ジョブ作成時に保存された有効ステップIDでパイプラインをフィルタ
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

      const steps = pipeline.steps;
      const results: Record<string, StepResultEx> = {};
      const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 };

      try {
        await sql`
          UPDATE pipeline_jobs
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE id = ${jobId}
        `.catch(() => {
          /* DB更新エラーは握りつぶして続行 */
        });
        send({ type: 'started', jobId });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // イベント駆動型並列実行エンジン（ポーリング200ms）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const done = new Set<string>(); // 完了（成功 or 失敗 or スキップ）
        const running = new Set<string>(); // 実行中

        // 実行可能なステップを取得
        const getReady = (): PipelineStep[] =>
          steps.filter((step) => {
            if (done.has(step.id) || running.has(step.id)) return false;
            if (!step.dependsOn || step.dependsOn.length === 0) return true;
            // 依存ステップが完了済み（成功・失敗問わず）なら進める
            return step.dependsOn.every((dep) => done.has(dep));
          });

        // inputMapperに渡す previous results（既存シグネチャを維持）
        // StepResult { result: string; status: 'completed' | 'failed' } を期待している
        const inputMapperResults = (): Record<string, StepResult> => {
          const out: Record<string, StepResult> = {};
          for (const [k, v] of Object.entries(results)) {
            out[k] = {
              result: v.result ?? '',
              status: v.status === 'completed' ? 'completed' : 'failed',
            };
          }
          return out;
        };

        // 1ステップ実行（必ずresolve）
        const runStep = (step: PipelineStep): Promise<void> => {
          running.add(step.id);
          const stepTimeout =
            STEP_TIMEOUTS[step.id] ?? DEFAULT_STEP_TIMEOUT_MS;
          const fetchTimeout = fetchTimeoutFor(stepTimeout);
          send({ type: 'step_start', stepId: step.id, label: step.label });

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

          return Promise.race([
            (async () => {
              const input = step.inputMapper(job.intent, inputMapperResults());
              return executeStep(step, input, origin, cookieHeader, fetchTimeout);
            })(),
            timeoutPromise,
          ])
            .then(({ content, tokens }) => {
              results[step.id] = {
                result: content,
                status: 'completed',
                tokens,
              };
              if (tokens) {
                totalTokens.inputTokens += tokens.inputTokens;
                totalTokens.outputTokens += tokens.outputTokens;
              }
              done.add(step.id);
              running.delete(step.id);
              const progress = Math.round((done.size / steps.length) * 100);
              send({
                type: 'step_complete',
                stepId: step.id,
                label: step.label,
                progress,
                preview:
                  typeof content === 'string'
                    ? content.slice(0, 200)
                    : JSON.stringify(content).slice(0, 200),
              });
              // DB非同期更新（失敗しても続行）
              void sql`
                UPDATE pipeline_jobs SET
                  results = ${JSON.stringify(results)}::jsonb,
                  progress = ${progress},
                  updated_at = NOW()
                WHERE id = ${jobId}
              `.catch(() => {});
            })
            .catch((err) => {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`[orchestrator] ステップ失敗 ${step.id}:`, errMsg);
              results[step.id] = {
                result: errMsg,
                status: 'failed',
              };
              done.add(step.id); // 失敗も「完了」扱いでループを進める
              running.delete(step.id);
              const progress = Math.round((done.size / steps.length) * 100);
              send({
                type: 'step_error',
                stepId: step.id,
                label: step.label,
                error: errMsg,
                message: errMsg,
              });
              void sql`
                UPDATE pipeline_jobs SET
                  results = ${JSON.stringify(results)}::jsonb,
                  progress = ${progress},
                  updated_at = NOW()
                WHERE id = ${jobId}
              `.catch(() => {});
            });
        };

        // メインループ：全ステップが done になるまで繰り返す
        const allPromises: Promise<void>[] = [];
        // 無限ループ防止
        const MAX_LOOPS = (steps.length + 10) * 10_000; // 最大2000秒相当
        let loopCount = 0;

        while (done.size < steps.length && loopCount < MAX_LOOPS) {
          loopCount++;
          const ready = getReady();
          const slots = MAX_PARALLEL - running.size;
          const toRun = ready.slice(0, Math.max(0, slots));

          if (toRun.length > 0) {
            if (toRun.length > 1) {
              send({
                type: 'parallel_start',
                count: toRun.length,
                labels: toRun.map((s) => s.label),
              });
            }
            for (const step of toRun) {
              allPromises.push(runStep(step));
            }
          }

          // 実行中もなく、実行可能もない → デッドロック検出
          if (
            running.size === 0 &&
            getReady().length === 0 &&
            done.size < steps.length
          ) {
            const stuck = steps.filter((s) => !done.has(s.id));
            for (const s of stuck) {
              const unmet = (s.dependsOn ?? []).filter(
                (d) =>
                  !results[d] ||
                  (results[d]?.status !== 'completed'),
              );
              results[s.id] = {
                result: `依存ステップ未完了: ${unmet.join(', ')}`,
                status: 'skipped',
              };
              done.add(s.id);
              send({
                type: 'step_error',
                stepId: s.id,
                label: s.label,
                error: 'スキップ（依存ステップ失敗）',
                reason: `依存ステップ未完了: ${unmet.join(', ')}`,
              });
            }
            break;
          }

          // ポーリング間隔
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        // 起動した全Promiseの完了を待つ
        await Promise.allSettled(allPromises);

        const completedCount = Object.values(results).filter(
          (r) => r.status === 'completed',
        ).length;
        const failedCount = Object.values(results).filter(
          (r) => r.status === 'failed',
        ).length;
        const skippedCount = Object.values(results).filter(
          (r) => r.status === 'skipped',
        ).length;

        // コスト計算（claude-sonnet-4-6: input $3/1M, output $15/1M、1USD=150JPY）
        const costUsd =
          (totalTokens.inputTokens * 3 + totalTokens.outputTokens * 15) /
          1_000_000;
        const costJpy = Math.ceil(costUsd * 150);

        const finalStatus =
          failedCount === steps.length
            ? 'failed'
            : failedCount > 0 || skippedCount > 0
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
        `.catch(() => {});

        // API使用量を api_usage_logs に記録（DB直接書き込みで内部fetchを回避）
        if (totalTokens.inputTokens > 0 || totalTokens.outputTokens > 0) {
          await sql`
            INSERT INTO api_usage_logs
              (user_id, feature_key, step_label, input_tokens, output_tokens, cost_usd, cost_jpy, model)
            VALUES (
              ${userId}, 'orchestrator', ${pipeline.label},
              ${totalTokens.inputTokens}, ${totalTokens.outputTokens},
              ${costUsd}, ${costJpy},
              'claude-sonnet-4-6'
            )
          `.catch((err) => {
            console.error('[orchestrator] 使用量記録失敗:', err);
          });
        }

        send({
          type: 'completed',
          jobId,
          results,
          hadErrors: failedCount > 0 || skippedCount > 0,
          completedCount,
          failedCount,
          skippedCount,
          totalTokens,
          costUsd: Math.round(costUsd * 1000) / 1000,
          costJpy,
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
        `.catch(() => {});
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
