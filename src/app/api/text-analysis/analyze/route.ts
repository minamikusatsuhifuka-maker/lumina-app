import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import {
  ANALYSIS_PROMPTS,
  AnalysisType,
  TARGET_OPTIONS,
  LEVEL_OPTIONS,
  PURPOSE_OPTIONS,
  TONE_OPTIONS,
  labelOf,
} from '@/lib/analysis-prompts';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface AnalyzeRequest {
  text: string;
  type: AnalysisType;
  purpose?: string;
  targetLength?: string;
  // Gensparkスライド設定（genspark_slideの場合のみ使用）
  gsTarget?: string;
  gsLevel?: string;
  gsPurpose?: string;
  gsTone?: string;
  gsNotes?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  const body = (await req.json()) as AnalyzeRequest;
  const {
    text,
    type,
    purpose,
    targetLength,
    gsTarget,
    gsLevel,
    gsPurpose,
    gsTone,
    gsNotes,
  } = body;

  if (!text || !type || !ANALYSIS_PROMPTS[type]) {
    return new Response('Bad Request', { status: 400 });
  }

  const basePrompt = ANALYSIS_PROMPTS[type];
  const lengthInstruction = targetLength
    ? `\n\n【出力文字数の目安】約${targetLength}文字程度でまとめてください。`
    : '';
  const purposeInstruction = purpose ? `\n\n目的: ${purpose}` : '';

  let gensparkInstruction = '';
  if (type === 'genspark_slide' && gsTarget) {
    gensparkInstruction =
      `\n\n【プレゼン設定】\n` +
      `- 聴講ターゲット: ${labelOf(TARGET_OPTIONS, gsTarget)}\n` +
      `- 内容レベル: ${labelOf(LEVEL_OPTIONS, gsLevel ?? '')}\n` +
      `- プレゼンの目的: ${labelOf(PURPOSE_OPTIONS, gsPurpose ?? '')}\n` +
      `- スライドのトーン: ${labelOf(TONE_OPTIONS, gsTone ?? '')}\n` +
      (gsNotes ? `- 追加要望: ${gsNotes}\n` : '');
  }

  const systemPromptBase =
    basePrompt + purposeInstruction + lengthInstruction + gensparkInstruction;

  // クリニック背景情報を末尾に注入
  const clinicContext = await getClinicSystemPrompt('text_analysis', userId);
  const systemPrompt =
    systemPromptBase + (clinicContext ? `\n\n${clinicContext}` : '');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }],
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
          featureKey: 'text_analysis',
          stepLabel: type,
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
