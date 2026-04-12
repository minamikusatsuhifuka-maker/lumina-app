import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

const SCORE_PROMPTS: Record<string, string> = {
  handbook: `採点基準：内発的動機・インサイドアウトの視点があるか、先払い哲学があるか、スタッフが主役として描かれているか、リードマネジメントの要素があるか、ティール組織の精神があるか`,
  staff: `採点基準：読んで行動したくなるか、温かさ・親しみやすさがあるか、伝えたいことが明確か、スタッフへの敬意が感じられるか、チームの一体感を高めるか`,
  patient: `採点基準：わかりやすさ（専門用語が少ないか）、不安を取り除く表現があるか、信頼感・安心感を与えるか、次の行動（来院・相談等）を促しているか`,
  recruit: `採点基準：クリニックの魅力が伝わるか、一緒に働きたいと思えるか、理念・文化が伝わるか、応募者が自分をイメージできるか、正直さ・誠実さが感じられるか`,
  message: `採点基準：院長の人間性・温かさが伝わるか、理念の深さが感じられるか、読んで会いたくなるか、信頼感があるか、クリニックへの誇りが感じられるか`,
};

const PURPOSE_LABELS: Record<string, string> = {
  handbook: 'ハンドブック・マニュアル',
  staff: 'スタッフへのお知らせ・連絡文',
  patient: '患者向け説明文・案内文',
  recruit: '採用・求人文書',
  message: '院長メッセージ・ご挨拶文',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text, purpose, purposeLabel, customPurpose } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const scorePrompt = customPurpose
    ? `採点基準：「${customPurpose}」という目的に対して、以下の観点で採点してください：
    - 目的が明確に伝わるか
    - 読み手に響くか・行動を促すか
    - クリニックの理念・温かさが感じられるか
    - 表現のわかりやすさ・自然さ
    - 全体的な完成度`
    : SCORE_PROMPTS[purpose] || SCORE_PROMPTS.staff;

  const systemPrompt = await buildSystemContext(
    `あなたはクリニックの文章専門家です。文章を目的に応じて採点してください。`,
    'philosophy'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下の文章を「${purposeLabel || PURPOSE_LABELS[purpose] || purpose}」として採点してください。

【文章】
${text}

${scorePrompt}

必ず以下のJSON形式のみで返してください：
{
  "score": 72,
  "reason": "（総評を2文で）",
  "points": ["（改善ポイント①）", "（改善ポイント②）", "（改善ポイント③）"]
}`,
      }],
    }),
  });

  const data = await response.json();
  const resultText = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  try {
    const json = JSON.parse(resultText.replace(/```json|```/g, '').trim());
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ score: 0, reason: '採点に失敗しました。', points: [] });
  }
}
