import { CLAUDE_TEXT_MODEL, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';
import { NO_HTML_PROMPT_RULE, NO_LATEX_PROMPT_RULE } from '@/lib/markdown-renderer';
import { fetchAnthropic, iterateSSE } from '@/lib/anthropic-compat';
import { describeAnthropicError } from '@/lib/anthropic-error';
// 290: Gemini／Claude Opus 5 の並列比較（オプトイン・R-88）。ラベル・モデルIDは lib/model-compare.ts が正本
// 314: 3列目 GPT-6 Astra（lib/openai-research）・モデルごとの個別タイムアウト（「中断」）・runId による二重開始の遮断（R-87）
import { COMPARE_RUN_DEDUPE_TTL_MS, COMPARE_SERVER_TIMEOUT_MS, COMPARE_SIDE_LABEL, COMPARE_SIDE_MODEL_ID, COMPARE_TIMEOUT_MESSAGE, parseCompareSide } from '@/lib/model-compare';
import { streamOpenAIResearch } from '@/lib/openai-research';

// R-83: リテラル必須。正本は lib/model-compare.ts の DEEPRESEARCH_MAX_DURATION_S（U59で一致を固定）
// 314: Vercel Pro（Fluid compute・上限 800 秒）の範囲内で 300→600（実測: Opus は最長 286 秒で完走＝300 では上限直前）
export const maxDuration = 600;

/** 314 R-87: 同じ runId・同じ列の二重開始をインスタンス内で遮断（ベストエフォート。TTL 内は 409） */
const recentCompareRuns = new Map<string, number>();
function isDuplicateCompareRun(key: string, nowMs: number): boolean {
  for (const [k, t] of recentCompareRuns) if (nowMs - t > COMPARE_RUN_DEDUPE_TTL_MS) recentCompareRuns.delete(k);
  if (recentCompareRuns.has(key)) return true;
  recentCompareRuns.set(key, nowMs);
  return false;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = session ? (session.user as any).id : '';
  const { topic, depth, periodStart, periodEnd, model = DEFAULT_AI_MODEL, compare, runId } = (await req.json()) as {
    topic: string;
    depth?: string;
    periodStart?: string;
    periodEnd?: string;
    model?: AIModel;
    /** 290: 'gemini' | 'opus' | 'gpt'（314）のときだけ比較経路（フォールバック無効・1リクエスト1モデル）。未指定＝従来どおり */
    compare?: unknown;
    /** 314 R-87: 比較の開始ごとにクライアントが付ける識別子。同じ runId・同じ列の再送は 409 */
    runId?: unknown;
  };

  // 290: 比較フラグの検証。未指定は従来経路（null）。不正値は 400（黙って従来経路に倒さない）
  const compareSide = parseCompareSide(compare);
  if (compareSide === undefined) {
    return new Response(JSON.stringify({ error: 'compare は gemini・opus・gpt のいずれかを指定してください' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (compareSide && typeof runId === 'string' && runId && isDuplicateCompareRun(`${userId}:${runId}:${compareSide}`, Date.now())) {
    return new Response(JSON.stringify({ error: '同じ比較がすでに開始されています（二重送信）' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 対象期間セクション（指定がある場合のみ。未指定時は既存と完全互換）
  // 期間はプロンプト注入だけでは実効性ゼロ（古い知識の現在形作文になる）ため、
  // 「期間内の情報をWeb検索で収集し、見つからなければ確認できなかったと書く」検索指示にする
  const periodSection = (periodStart || periodEnd)
    ? `\n\n# 対象期間\n${periodStart || '指定なし'} 〜 ${periodEnd || '現在まで'}\nこの期間に公開・発表された情報をWeb検索で優先的に収集し、検索で確認できた内容を中心に分析してください。それ以外の期間の情報は、必要な背景説明としてのみ参照してください。期間内の情報がWeb検索で見つからない項目は、推測で埋めずに「この期間の情報はWeb検索では確認できなかった」と明記してください。`
    : '';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // クリニック背景情報を取得（任意）
  const clinicPrompt = userId ? await getClinicSystemPrompt('deepresearch', userId) : '';
  const clinicStr = clinicPrompt ? `\n\n${clinicPrompt}` : '';

  // モード別の本文指示（文字数より完結性を最優先）
  const depthPrompts: Record<string, string> = {
    quick: '1500字程度で簡潔にまとめてください。要点を絞りつつ、必ず最後の「まとめ・結論」まで完結させてください。',
    standard: '3000字程度で詳しくまとめてください。概要・主要ポイント・最新動向・事例を含め、必ず最後の「まとめ・結論」まで完結させてください。',
    deep: '5000字程度の詳細なリサーチレポートを作成してください。各章を深く掘り下げつつ、必ず最後の「まとめ・結論」で締めくくってください。文字数より完結性を最優先してください。',
  };

  // モード別のmax_tokens（完結性確保のため余裕を持たせる）
  const depthMaxTokens: Record<string, number> = {
    quick: 3000,
    standard: 6000,
    deep: 12000,
  };
  const selectedDepth = depth || 'standard';
  const maxTokens = depthMaxTokens[selectedDepth] || 6000;

  // モード別のアウトライン構成
  const depthOutlines: Record<string, string> = {
    quick: `## はじめに
## 要点（3〜5項目）
## まとめ・結論`,
    standard: `## はじめに
## 背景と概要
## 主要ポイント・最新動向
## 事例・実践
## まとめ・結論`,
    deep: `## はじめに
## 背景と概要
## 詳細解説（複数章で深く掘り下げ）
## 実践・活用方法
## まとめ・結論`,
  };
  const outline = depthOutlines[selectedDepth] || depthOutlines.standard;

  const encoder = new TextEncoder();

  const systemPrompt = `あなたは優秀なリサーチアナリストです。
与えられたトピックについてWebを検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止（<a href=...>など）。${NO_HTML_PROMPT_RULE}
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 出典は「出典: サイト名 https://URL」の形式のみ
5. URLの後に属性やスタイルは絶対に書かない
6. 事実と推測を明確に区別してください
7. 必ずWeb検索を実行し、検索結果で確認できた情報に基づいて書くこと（学習時の知識だけを「最新情報」として書くことは禁止）
8. Web検索で確認できなかった事項は、推測や作文で埋めずに「Web検索では確認できなかった」と明記すること
9. ${NO_LATEX_PROMPT_RULE}${clinicStr}`;

  const userPrompt = `トピック：${topic}${periodSection}
調査深度の指示：${depthPrompts[selectedDepth]}

【必須要件】
- 必ず「まとめ・結論」セクションで締めくくること
- 途中で終わらず最後まで完結させること
- 文字数が多少前後しても完結を最優先すること
- 以下の構成に従うこと

# ${topic}
${outline}
## 参考・補足

【出力ルール】
- 各情報の引用元URLを必ず記載
- URLは生のURL（https://...）のみ。HTMLタグやMarkdownリンク記法は禁止
- ${NO_HTML_PROMPT_RULE}
- 出典の形式: 「出典: サイト名 https://URL」
- 事実と推測を明確に区別

【最重要】必ず最後の「まとめ・結論」まで書き切ってください。
途中で終わることは絶対に避けてください。
時間や長さが厳しい場合は中盤を簡潔にしてでも、結論セクションを必ず含めてください。`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        // ── 290: 比較経路（compare 指定時のみ。以下の従来経路には一切触れない・R-88） ──
        // 同じ systemPrompt（クリニック背景＝ナレッジ注入込み）・同じ userPrompt を両モデルに渡す（§7: 同じガード）。
        // 1リクエスト1モデル（R-73）。Claude 側は fetchAnthropic の fallback:false で Gemini へ切り替えない（§3）。
        if (compareSide) {
          const t0 = Date.now();
          const modelId = COMPARE_SIDE_MODEL_ID[compareSide];
          const send = (obj: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ side: compareSide, ...obj })}\n\n`));
          send({ type: 'meta', model: modelId, label: COMPARE_SIDE_LABEL[compareSide] });
          let inputTokens = 0;
          let outputTokens = 0;
          let chars = 0;
          // 314 §3-2: モデルごとの個別タイムアウト（リトライ 0・R-73）。maxDuration より手前で必ず「中断」に落とし、無音で閉じない
          const abort = new AbortController();
          let timedOut = false;
          const timeoutTimer = setTimeout(() => {
            timedOut = true;
            abort.abort();
          }, COMPARE_SERVER_TIMEOUT_MS);
          const timeoutGate = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('compare-timeout')), { once: true }));
          try {
            if (compareSide === 'gemini') {
              // 通常経路の Gemini と同じ関数・同じ引数（検索グラウンディング有効）。
              // 'delta' 形式にするのは、'standard' が自前で done を出すため（比較経路の done は使用量つきで1回だけ出す）
              const counting = {
                enqueue: (chunk: Uint8Array) => {
                  chars += chunk.byteLength; // 目安（文字数はクライアントが本文長から確定する）
                  controller.enqueue(chunk);
                },
              } as unknown as ReadableStreamDefaultController;
              // Gemini の呼び出しは signal を受けないため、時間切れは race で打ち切る（以降の出力は捨てる）
              const usage = await Promise.race([streamWithModel('gemini', userPrompt, systemPrompt, counting, encoder, maxTokens, 'delta', true), timeoutGate]);
              inputTokens = usage.inputTokens;
              outputTokens = usage.outputTokens;
            } else if (compareSide === 'gpt') {
              // 314 §3-3: GPT-6 Astra（OpenAI・fetch 直叩き・web_search・ストリーミング）。同じ system/user プロンプト＝
              // 医療広告ガード等の既存規約と 294 の前置き禁止が同じ順で効く（R-69）。未提供（403/404）はこの列だけ失敗
              const r = await streamOpenAIResearch({
                systemPrompt,
                userPrompt,
                maxTokens,
                signal: abort.signal,
                onText: (t) => {
                  chars += t.length;
                  send({ type: 'text', content: t });
                },
              });
              if (!r.ok) {
                send({ type: 'error', message: r.message, unavailable: r.unavailable });
                return;
              }
              inputTokens = r.inputTokens;
              outputTokens = r.outputTokens;
            } else {
              // Claude Opus 5（CLAUDE_OPUS_MODEL・244で実在確認・290で疎通再確認）。ストリーミングで本文を逐次流す。
              // web_search は Opus 5 で受理を確認した新版（web_search_20260209）を使う（R-47: パラメータ受理確認済み）
              const res = await fetchAnthropic(
                {
                  model: modelId,
                  max_tokens: Math.max(maxTokens, 2048), // R-03
                  stream: true,
                  tools: [{ type: 'web_search_20260209', name: 'web_search' }],
                  system: systemPrompt,
                  messages: [{ role: 'user', content: userPrompt }],
                },
                { fallback: false, signal: abort.signal },
              );
              if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                // §3-2: 失敗は失敗として返す（Gemini で代替しない）。理由は原文つきで（R-33）
                send({ type: 'error', message: describeAnthropicError(res.status, errBody) });
                return;
              }
              for await (const ev of iterateSSE(res)) {
                if (ev.type === 'message_start') {
                  inputTokens = ev.message?.usage?.input_tokens ?? 0;
                } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                  chars += ev.delta.text.length;
                  send({ type: 'text', content: ev.delta.text });
                } else if (ev.type === 'message_delta') {
                  outputTokens = ev.usage?.output_tokens ?? outputTokens;
                } else if ((ev as { type: string }).type === 'error') {
                  const msg = (ev as unknown as { error?: { message?: string } }).error?.message;
                  throw new Error(msg || 'Anthropic のストリームがエラーで終了しました');
                }
              }
              if (chars === 0) {
                // 200 なのに本文が空（枠切れ・refusal 等）。偽の成功にしない（R-05）
                send({ type: 'error', message: `${COMPARE_SIDE_LABEL[compareSide]} の応答が空でした（思考枠の不足または生成の拒否）。` });
                return;
              }
            }
            await trackUsage({
              userId,
              featureKey: 'deepresearch',
              stepLabel: `[比較:${COMPARE_SIDE_LABEL[compareSide]}] ${topic ?? ''}`.slice(0, 50),
              inputTokens,
              outputTokens,
              ...(compareSide === 'opus' ? { model: modelId } : {}),
            });
            send({
              type: 'done',
              model: modelId,
              elapsedMs: Date.now() - t0,
              finishedAt: new Date().toISOString(),
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            });
          } catch (e) {
            if (timedOut || (e instanceof Error && (e.name === 'AbortError' || e.message === 'compare-timeout'))) {
              // 314: 時間切れは「中断」（失敗とは別の状態・保存しない・再実行できる）
              send({ type: 'timeout', message: COMPARE_TIMEOUT_MESSAGE, elapsedMs: Date.now() - t0 });
            } else {
              // ネットワーク断・Gemini 側の例外など。理由を列に出す（空欄にしない）
              send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
            }
          } finally {
            clearTimeout(timeoutTimer);
          }
          return;
        }

        // Gemini: streamWithModel（Google検索グラウンディング有効・出典は本文末尾に自動追記）
        if (model === 'gemini') {
          const usage = await streamWithModel(
            'gemini',
            userPrompt,
            systemPrompt,
            controller,
            encoder,
            maxTokens,
            'standard',
            true, // webSearch: 実検索に基づかない「最新風の古い内容」を防ぐ
          );
          await trackUsage({
            userId,
            featureKey: 'deepresearch',
            stepLabel: (topic ?? '').slice(0, 50),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } })}\n\n`,
            ),
          );
          return;
        }

        // Claude: web_search ツール対応。242: 上限・混雑ならGeminiへ自動フォールバックし、
        // その際は web_search の代わりに googleSearch グラウンディングが有効になる
        // （出典も本文末尾に追記される）。応答は Anthropic 形式のため下流は変更不要。
        const response = await fetchAnthropic({
          model: CLAUDE_TEXT_MODEL,
          max_tokens: maxTokens,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        if (!response.ok) {
          controller.enqueue(encoder.encode(`data: {"type":"error","message":"APIエラー: ${response.status}"}\n\n`));
          controller.close();
          return;
        }

        const data = await response.json();
        const text = (data.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        const lines = text.split('\n');
        for (const line of lines) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }

        // 使用量を記録
        const usageInput = data.usage?.input_tokens ?? 0;
        const usageOutput = data.usage?.output_tokens ?? 0;
        await trackUsage({
          userId,
          featureKey: 'deepresearch',
          stepLabel: (topic ?? '').slice(0, 50),
          inputTokens: usageInput,
          outputTokens: usageOutput,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usageInput, output_tokens: usageOutput } })}\n\n`,
          ),
        );
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${error.message}"}\n\n`));
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
