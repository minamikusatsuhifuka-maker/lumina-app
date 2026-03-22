import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { topic, depth } = await req.json();
    if (!topic?.trim()) {
      return NextResponse.json({ error: 'トピックが必要です' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    const depthPrompts: Record<string, string> = {
      quick: '簡潔に3〜5つのポイントでまとめてください（500文字程度）',
      standard: '詳しく調査し、概要・主要ポイント・最新動向・まとめの構成で報告してください（1500文字程度）',
      deep: '徹底的に調査し、背景・現状・課題・事例・今後の展望を含む詳細レポートを作成してください（2000文字程度）',
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `あなたは優秀なリサーチアナリストです。
与えられたトピックについてWebを検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。
引用元は [出典: サイト名](URL) の形式で明記してください。
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
## まとめと活用アドバイス

各情報の引用元URLを必ず記載してください。`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `APIエラー: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    return NextResponse.json({ report: text });

  } catch (error: any) {
    console.error('[deepresearch] Error:', error);
    return NextResponse.json({ error: `エラー: ${error.message}` }, { status: 500 });
  }
}
