import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { generateWithModel, type AIModel } from '@/lib/ai-client';

export const maxDuration = 300;

// バッチリサーチジョブを実行するAPI（SSEで進捗をストリーム）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Cronからの内部呼び出しか、ユーザーセッションを許可
  const session = await auth();
  // CRON_SECRET未設定時に "Bearer undefined" で一致しないようガード
  const cronAuth = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!session && !cronAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY未設定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // リクエスト body から model を受け取る（cron や旧クライアントは body 空の可能性あり）
  let model: AIModel = 'gemini';
  try {
    const reqBody = await req.json().catch(() => null);
    if (reqBody && (reqBody.model === 'claude' || reqBody.model === 'gemini')) {
      model = reqBody.model;
    }
  } catch {}

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return new Response(JSON.stringify({ error: '無効なジョブID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // ジョブ取得（cronのときは user_id チェックなし、user セッションのときは所有者チェック）
  let jobRows;
  if (session) {
    const userId = (session.user as any).id;
    jobRows = await sql`SELECT * FROM batch_research_jobs WHERE id = ${jobId} AND user_id = ${userId}`;
  } else {
    jobRows = await sql`SELECT * FROM batch_research_jobs WHERE id = ${jobId}`;
  }

  const job = jobRows[0];
  if (!job) {
    return new Response(JSON.stringify({ error: 'ジョブが見つかりません' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // running状態でも updated_at から5分以上経過していれば孤児ジョブとして再開可能にする
  if (job.status === 'running') {
    const lastUpdate = job.updated_at ? new Date(job.updated_at).getTime() : 0;
    const stuckMs = Date.now() - lastUpdate;
    if (stuckMs < 5 * 60 * 1000) {
      return new Response(JSON.stringify({ error: '既に実行中です' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 5分以上スタック → 再開を許可
    console.log(`[batch-research run] スタック検出 (${Math.round(stuckMs / 1000)}秒)、再開します`);
  }

  await sql`
    UPDATE batch_research_jobs
    SET status = 'running',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = ${jobId}
  `;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const topics: Array<{
          topic: string;
          mode: string;
          status: string;
          result: string | null;
          contextText: string | null;
        }> = job.topics;

        // 完了済みインデックスを集計（既存の topics.status から再構築）
        const completedIndices = new Set<number>(
          topics
            .map((t, i) => (t.status === 'completed' ? i : -1))
            .filter((i) => i >= 0),
        );
        const failedIndices = new Set<number>(
          topics
            .map((t, i) => (t.status === 'failed' ? i : -1))
            .filter((i) => i >= 0),
        );

        send({
          type: 'start',
          total: topics.length,
          completedCount: completedIndices.size,
        });

        if (completedIndices.size > 0) {
          send({
            type: 'resume',
            message: `${completedIndices.size}件完了済み・残り${topics.length - completedIndices.size}件を続きから実行します`,
            completed: completedIndices.size,
            total: topics.length,
          });
        }

        for (let i = 0; i < topics.length; i++) {
          const item = topics[i];

          // 完了済みはスキップ（再開対応）
          if (completedIndices.has(i)) {
            send({
              type: 'topic_skip',
              index: i,
              topic: item.topic,
              reason: 'completed',
            });
            continue;
          }

          // failed状態のものは再試行する（クリアして再実行）
          failedIndices.delete(i);
          send({ type: 'topic_start', index: i, topic: item.topic });

          try {
            const modeTokens: Record<string, number> = {
              quick: 1500,
              standard: 3000,
              deep: 5000,
            };
            const targetChars = modeTokens[item.mode] ?? 3000;

            const researchPrompt = `以下のトピックについて、${targetChars}字程度で詳しく調査・解説してください。
必ず最後に「まとめ・結論」セクションを書いて締めくくってください。
途中で終わらず最後まで完結させてください。

# 情報収集ルール（必須）
- 必ずWeb検索を実行し、検索結果で確認できた情報に基づいて書くこと（学習時の知識だけを「最新情報」として書くことは禁止）
- 各情報の引用元を「出典: サイト名 https://URL」の形式で記載すること（生のURLのみ・Markdownリンク記法禁止）
- Web検索で確認できなかった事項は、推測や作文で埋めずに「Web検索では確認できなかった」と明記すること

# トピック
${item.topic}

# 構成
## はじめに
## 背景と概要
## 詳細解説
## 実践・活用方法
## まとめ・結論`;

            // ディープリサーチ実行（model に応じて Claude / Gemini を切替・Web検索グラウンディング有効）
            const researchMaxTokens = Math.max(targetChars + 2000, 4000);
            const researchResult = await generateWithModel(
              model,
              researchPrompt,
              undefined,
              researchMaxTokens,
              undefined,
              true, // webSearch: 実検索に基づかない「最新風の古い内容」を防ぐ
            );

            send({ type: 'research_done', index: i, topic: item.topic });

            // コンテキスト最適化
            const today = new Date().toISOString().slice(0, 10);
            const contextPrompt = `以下のリサーチ結果を、AIに読み込ませる背景情報コンテキストとして再構造化してください。
Markdown形式のみで出力（前置き・後書き不要）。

# 体裁ルール（記憶に残りやすく）
- 見出しは ## までにとどめる（###/#### は使わない／階層を深くしない）
- 各セクションは箇条書き中心で簡潔に。重要語は **太字** で強調する
- 絵文字見出しは下記の所定のものだけ。区切りを増やしすぎない

# 元のリサーチトピック
${item.topic}

# 元のリサーチテキスト
${researchResult}

---

# 出力フォーマット

# ${item.topic} - AI背景情報コンテキスト
生成日: ${today}

## 🧠 ひとことで言うと
（この内容を1文で。最も記憶に残る要点）

## 📌 エグゼクティブサマリー（3行以内）

## 🎯 核心ファクト（箇条書き10項目以内・重要語は**太字**）

## 💡 重要なインサイト

## 📊 データ・数値・事例

## ⚠️ 注意点・制約・反論

## 🔑 キーワード・専門用語

## 📝 このコンテキストの活用方法
- 文章作成
- SNS投稿
- LP作成
- お役立ちコラム
- 資料作成`;

            // コンテキスト最適化（model に応じて Claude / Gemini を切替）
            const contextText = await generateWithModel(
              model,
              contextPrompt,
              undefined,
              4000,
            );

            // AI タイトル自動生成（失敗・タイムアウト時は入力トピック名にフォールバック）
            let savedTopic = item.topic;
            try {
              const aiTitle = await generateBatchTitle(
                researchResult,
                item.topic,
                8000,
              );
              if (aiTitle && aiTitle.trim().length > 0 && aiTitle !== item.topic) {
                savedTopic = aiTitle.trim();
              }
            } catch (titleErr) {
              console.warn(
                `[batch-research run] AIタイトル生成失敗 (item ${i}):`,
                titleErr,
              );
            }

            // 1000字要約生成（失敗時は null、コンテキストは無変更で保存）
            const summaryText = await generateBatchSummary(
              researchResult,
              savedTopic,
              model,
              15000,
            );

            // 要約をコンテキストの冒頭に統合（要約なしなら既存通りコンテキストのみ）
            const combinedContext = summaryText
              ? `## 📋 要約（1000字以内）\n\n${summaryText}\n\n---\n\n## 📚 詳細コンテキスト\n\n${contextText}`
              : contextText;

            // コンテキストライブラリに保存（バッチタグ付き）
            await sql`
              INSERT INTO context_saves (user_id, topic, context_text, research_text, tags)
              VALUES (
                ${job.user_id},
                ${savedTopic},
                ${combinedContext},
                ${researchResult},
                ${[`batch:${jobId}`, `group:${job.group_name}`]}
              )
            `;

            topics[i] = {
              ...item,
              status: 'completed',
              result: researchResult,
              contextText,
            };
            completedIndices.add(i);
            send({
              type: 'topic_done',
              index: i,
              topic: item.topic,
              completed: completedIndices.size,
              total: topics.length,
              progress: Math.round((completedIndices.size / topics.length) * 100),
            });
          } catch (err: any) {
            console.error(`[batch-research run] topic ${i} エラー:`, err);
            topics[i] = {
              ...item,
              status: 'failed',
              result: String(err?.message || err),
              contextText: null,
            };
            failedIndices.add(i);
            send({
              type: 'topic_error',
              index: i,
              topic: item.topic,
              error: String(err?.message || err),
            });
            // エラーでも続行（次のトピックへ）
          }

          // 進捗をDBに保存（completed_indices/failed_indicesも更新）
          await sql`
            UPDATE batch_research_jobs SET
              topics = ${JSON.stringify(topics)},
              completed_indices = ${Array.from(completedIndices)}::integer[],
              failed_indices = ${Array.from(failedIndices)}::integer[],
              last_completed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${jobId}
          `.catch((dbErr) => {
            console.error('[batch-research run] DB更新エラー:', dbErr);
          });
        }

        // 最終ステータスを判定（完全完了 / 一部エラー / 全失敗）
        const finalStatus =
          failedIndices.size === topics.length
            ? 'failed'
            : failedIndices.size > 0
              ? 'completed_with_errors'
              : 'completed';
        await sql`
          UPDATE batch_research_jobs
          SET status = ${finalStatus},
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${jobId}
        `;

        // メール通知（RESEND_API_KEYがある場合のみ）
        if (job.notify_email && process.env.RESEND_API_KEY) {
          try {
            await sendCompletionEmail(job.notify_email, job.group_name, topics, jobId);
          } catch (mailErr) {
            console.error('[batch-research run] メール通知失敗:', mailErr);
          }
        }

        send({
          type: 'all_done',
          success: finalStatus === 'completed',
          jobId,
          finalStatus,
          completedCount: completedIndices.size,
          failedCount: failedIndices.size,
          total: topics.length,
        });
      } catch (err: any) {
        console.error('[batch-research run] 全体エラー:', err);
        // 致命的なエラーは「paused」状態にして続きから再開できるようにする
        await sql`
          UPDATE batch_research_jobs
          SET status = 'paused', updated_at = NOW()
          WHERE id = ${jobId}
        `.catch(() => {});
        send({ type: 'error', message: String(err?.message || err) });
      } finally {
        try {
          controller.close();
        } catch {}
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

// AI でバッチ保存用タイトルを生成（タイムアウト + フォールバック付き）
// 既存 /api/text-analysis/generate-title と同じプロンプト方針
async function generateBatchTitle(
  text: string,
  fallback: string,
  timeoutMs: number,
): Promise<string> {
  const prompt =
    `以下のリサーチ記事の内容を表す、短くわかりやすいタイトルを1つだけ生成してください。\n\n` +
    `【条件】\n- 20〜40文字程度\n- 日本語\n- 内容の核心を一言で表す\n` +
    `- タイトルだけを出力し、説明・前置き・記号は不要\n\n` +
    `【記事（先頭2000文字）】\n${text.slice(0, 2000)}`;
  try {
    const titlePromise = generateWithModel('gemini', prompt, undefined, 500);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error('title generation timeout')),
        timeoutMs,
      ),
    );
    const raw = await Promise.race([titlePromise, timeoutPromise]);
    const title = raw
      .replace(/^["「『【]|["」』】]$/g, '')
      .replace(/\n/g, '')
      .trim()
      .slice(0, 50);
    return title || fallback;
  } catch {
    return fallback;
  }
}

// AI で 1000字以内の要約を生成（タイムアウト + フォールバック付き）
// 失敗・タイムアウト時は null を返し、呼び出し側はコンテキストに要約を追加せず保存する
async function generateBatchSummary(
  text: string,
  topic: string,
  model: AIModel,
  timeoutMs: number = 15000,
): Promise<string | null> {
  const prompt = `以下のリサーチ記事を1000字以内に要約してください。

【要件】
- 1000字以内
- 重要なポイントを網羅
- 箇条書きも活用してわかりやすく
- 専門用語があれば簡単な説明を併記
- 「要約：」「以下は要約です」のような前置きは不要、本文だけ

【トピック】
${topic}

【記事本文】
${text.slice(0, 6000)}`;

  try {
    const summaryPromise = generateWithModel(model, prompt, undefined, 2500);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error('summary generation timeout')),
        timeoutMs,
      ),
    );
    const raw = await Promise.race([summaryPromise, timeoutPromise]);
    const summary = raw.trim();
    return summary.length > 50 ? summary : null;
  } catch (e) {
    console.warn('[batch-research] summary generation failed:', e);
    return null;
  }
}

// 完了通知メール（Resend経由）
async function sendCompletionEmail(
  to: string,
  groupName: string,
  topics: Array<{ topic: string; status: string }>,
  jobId: number
) {
  const completedCount = topics.filter((t) => t.status === 'completed').length;
  const failedCount = topics.filter((t) => t.status === 'failed').length;

  const topicList = topics
    .map((t) => `- ${t.status === 'completed' ? '✅' : '❌'} ${t.topic}`)
    .join('\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'xLUMINA <noreply@xlumina.jp>',
      to,
      subject: `✅ バッチリサーチ完了：${groupName}`,
      text: `xLUMINA バッチリサーチが完了しました。

【グループ名】${groupName}
【結果】完了: ${completedCount}件 / 失敗: ${failedCount}件

【トピック別結果】
${topicList}

コンテキストライブラリで確認:
https://xlumina.jp/dashboard/context-library?batch=${jobId}`,
    }),
  });
}
