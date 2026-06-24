import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PIPELINES, type PipelineStep, type StepResult } from '@/lib/pipelines';
import { triggerIntegrations } from '@/lib/integrationEngine';

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
  qualityScore?: number;
  attempts?: number;
}

// 並列起動数の上限（依存最深の末端ステップが最終ウェーブに回る問題を緩和するため 3→4）
// ※ Gemini/Claude のレート上限に注意。429 が出るなら下げる。
const MAX_PARALLEL = 4;
// メインループのポーリング間隔（イベント駆動の代わり）
const POLL_INTERVAL_MS = 200;

// ━━ 時間予算（maxDuration=300 で関数 kill される前に必ず終わらせる）━━
// 全体デッドライン: 関数開始から余裕をもって 270 秒。接近したら未着手をスキップして completed へ。
const OVERALL_DEADLINE_MS = 270_000;
// デッドライン残りがこの値未満なら、新規ステップ着手や品質リトライを止める安全マージン
const DEADLINE_SAFETY_MS = 20_000;
// 1ステップが品質ループ（再生成）に費やせる上限。これを超えたら最良版で確定。
const STEP_QUALITY_BUDGET_MS = 60_000;
// 品質ループ継続に必要な全体残り時間（これを下回ったらリトライせず最良版で確定）
const QUALITY_MIN_REMAINING_MS = 75_000;

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

      // 全体デッドライン管理（関数開始からの経過で残り時間を判定）
      const engineStartedAt = Date.now();
      const elapsedMs = () => Date.now() - engineStartedAt;
      const remainingMs = () => OVERALL_DEADLINE_MS - elapsedMs();
      const deadlineReached = () => remainingMs() <= DEADLINE_SAFETY_MS;

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

        // 品質チェック・再試行ループ設定
        const QUALITY_THRESHOLD = 70;
        const MAX_QUALITY_RETRIES = 3;

        // 1ステップ実行（必ずresolve）— 品質チェック・自動改善・再試行ループ付き
        const runStep = async (step: PipelineStep): Promise<void> => {
          running.add(step.id);
          const stepStarted = Date.now();
          const stepTimeout =
            STEP_TIMEOUTS[step.id] ?? DEFAULT_STEP_TIMEOUT_MS;
          const fetchTimeout = fetchTimeoutFor(stepTimeout);
          send({ type: 'step_start', stepId: step.id, label: step.label });

          // 個々の生成呼び出しの上限。ただし全体デッドラインの残り時間も超えない
          // （1ステップが関数全体の時間を独占しないための安全網）。
          const callTimeout = Math.max(
            Math.min(stepTimeout, remainingMs() - 5_000),
            20_000,
          );
          const withTimeout = <T,>(p: Promise<T>): Promise<T> => {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `タイムアウト(${Math.round(callTimeout / 1000)}秒): ${step.label}`,
                    ),
                  ),
                callTimeout,
              ),
            );
            return Promise.race([p, timeoutPromise]);
          };

          try {
            const initialInput = step.inputMapper(
              job.intent,
              inputMapperResults(),
            );
            let currentInput: Record<string, unknown> = initialInput;

            // 初回実行
            const initial = await withTimeout(
              executeStep(step, currentInput, origin, cookieHeader, fetchTimeout),
            );
            let content = initial.content;
            let tokens = initial.tokens;
            let bestContent = content;
            let bestScore = 0;
            let attempts = 0;
            const qualityLoopStarted = Date.now();

            // 品質チェック・再試行ループ（200文字以上のコンテンツのみ）
            while (attempts < MAX_QUALITY_RETRIES) {
              if (!content || content.length < 200) break;

              // 時間予算制: このステップの品質ループ予算超過、または全体デッドライン残りが
              // 少ないときは、リトライ回数が残っていても最良版で確定して打ち切る。
              // （品質ループがステップタイムアウトの外で時間を膨張させ 300 秒 kill を招く問題の対策）
              if (
                Date.now() - qualityLoopStarted > STEP_QUALITY_BUDGET_MS ||
                remainingMs() < QUALITY_MIN_REMAINING_MS
              ) {
                send({
                  type: 'quality_warning',
                  stepId: step.id,
                  label: step.label,
                  bestScore,
                  message: `時間予算により品質改善を打ち切り、最良版（最高${bestScore}点）を採用`,
                });
                if (bestScore > 0 && bestContent) content = bestContent;
                break;
              }
              attempts++;

              const qualityRes = await fetch(
                `${origin}/api/orchestrator/quality-check`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    cookie: cookieHeader,
                  },
                  body: JSON.stringify({
                    stepId: step.id,
                    stepLabel: step.label,
                    content,
                    intent: job.intent,
                  }),
                  signal: AbortSignal.timeout(45_000),
                },
              ).catch(() => null);

              if (!qualityRes?.ok) break;

              const qualityResult = (await qualityRes
                .json()
                .catch(() => null)) as {
                score?: number;
                passed?: boolean;
                reason?: string;
                improvements?: string[];
              } | null;

              if (!qualityResult || typeof qualityResult.score !== 'number') break;

              const {
                score,
                passed,
                reason,
                improvements,
              } = qualityResult;

              if (score > bestScore) {
                bestScore = score;
                bestContent = content;
              }

              await sql`
                UPDATE pipeline_jobs SET
                  quality_scores = jsonb_set(
                    COALESCE(quality_scores, '{}'::jsonb),
                    ${`{${step.id}}`}::text[],
                    ${JSON.stringify({ score, attempts, passed, reason })}::jsonb
                  ),
                  retry_logs = COALESCE(retry_logs, '[]'::jsonb) || ${JSON.stringify([
                    {
                      stepId: step.id,
                      attempt: attempts,
                      score,
                      reason,
                      improvements,
                    },
                  ])}::jsonb,
                  updated_at = NOW()
                WHERE id = ${jobId}
              `.catch(() => {});

              if (passed || score >= QUALITY_THRESHOLD) {
                send({
                  type: 'quality_passed',
                  stepId: step.id,
                  label: step.label,
                  score,
                  attempts,
                });
                break;
              }

              if (attempts >= MAX_QUALITY_RETRIES) {
                send({
                  type: 'quality_warning',
                  stepId: step.id,
                  label: step.label,
                  bestScore,
                  message: `品質基準(${QUALITY_THRESHOLD}点)未達（最高${bestScore}点）。最良の結果を使用します`,
                });
                content = bestContent;
                break;
              }

              send({
                type: 'quality_retry',
                stepId: step.id,
                label: step.label,
                score,
                attempt: attempts,
                improvements,
              });

              const improveRes = await fetch(
                `${origin}/api/orchestrator/improve-prompt`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    cookie: cookieHeader,
                  },
                  body: JSON.stringify({
                    originalInput: currentInput,
                    failedContent: content,
                    improvements,
                    stepLabel: step.label,
                    attempt: attempts,
                  }),
                  signal: AbortSignal.timeout(25_000),
                },
              ).catch(() => null);

              if (improveRes?.ok) {
                const improvedJson = (await improveRes
                  .json()
                  .catch(() => null)) as {
                  improvedInput?: Record<string, unknown>;
                } | null;
                if (improvedJson?.improvedInput) {
                  currentInput = improvedJson.improvedInput;
                }
              }

              // 改善されたプロンプトで再生成
              const retryFetchTimeout = Math.max(fetchTimeout - 5_000, 30_000);
              const retryResult = await executeStep(
                step,
                currentInput,
                origin,
                cookieHeader,
                retryFetchTimeout,
              ).catch(() => ({ content, tokens: undefined as TokenUsage | undefined }));

              content = retryResult.content ?? content;
              if (retryResult.tokens) tokens = retryResult.tokens;
            }

            const finalContent =
              bestScore > 0 && bestContent ? bestContent : content;

            results[step.id] = {
              result: finalContent,
              status: 'completed',
              tokens,
              qualityScore: bestScore || undefined,
              attempts: attempts || undefined,
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
                typeof finalContent === 'string'
                  ? finalContent.slice(0, 200)
                  : JSON.stringify(finalContent).slice(0, 200),
            });
            void sql`
              UPDATE pipeline_jobs SET
                results = ${JSON.stringify(results)}::jsonb,
                progress = ${progress},
                updated_at = NOW()
              WHERE id = ${jobId}
            `.catch(() => {});
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[orchestrator] ステップ失敗 ${step.id}:`, errMsg);
            results[step.id] = {
              result: errMsg,
              status: 'failed',
            };
            done.add(step.id);
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
          }
        };

        // メインループ：全ステップが done になるまで繰り返す
        const allPromises: Promise<void>[] = [];
        // 無限ループ防止（全体デッドライン=270秒前提で POLL 間隔から算出。2000秒→300秒前提に縮小）
        const MAX_LOOPS =
          Math.ceil((OVERALL_DEADLINE_MS + 30_000) / POLL_INTERVAL_MS) +
          steps.length +
          50;
        let loopCount = 0;

        while (done.size < steps.length && loopCount < MAX_LOOPS) {
          loopCount++;

          // 全体デッドライン接近: 未着手ステップを「時間予算スキップ」（部分失敗扱い）にして
          // 安全に completed へ。実行中ステップは allSettled で待つ（各自 時間予算で速やかに収束）。
          if (deadlineReached()) {
            const notStarted = steps.filter(
              (s) => !done.has(s.id) && !running.has(s.id),
            );
            for (const s of notStarted) {
              results[s.id] = {
                result: '時間予算により未実行（全体が300秒制限に接近したためスキップ）',
                status: 'skipped',
              };
              done.add(s.id);
              send({
                type: 'step_error',
                stepId: s.id,
                label: s.label,
                error: 'スキップ（時間予算）',
                reason: '全体の実行時間が上限に接近したため未実行',
              });
            }
            break;
          }

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

        // 外部SaaS連携（Make/Zapier/Notion/Sheets）を自動発火
        await triggerIntegrations(
          {
            userId,
            sourceType: 'pipeline',
            sourceId: jobId,
            title: `${pipeline.label} - ${job.intent}`,
            content: Object.entries(results)
              .filter(([, v]) => v?.result)
              .map(([k, v]) => `## ${k}\n${v.result}`)
              .join('\n\n'),
            summary: job.intent,
            tags: [pipeline.id, 'orchestrator'],
            metadata: {
              executionId: jobId,
              pipelineType: pipeline.id,
              pipelineLabel: pipeline.label,
              intent: job.intent,
              completedSteps: completedCount,
              failedSteps: failedCount,
              skippedSteps: skippedCount,
              totalTokens,
              costJpy,
              dashboardUrl: 'https://xlumina.jp/dashboard/orchestrator',
            },
          },
          'pipeline_complete',
        ).catch(() => {
          /* 連携失敗はパイプライン本体に影響させない */
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
