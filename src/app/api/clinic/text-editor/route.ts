export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const PURPOSE_PROMPTS: Record<string, string> = {
  patient:    '患者さんが読む文章として、専門用語を避け、温かく分かりやすい言葉で書き直してください。',
  official:   '就業規則・公式文書として、法的に明確で正確な表現に書き直してください。',
  manual:     'スタッフマニュアルとして、誰でも同じ行動ができるよう具体的・手順的な表現に書き直してください。',
  philosophy: '院長の哲学（ティール組織・先払い・リードマネジメント・同心円成長・実評価）を反映した、心に響く言葉に書き直してください。',
  simple:     '同じ意味を保ちながら、より簡潔・シンプルな表現に書き直してください。',
  warm:       '読む人が温かみと親しみを感じるよう、柔らかく人間味のある表現に書き直してください。',
  recruit:    '採用・求人文書として、クリニックの魅力と理念が伝わる表現に書き直してください。',
  teal:       'スタッフ一人ひとりが主役であることを伝える、ティール組織の文化を体現した文章に書き直してください。',
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが未設定' }, { status: 500 });

  try {
    const { selectedText, purpose } = await req.json();

    if (!selectedText?.trim()) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    // テキストを1500文字に制限
    const truncated = selectedText.slice(0, 1500);
    const purposePrompt = PURPOSE_PROMPTS[purpose] || PURPOSE_PROMPTS.simple;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `あなたはLUMINAクリニックの文書改善AIです。院長の哲学：ティール組織・先払い・実評価・リードマネジメント。修正した文章のみを返してください。説明不要。`,
        messages: [{
          role: 'user',
          content: `以下の文章を${purposePrompt}\n\n【修正対象】\n${truncated}\n\n修正後の文章のみ返してください。`,
        }],
      }),
    });

    const data = await response.json();
    const revised = data.content?.[0]?.text || '';
    return NextResponse.json({ revised });

  } catch (e: any) {
    console.error('text-editor error:', e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
