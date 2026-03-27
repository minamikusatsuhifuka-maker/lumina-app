import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { query, mode } = await req.json();

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      // Perplexity APIキーがない場合はClaude Web Searchにフォールバック
      return NextResponse.json({ error: 'PERPLEXITY_API_KEY未設定', fallback: true }, { status: 200 });
    }

    const systemPrompts: Record<string, string> = {
      news: '最新ニュースと時事情報を収集し、重要度順にまとめてください。各情報の出典を明記してください。',
      sns: 'SNS・Twitter・Redditでのトレンドと反応を収集し、バズっている理由を分析してください。',
      market: '市場動向・競合情報・業界トレンドを収集し、ビジネスインサイトをまとめてください。',
      academic: '学術論文・研究結果・エビデンスを収集し、科学的知見をまとめてください。',
    };

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompts[mode || 'news'] },
          { role: 'user', content: query },
        ],
        return_citations: true,
        return_related_questions: true,
      }),
    });

    const data = await response.json();
    return NextResponse.json({
      result: data.choices?.[0]?.message?.content || '',
      citations: data.citations || [],
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
