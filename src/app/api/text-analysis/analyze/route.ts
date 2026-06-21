import { NextRequest } from 'next/server';
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
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AnalyzeRequest {
  text: string;
  type: AnalysisType;
  purpose?: string;
  targetLength?: string;
  // AIモデル選択（claude / gemini）。未指定なら claude
  model?: AIModel;
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
    model = 'claude',
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

  // 出力フォーマット指示: LaTeX/数式記法を禁止し矢印等はプレーン記号で（生表示 $\rightarrow$ 防止）
  const formatInstruction =
    `\n\n【出力フォーマット】LaTeX や数式記法（$...$ や \\rightarrow など）は使わないでください。` +
    `矢印は → ← ↔ ⇒ ⇔、四則は × ÷ ・、比較は ≤ ≥ ≠ ≈ ± のようにプレーンな Unicode 記号で書き、` +
    `装飾は Markdown（見出し・太字・箇条書き・表）のみで行ってください。`;

  const systemPromptBase =
    basePrompt + purposeInstruction + lengthInstruction + gensparkInstruction + formatInstruction;

  // クリニック背景情報を末尾に注入
  const clinicContext = await getClinicSystemPrompt('text_analysis', userId);
  const systemPrompt =
    systemPromptBase + (clinicContext ? `\n\n${clinicContext}` : '');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        // streamWithModel は format='delta' で {type:'delta', text:...} を流す（既存クライアント互換）
        // max_tokens 16000 維持
        const usage = await streamWithModel(
          model,
          text,
          systemPrompt,
          controller,
          encoder,
          16000,
          'delta',
        );
        await trackUsage({
          userId,
          featureKey: 'text_analysis',
          stepLabel: type,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } })}\n\n`,
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
