import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const {
    original,        // 元の章内容
    improved,        // 現在の改善案
    templateLabel,   // テンプレート名
    improvePoints,   // 選択された改善点（string[]）
    targetScore,     // 目標スコア（デフォルト90）
  } = await req.json();

  const improvePointsText = (improvePoints as string[]).join('\n- ');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `あなたはクリニックのハンドブック文章の専門ライターです。
以下の【現在の改善案】を、指摘された【改善すべき点】をすべて解決して
${targetScore ?? 90}点超えの文章に書き直してください。

【テンプレート】
${templateLabel}

【元の文章（参考）】
${original}

【現在の改善案】
${improved}

【必ず解決すべき改善点】
- ${improvePointsText}

## 書き直しの条件
- テンプレート「${templateLabel}」の方向性は維持すること
- 改善点をすべて具体的に解決すること
- クリニック理念（ティール組織・リードマネジメント・インサイドアウト・先払い哲学）との一致度を高めること
- スタッフが自分ごととして読める文章にすること
- 元の文章構成（見出し・セクション）は維持すること

書き直した文章のみを出力してください。前置き・説明・コードブロック不要。`,
      },
    ],
  });

  const rewritten = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ rewritten });
}
