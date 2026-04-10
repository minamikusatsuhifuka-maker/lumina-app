import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text, targetLang } = await req.json();

  const langMap: Record<string, string> = {
    en: '英語（English）',
    zh: '中国語・簡体字（中文简体）',
    ko: '韓国語（한국어）',
    fr: 'フランス語（Français）',
    es: 'スペイン語（Español）',
    de: 'ドイツ語（Deutsch）',
    pt: 'ポルトガル語（Português）',
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `あなたはプロフェッショナルな翻訳者です。
与えられたテキストを自然で流暢な${langMap[targetLang]}に翻訳してください。
文体・トーン・段落構成を原文に合わせて保持してください。
翻訳のみを出力し、説明や注釈は不要です。`,
      messages: [{ role: 'user', content: text }],
    }),
  });

  const data = await response.json();
  const translated = data.content?.[0]?.text || '';
  return NextResponse.json({ translated });
}
