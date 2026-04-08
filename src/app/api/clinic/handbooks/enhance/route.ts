export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

const TEMPLATE_PROMPTS: Record<string, string> = {
  story: '【ストーリー型】読者が主人公になれるような物語形式で書いてください。「あなたがこのクリニックで働く一日」のような具体的なシーンから始め、理念や価値観が自然に伝わるよう構成してください。',
  mission: '【ミッション宣言型】力強く・簡潔に・記憶に残る形で書いてください。短い文の積み重ね、リズム感のある表現を使い、読んだ人が「これが私たちの使命だ」と感じられるよう書いてください。',
  dialogue: '【対話・問いかけ型】読者に問いかけながら進む形式で書いてください。「あなたはなぜ医療の仕事を選んだのですか？」のような問いから始め、自己内省を促しながら価値観へと導いてください。',
  warm: '【温かみ・共感型】スタッフへの感謝と敬意を込めた温かい文体で書いてください。「あなたの存在がクリニックを支えている」という視点を大切に、読んだ人が誇りと安心を感じられる表現にしてください。',
  concrete: '【具体的行動型】抽象的な理念を具体的な行動・場面に落とし込んでください。「〇〇な時、私たちは〇〇します」という行動基準の形式を使い、スタッフが迷った時の判断軸になるよう書いてください。',
  poetic: '【詩的・美しい表現型】読んで美しいと感じる、心に残る表現で書いてください。比喩・情景描写・余韻のある言葉を使い、クリニックの理念が一つの詩のように伝わるよう書いてください。',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { chapterContent, additionalNotes, mode, template, instruction, messages, chatMode: requestChatMode } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = rows[0]?.content || '';

  const baseSystem = await buildSystemContext(`あなたはクリニックのハンドブック編集の専門家です。
クリニックの理念：${philosophy}
理念に沿いながら、スタッフの心に響く・行動につながる文章を書いてください。`, 'handbook');

  let userPrompt = '';

  if (mode === 'evaluate') {
    userPrompt = `以下のハンドブックの章を評価し、改善アイデアを提示してください。

【現在の文章】
${chapterContent}

以下の形式で回答してください：

## 📊 現在の文章の評価
**良い点：**
- （具体的に）

**改善できる点：**
- （具体的に）

**心に響く度：** ⭐⭐⭐☆☆（5段階）
**明確さ：** ⭐⭐⭐⭐☆
**行動につながる度：** ⭐⭐☆☆☆

## 💡 改善アイデア
1. （具体的な改善提案①）
2. （具体的な改善提案②）
3. （具体的な改善提案③）

## ✨ 一言コメント
（この章全体への総評を3文で）`;
  } else if (mode === 'enhance') {
    userPrompt = `以下の【現在の文章】に【追記したい内容】を組み込み、心に響く・行動につながるハンドブックの文章として書き直してください。

【現在の文章】
${chapterContent}

【追記したい内容】
${additionalNotes}

書き直した文章のみ返してください。説明は不要です。`;
  } else if (mode === 'template') {
    userPrompt = `以下の文章を、指定のスタイルで書き直してください。

【現在の文章】
${chapterContent}

【書き方のスタイル】
${TEMPLATE_PROMPTS[template] || TEMPLATE_PROMPTS.warm}

書き直した文章のみ返してください。`;
  } else if (mode === 'rewrite') {
    userPrompt = `【現在の文章】
${chapterContent}

【指示】
${instruction}

指示に従って書き直した文章のみ返してください。`;
  } else if (mode === 'chat') {
    const chatMessages = messages || [];
    const chatMode = requestChatMode || 'propose';

    let systemAddition = '';
    if (chatMode === 'propose') {
      systemAddition = `あなたは院長の相談相手です。院長が「こうしたい」「こんな気持ちを伝えたい」と話しかけてきます。
具体的な改善案を2〜3パターン提示し、「どれが近いですか？」と問いかけてください。
改善案はそれぞれ【案①】【案②】の形で提示し、実際の文章サンプルを含めてください。`;
    } else if (chatMode === 'analyze') {
      systemAddition = `あなたはハンドブック品質分析の専門家です。
以下の観点で章を分析し、具体的な改善点を指摘してください：
1. 📖 読みやすさ（難しい言葉・長すぎる文章はないか）
2. 💡 具体性（抽象的すぎて行動につながらない部分はないか）
3. ❤️ 温かみ（スタッフの心に響く表現になっているか）
4. 🔄 一貫性（理念・他の章との矛盾はないか）
5. ✅ 完全性（重要な情報の抜けはないか）
各観点を★5段階で評価し、具体的な改善提案を添えてください。`;
    } else {
      systemAddition = `あなたは院長の文章パートナーです。会話の流れを理解し、
院長が「もっとこうしたい」「この部分が気になる」と言ったら、具体的な修正案を提示してください。
院長が承認したら「では本文を更新します：\n---\n（完成した文章）\n---」の形式で返してください。`;
    }

    const chatSystemPrompt = await buildSystemContext(
      `${systemAddition}\n\n【現在編集中の章の内容】\n${chapterContent || '（まだ内容がありません）'}`,
      'handbook'
    );

    const chatResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: chatSystemPrompt,
        messages: chatMessages.length > 0 ? chatMessages : [{ role: 'user', content: chapterContent ? 'この章を分析してください。' : 'こんにちは' }],
      }),
    });

    const chatData = await chatResponse.json();
    const chatResult = (chatData.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return NextResponse.json({ result: chatResult });
  } else {
    return NextResponse.json({ error: '不正なmode' }, { status: 400 });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: baseSystem, messages: [{ role: 'user', content: userPrompt }] }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ result });
}
