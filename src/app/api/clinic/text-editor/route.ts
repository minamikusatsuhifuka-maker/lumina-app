import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 30;

const sql = neon(process.env.DATABASE_URL!);

const PURPOSE_PROMPTS: Record<string, string> = {
  patient: '患者さんが読む文章として、専門用語を避け、温かく分かりやすい言葉で書き直してください。不安を和らげ、安心感を与える表現を心がけてください。',
  official: '就業規則・公式文書として、法的に明確で正確な表現に書き直してください。曖昧な表現を排除し、具体的で客観的な文章にしてください。',
  manual: 'スタッフマニュアルとして、誰が読んでも同じ行動ができるよう、具体的・手順的な表現に書き直してください。箇条書きや番号を活用してください。',
  philosophy: '院長の哲学（ティール組織・先払いの精神・リードマネジメント・同心円成長・実評価）を反映した、スタッフの心に響く言葉に書き直してください。',
  simple: '同じ意味を保ちながら、より簡潔・シンプルな表現に書き直してください。冗長な表現を削り、要点を明確にしてください。',
  warm: '読む人が温かみと親しみを感じるよう、柔らかく人間味のある表現に書き直してください。堅い言葉を避け、寄り添うトーンにしてください。',
  recruit: '採用・求人文書として、クリニックの魅力と理念が伝わり、共感できる人材に響く表現に書き直してください。',
  teal: 'スタッフ一人ひとりが主役であることを伝える、ティール組織の文化を体現した文章に書き直してください。管理・命令の言葉を避け、自律・信頼・成長の言葉を使ってください。',
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが未設定' }, { status: 500 });

  try {
    const { selectedText, purpose, fullContext } = await req.json();

    if (!selectedText?.trim()) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    const purposePrompt = PURPOSE_PROMPTS[purpose] || PURPOSE_PROMPTS.simple;

    // クリニック理念を取得（軽量）
    let philosophySnippet = '';
    try {
      const rows = await sql`SELECT content FROM clinic_philosophies WHERE is_active = true LIMIT 2`;
      philosophySnippet = rows.map((r: any) => r.content).join(' ').slice(0, 300);
    } catch {}

    const systemPrompt = `あなたはLUMINAクリニックの文書改善AIです。
院長の哲学：ティール組織・先払い・実評価（実行・実績・実力・誠実）・リードマネジメント
${philosophySnippet ? `クリニックの理念：${philosophySnippet}` : ''}

修正した文章のみを返してください。説明・前置き・コメントは一切不要です。`;

    const userPrompt = `以下の文章を${purposePrompt}

【修正対象の文章】
${selectedText}

${fullContext ? `【文章全体の文脈（参考）】\n${fullContext.slice(0, 500)}` : ''}

修正後の文章のみを返してください。`;

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await response.json();
    const revised = data.content?.[0]?.text || '';
    return NextResponse.json({ revised });

  } catch (e) {
    console.error('text-editor error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
