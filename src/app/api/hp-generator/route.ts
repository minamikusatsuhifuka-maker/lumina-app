import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { HP_WRITING_DESIGN, HP_AD_PROHIBITED } from '@/lib/hp-writing';
import { extractAnthropicText } from '@/lib/anthropic-text';
import { robustJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { companyName, industry, target, usp, tone, contextInfo } =
    await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 8000,
      system: `あなたはプロのウェブコピーライターです。
企業情報をもとに、HPの各セクションのコンテンツを生成してください。

${HP_WRITING_DESIGN}

${HP_AD_PROHIBITED}

必ずJSON形式のみで返答。マークダウン不要。

{
  "hero": {
    "headline": "キャッチコピー（20字以内）",
    "subheadline": "サブキャッチ（40字以内）",
    "description": "説明文（100字以内）",
    "cta": "CTAボタンテキスト"
  },
  "services": [
    { "title": "サービス名", "description": "説明（60字以内）", "icon": "絵文字" }
  ],
  "features": [
    { "title": "特徴名", "description": "説明（60字以内）" }
  ],
  "about": "会社概要文（150字以内）",
  "faq": [
    { "question": "質問", "answer": "回答（80字以内）" }
  ],
  "cta_section": {
    "headline": "CTAセクションのキャッチ",
    "description": "説明（60字以内）",
    "button": "ボタンテキスト"
  },
  "meta_description": "メタディスクリプション（120字以内）"
}`,
      messages: [{
        role: 'user',
        content: `会社名：${companyName}\n業種：${industry}\nターゲット：${target}\n強み・USP：${usp}\nトーン：${tone ?? '親しみやすくプロフェッショナル'}\n\n上記の情報をもとにHP全セクションのコンテンツを生成してください。${
          contextInfo ? `\n\n【参考背景情報】\n${contextInfo}` : ''
        }`,
      }],
    }),
  });

  const data = await response.json();
  const text = extractAnthropicText(data.content);

  try {
    return NextResponse.json(robustJsonParse(text));
  } catch {
    return NextResponse.json({ error: 'パース失敗' }, { status: 500 });
  }
}
