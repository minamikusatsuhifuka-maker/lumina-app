import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('ANTHROPIC_API_KEY未設定', { status: 500 });

  const client = new Anthropic({ apiKey });
  const { chapter, bookMeta, language, targetWordCount } = await req.json();

  const langInstruction = language === 'en'
    ? 'Write in English. Use natural, engaging English prose.'
    : '日本語で執筆してください。自然で読みやすい文体にしてください。';

  const prompt = `${langInstruction}

以下の書籍情報と章情報に基づいて、本文を執筆してください。

【書籍情報】
タイトル: ${bookMeta?.title ?? ''}
ターゲット: ${bookMeta?.targetAudience ?? ''}
ジャンル: ${bookMeta?.genre ?? ''}

【章情報】
第${chapter?.number ?? chapter?.chapterNumber ?? ''}章: ${chapter?.title ?? ''}
概要: ${chapter?.summary ?? ''}
目標文字数: ${targetWordCount ?? chapter?.targetWordCount ?? 3000}字
キーメッセージ: ${(chapter?.keyMessages ?? []).join('、')}
感情的フック: ${chapter?.emotionalHook ?? ''}

【執筆ルール】
1. 目標文字数に近づけて執筆する（±10%以内）
2. 冒頭でストーリーや問いかけで引き込む
3. 具体的な事例・データ・エビデンスを含める
4. ナッジ理論・損失回避・社会的証明を自然に組み込む
5. 各節の末尾に次節への「橋渡し」を入れる
6. 読了後に「行動したい」と思える締めにする
7. 見出し（##）を使って読みやすく構造化する

本文のみを出力してください（説明文・前置き不要）。`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step1: ディープリサーチ
        const researchResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `「${chapter?.title ?? ''}」について、以下を調査してください：
1. 関連する最新の研究・データ・統計
2. 権威ある文献・書籍の参照
3. 具体的な事例・成功例・失敗例
4. エビデンスベースの知見

JSON形式で出力：
{"research": "調査結果の要約", "references": [{"title": "文献名", "author": "著者", "year": 2024, "point": "引用ポイント"}], "keyData": ["データ1", "データ2"]}`,
          }],
        });

        const researchBlock = (researchResponse.content[0] as any);
        const researchText = researchBlock?.type === 'text' ? researchBlock.text : '';

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'research_done', research: researchText })}\n\n`
        ));

        // Step2: 本文生成（ストリーミング）
        const writeResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          stream: true,
          messages: [{
            role: 'user',
            content: prompt + `\n\n【参考リサーチ】\n${researchText}`,
          }],
        });

        for await (const event of writeResponse) {
          if (event.type === 'content_block_delta' && (event as any).delta?.type === 'text_delta') {
            const text = (event as any).delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err?.message || err) })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
