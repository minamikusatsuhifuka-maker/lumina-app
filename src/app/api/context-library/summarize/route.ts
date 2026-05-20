import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SUMMARY_PROMPT = `以下のコンテキスト情報を、個人医療クリニックの読者（一般患者・家族）に向けて、わかりやすい言葉で要約してください。

# 出力要件
- 文字数: 500〜800字
- 構成: 「この情報は何か」「主要なポイント3〜5つ」「読者が次にすべきこと」
- 専門用語は必ず（）で平易な言い換えを併記
- 不安を煽らず、行動につながる前向きなトーン
- マークダウン記法（## 見出し、- 箇条書き）を使用
- 出力は本文のみ。前置きや「以下は要約です」などのメタコメントは不要

# 元コンテキスト
タイトル: {{title}}
タグ: {{tags}}

本文:
{{content}}`;

const DETAIL_PROMPT = `以下のコンテキスト情報を、個人医療クリニックの読者（一般患者・家族）に向けて、詳しく丁寧に解説する記事に再構成してください。

# 出力要件
- 文字数: 1500〜2500字
- 構成:
  ## 概要
  ## 詳細解説（複数の見出しに分割）
  ## よくある質問
  ## まとめ・次のアクション
- 専門用語は必ず（）で平易な言い換えを併記
- 読者が「自分ごと」として読めるよう、具体例や生活シーンに置き換える
- 不安を煽らず、安心・納得・前向きなトーン
- マークダウン記法（##/###/箇条書き）を使用
- 出力は本文のみ。前置きや「以下は詳細解説です」などのメタコメントは不要

# 元コンテキスト
タイトル: {{title}}
タグ: {{tags}}

本文:
{{content}}`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const body = await req.json();
    const { mode, title, content, tags } = body;

    if (mode !== 'summary' && mode !== 'detail') {
      return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });
    }

    const tagsStr = Array.isArray(tags) ? tags.join(', ') : '';
    const template = mode === 'summary' ? SUMMARY_PROMPT : DETAIL_PROMPT;
    const prompt = template
      .replace('{{title}}', title ?? '無題')
      .replace('{{tags}}', tagsStr)
      .replace('{{content}}', content);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const generated = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();

    return NextResponse.json({
      ok: true,
      generated,
      charCount: generated.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[context-library/summarize] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
