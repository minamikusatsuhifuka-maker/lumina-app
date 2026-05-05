import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

// バッチリサーチジョブを実行するAPI（SSEで進捗をストリーム）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Cronからの内部呼び出しか、ユーザーセッションを許可
  const session = await auth();
  const cronAuth = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
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
  if (job.status === 'running') {
    return new Response(JSON.stringify({ error: '既に実行中です' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await sql`
    UPDATE batch_research_jobs
    SET status = 'running', started_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}
  `;

  const client = new Anthropic({ apiKey });

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

        send({ type: 'start', total: topics.length });

        for (let i = 0; i < topics.length; i++) {
          const item = topics[i];
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

# トピック
${item.topic}

# 構成
## はじめに
## 背景と概要
## 詳細解説
## 実践・活用方法
## まとめ・結論`;

            // ディープリサーチ実行
            let researchResult = '';
            const researchStream = await client.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: Math.max(targetChars + 2000, 4000),
              stream: true,
              messages: [{ role: 'user', content: researchPrompt }],
            });

            for await (const event of researchStream as any) {
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                researchResult += event.delta.text || '';
              }
            }

            send({ type: 'research_done', index: i, topic: item.topic });

            // コンテキスト最適化
            const today = new Date().toISOString().slice(0, 10);
            const contextPrompt = `以下のリサーチ結果を、AIに読み込ませる背景情報コンテキストとして再構造化してください。
Markdown形式のみで出力（前置き・後書き不要）。

# 元のリサーチトピック
${item.topic}

# 元のリサーチテキスト
${researchResult}

---

# 出力フォーマット

# ${item.topic} - AI背景情報コンテキスト
生成日: ${today}

## 📌 エグゼクティブサマリー（3行以内）

## 🎯 核心ファクト（箇条書き10項目以内）

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

            let contextText = '';
            const contextStream = await client.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 4000,
              stream: true,
              messages: [{ role: 'user', content: contextPrompt }],
            });

            for await (const event of contextStream as any) {
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                contextText += event.delta.text || '';
              }
            }

            // コンテキストライブラリに保存（バッチタグ付き）
            await sql`
              INSERT INTO context_saves (user_id, topic, context_text, research_text, tags)
              VALUES (
                ${job.user_id},
                ${item.topic},
                ${contextText},
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
            send({ type: 'topic_done', index: i, topic: item.topic });
          } catch (err: any) {
            console.error(`[batch-research run] topic ${i} エラー:`, err);
            topics[i] = {
              ...item,
              status: 'failed',
              result: String(err?.message || err),
              contextText: null,
            };
            send({
              type: 'topic_error',
              index: i,
              topic: item.topic,
              error: String(err?.message || err),
            });
          }

          // 進捗をDBに保存
          await sql`
            UPDATE batch_research_jobs
            SET topics = ${JSON.stringify(topics)}, updated_at = NOW()
            WHERE id = ${jobId}
          `;
        }

        const allCompleted = topics.every((t) => t.status === 'completed');
        await sql`
          UPDATE batch_research_jobs
          SET status = ${allCompleted ? 'completed' : 'failed'},
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

        send({ type: 'all_done', success: allCompleted, jobId });
      } catch (err: any) {
        console.error('[batch-research run] 全体エラー:', err);
        await sql`
          UPDATE batch_research_jobs
          SET status = 'failed', updated_at = NOW()
          WHERE id = ${jobId}
        `;
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
