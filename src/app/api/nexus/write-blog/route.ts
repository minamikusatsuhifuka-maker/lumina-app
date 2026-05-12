import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const BLOG_SYSTEM_PROMPT = `あなたはAIコンサル・コーチングの専門家ブランド「nexus」の
ブログライターです。
読者（個人事業主・経営者・自己成長を目指す人）に価値を届ける
高品質なブログ記事を執筆します。

【文体の特徴】
- 親しみやすく、でも専門的な信頼感がある
- 具体的な事例・数字・ストーリーを交える
- 読者への問いかけを自然に入れる
- 行動を促すCTAで締める

【SEOを意識した構成】
- H1タイトル（30〜50字、キーワードを含む）
- リード文（300字以内、要約＋読み続ける理由）
- H2見出し5〜7個（スキャン読みを意識）
- 各セクション200〜400字
- まとめ＋CTA
- 全体3000〜5000字`;

interface WriteBlogRequest {
  sourceType: 'theme' | 'research';
  theme?: string;
  researchText?: string;
  brandInfo?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: WriteBlogRequest;
  try {
    body = (await req.json()) as WriteBlogRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { sourceType, theme, researchText, brandInfo } = body;

  if (sourceType !== 'theme' && sourceType !== 'research') {
    return new Response('Invalid sourceType', { status: 400 });
  }
  if (sourceType === 'theme' && !theme?.trim()) {
    return new Response('themeが必要です', { status: 400 });
  }
  if (sourceType === 'research' && !researchText?.trim()) {
    return new Response('researchTextが必要です', { status: 400 });
  }

  const clinicPrompt = await getClinicSystemPrompt('blog', userId);

  const brandJson = brandInfo
    ? JSON.stringify(brandInfo)
    : 'AIコンサル・コーチングブランド';

  const userPrompt =
    sourceType === 'research'
      ? `以下のリサーチ内容を元に、nexusブランドのブログ記事を執筆してください。

【ブランド情報】
${brandJson}

【リサーチ内容】
${researchText?.slice(0, 4000) ?? ''}

【執筆指示】
1. リサーチ内容の重要なポイントを分かりやすく解説する記事にする
2. 読者がすぐに実践できる内容を含める
3. nexusのサービス・コーチングへの自然な導線を末尾に入れる
4. SEOタイトル候補を記事末尾に3つ提示する

記事を全文執筆してください。`
      : `以下のテーマでnexusブランドのブログ記事を執筆してください。

【ブランド情報】
${brandJson}

【テーマ・キーワード】
${theme}

【執筆指示】
1. テーマに沿った実践的で価値ある内容
2. 読者の悩み・課題への共感から始める
3. 具体的な解決策・ステップを提示
4. nexusのサービスへの自然な導線を末尾に入れる
5. SEOタイトル候補を記事末尾に3つ提示する

記事を全文執筆してください。`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          stream: true,
          system: BLOG_SYSTEM_PROMPT + (clinicPrompt ? '\n\n' + clinicPrompt : ''),
          messages: [{ role: 'user', content: userPrompt }],
        });

        let usageInput = 0;
        let usageOutput = 0;
        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`,
              ),
            );
          }
          if (event.type === 'message_start' && event.message?.usage) {
            usageInput = event.message.usage.input_tokens ?? 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            usageOutput = event.usage.output_tokens ?? 0;
          }
        }
        await trackUsage({
          userId,
          featureKey: 'blog',
          stepLabel: sourceType === 'research' ? 'リサーチ連携' : 'テーマ執筆',
          inputTokens: usageInput,
          outputTokens: usageOutput,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usageInput, output_tokens: usageOutput } })}\n\n`,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
          ),
        );
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
