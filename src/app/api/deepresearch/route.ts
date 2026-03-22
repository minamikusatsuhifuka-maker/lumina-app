import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic, depth } = await req.json();

  const depthPrompts: Record<string, string> = {
    quick: '簡潔に3〜5つのポイントでまとめてください（500文字程度）',
    standard: '詳しく調査し、概要・主要ポイント・最新動向・まとめの構成で報告してください（1500文字程度）',
    deep: '徹底的に調査し、背景・現状・課題・事例・今後の展望・参考情報を含む詳細レポートを作成してください（3000文字以上）',
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
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `あなたは優秀なリサーチアナリストです。
与えられたトピックについてWebを複数回検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。
引用元は [出典: URL] の形式で明記してください。
事実と推測を明確に区別し、ハルシネーションを避けてください。`,
      messages: [{
        role: 'user',
        content: `以下のトピックについてリサーチレポートを作成してください。

トピック：${topic}
調査深度：${depthPrompts[depth || 'standard']}

レポートは以下の構成で作成してください：
# ${topic}

## 概要

## 主要ポイント

## 詳細分析

## 最新動向・トレンド

## まとめと活用アドバイス`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  return NextResponse.json({ report: text });
}
