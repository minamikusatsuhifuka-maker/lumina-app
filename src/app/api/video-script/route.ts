import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 180;

const PLATFORM_GUIDELINES: Record<string, string> = {
  youtube: 'YouTube向け（長尺対応、SEOを意識したタイトル・説明文、チャプター分け推奨）',
  reels: 'Instagram Reels向け（縦型、15〜90秒、冒頭3秒のフック重要、トレンドハッシュタグ）',
  shorts: 'YouTube Shorts向け（縦型、60秒以内、テンポ重視、ループ再生を意識）',
  presentation: 'プレゼンテーション向け（スライド構成、論理的な流れ、ビジュアルノート付き）',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { topic, platform, duration, tone, sourceContent } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!topic || !platform) {
    return NextResponse.json({ error: 'トピックとプラットフォームは必須です' }, { status: 400 });
  }

  const platformGuide = PLATFORM_GUIDELINES[platform] || PLATFORM_GUIDELINES.youtube;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: `あなたはプロの動画スクリプトライターです。
指定されたプラットフォームとトーンに合わせた動画スクリプトを作成してください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "title": "動画タイトル",
  "thumbnail_text": "サムネイルに入れるテキスト（短く、インパクトのある文言）",
  "hook": "冒頭のフック（視聴者の興味を引く最初の一言、3〜5秒分）",
  "sections": [
    {
      "heading": "セクション見出し",
      "script": "読み上げ原稿",
      "visual_note": "映像・スライドの演出指示",
      "duration_sec": セクションの秒数
    }
  ],
  "cta": "動画最後のCTA（チャンネル登録・フォロー促進など）",
  "hashtags": ["関連ハッシュタグの配列"],
  "description": "動画の説明文",
  "tips": ["撮影・編集のコツの配列"]
}`,
        messages: [{
          role: 'user',
          content: `以下の条件で動画スクリプトを作成してください。

プラットフォーム: ${platformGuide}
トピック: ${topic}
目標尺: ${duration || '指定なし'}
トーン: ${tone || '自然体'}
${sourceContent ? `\n参考情報:\n${sourceContent}` : ''}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '{}';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI応答のパースに失敗しました' }, { status: 500 });
    }
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `スクリプト生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
