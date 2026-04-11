import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 180;

const PLATFORM_GUIDES: Record<string, string> = {
  instagram: `Instagram投稿:
- キャプション最大2200文字（推奨300〜500文字）
- ハッシュタグ5〜15個（大中小のミックス）
- 改行と絵文字で読みやすく
- CTA（行動喚起）を含める
- カルーセル投稿の場合は1枚目をフック画像に`,
  twitter: `X（Twitter）投稿:
- 1投稿140文字以内（日本語）
- スレッド形式も可
- ハッシュタグ2〜3個（控えめ）
- リプライを誘う問いかけ形式が効果的
- 引用RTされやすいワンフレーズを含める`,
  instagram_reel: `Instagram Reels:
- フック（最初の1秒）が最重要
- 台本形式で出力（セリフ+画面指示）
- 15〜90秒の構成
- トレンド音楽の提案を含める
- テキストオーバーレイの指示を付ける`,
  threads: `Threads投稿:
- 500文字以内の本文
- 会話調・カジュアルな文体
- ハッシュタグ少なめ（0〜3個）
- コミュニティとの対話を意識
- 共感や議論を呼ぶテーマが効果的`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const {
    avatarName, avatarPersonality, avatarExpertise, avatarTone,
    avatarCatchphrase, platform, topic, postType, count,
  } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!avatarName || !topic) {
    return NextResponse.json({ error: 'アバター名とトピックは必須です' }, { status: 400 });
  }

  const platformGuide = PLATFORM_GUIDES[platform] || PLATFORM_GUIDES.instagram;

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
        system: `あなたはSNSマーケティングの専門家で、アバターキャラクターの投稿を代筆します。

アバター設定:
- 名前: ${avatarName}
- 性格: ${avatarPersonality || '明るく親しみやすい'}
- 専門分野: ${avatarExpertise || 'ライフスタイル'}
- 口調: ${avatarTone || 'カジュアル'}
- 決めゼリフ: ${avatarCatchphrase || ''}

プラットフォームガイド:
${platformGuide}

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "posts": [
    {
      "post_num": 1,
      "type": "投稿タイプ（通常/カルーセル/ストーリー/リール台本）",
      "content": "投稿本文",
      "hashtags": ["タグ1", "タグ2"],
      "image_prompt": "Midjourney/DALL-Eで使える画像生成プロンプト（英語）",
      "best_time": "推奨投稿時間帯",
      "expected_engagement": "期待されるエンゲージメント（高/中/低）と理由"
    }
  ],
  "series_plan": "この投稿をシリーズ化する場合の3回分の展開案",
  "avatar_voice_guide": "このアバターの一貫した発信スタイルガイド（100文字程度）"
}`,
        messages: [{
          role: 'user',
          content: `以下の条件で${count || 3}個の投稿を作成してください。

プラットフォーム: ${platform || 'instagram'}
トピック: ${topic}
投稿タイプ: ${postType || '通常投稿'}`,
        }],
      }),
    });

    const data = await response.json();
    let text = data.content?.[0]?.text ?? '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `投稿生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
