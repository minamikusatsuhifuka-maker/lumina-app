// オーケストレーター用の精細化ステップAPIで共通利用するハンドラ生成ヘルパー
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type PromptBuilder = (body: Record<string, unknown>) => string;

export const makeClaudeJsonHandler =
  (buildPrompt: PromptBuilder, maxTokens = 3000) =>
  async (req: NextRequest): Promise<NextResponse> => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    try {
      const body = (await req.json()) as Record<string, unknown>;
      const prompt = buildPrompt(body);
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      const firstBlock = response.content[0];
      const content =
        firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
      return NextResponse.json({
        content,
        // オーケストレーターがコスト計算するためトークン消費量を返す
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };

// 安全に文字列を取得（undefined等はデフォルト値に）
export const safeStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

export const safeNum = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
