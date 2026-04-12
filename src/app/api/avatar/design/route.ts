import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { age, gender, occupation, personality, appearance, fashion, background, expertise } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!occupation && !expertise) {
    return NextResponse.json({ error: '職業または専門分野は必須です' }, { status: 400 });
  }

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
        max_tokens: 3000,
        system: `あなたはSNSアバターデザインの専門家です。ユーザーの入力情報をもとに、魅力的なアバターキャラクターを設計してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "avatar_name": ["候補名1", "候補名2", "候補名3"],
  "master_prompt": {
    "midjourney": "Midjourney用のプロンプト（英語）",
    "stable_diffusion": "Stable Diffusion用のプロンプト（英語）",
    "dalle": "DALL-E用のプロンプト（英語）",
    "seed_note": "一貫性を保つためのシード設定メモ"
  },
  "scene_prompts": [
    {
      "scene": "シーン名",
      "prompt_suffix": "シーン固有のプロンプト追記（英語）",
      "use_case": "このシーンの使用場面"
    }
  ],
  "consistency_tips": ["一貫性のコツ1", "一貫性のコツ2"],
  "character_sheet": {
    "full_name": "フルネーム",
    "age": "年齢",
    "occupation": "職業",
    "location": "活動拠点",
    "hobbies": ["趣味1", "趣味2"],
    "values": "大切にしている価値観",
    "dream": "夢・目標"
  }
}

scene_promptsは5つ生成してください。consistency_tipsは3〜5個生成してください。`,
        messages: [{
          role: 'user',
          content: `以下の情報でSNSアバターをデザインしてください。

年齢: ${age || '指定なし'}
性別: ${gender || '指定なし'}
職業: ${occupation || '指定なし'}
性格: ${personality || '明るく社交的'}
外見: ${appearance || '指定なし'}
ファッション: ${fashion || '指定なし'}
背景・世界観: ${background || '現代日本'}
専門分野: ${expertise || '指定なし'}`,
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
    return NextResponse.json({ error: `アバター設計に失敗しました: ${msg}` }, { status: 500 });
  }
}
