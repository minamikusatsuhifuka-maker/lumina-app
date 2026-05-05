import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  const client = new Anthropic({ apiKey });
  const { content, chapter, mode, language } = await req.json();
  const langNote = language === 'en' ? 'Respond in English.' : '日本語で回答してください。';

  let prompt = '';

  if (mode === 'evaluate') {
    prompt = `${langNote}
以下の章本文を、Kindle書籍として評価してください。

【評価基準】
1. 読みやすさ（文体・構成・リズム）: /25点
2. 内容の深さ・エビデンス: /25点
3. マーケティング要素（ナッジ・損失回避・社会的証明）: /25点
4. 読者の行動変容促進度: /25点

【章タイトル】${chapter?.title ?? ''}
【本文】
${content}

必ずJSON形式のみで回答（前後の説明・コードブロック不要）：
{
  "totalScore": 85,
  "scores": {
    "readability": 20,
    "depth": 22,
    "marketing": 20,
    "actionability": 23
  },
  "strengths": ["良い点1", "良い点2"],
  "improvements": [
    {"priority": "高", "point": "改善ポイント", "suggestion": "具体的な改善案"}
  ],
  "overallFeedback": "総合コメント"
}`;
  } else if (mode === 'improve') {
    prompt = `${langNote}
以下の章本文を、改善提案に基づいてブラッシュアップしてください。

【改善方針】
- ナッジ理論・損失回避・社会的証明をより自然に組み込む
- 具体的な事例・データを追加・強化する
- 文体をより読みやすく洗練させる
- 各節の接続をスムーズにする
- 読了後の行動意欲を高める締めにする

【章タイトル】${chapter?.title ?? ''}
【元の本文】
${content}

改善後の本文のみを出力してください（説明不要）。`;
  } else if (mode === 'spellcheck') {
    prompt = `${langNote}
以下の文章の誤字脱字・文法ミス・表記ゆれを全てチェックしてください。

【チェック対象】
${content}

JSON形式のみで回答（前後の説明・コードブロック不要）：
{
  "hasErrors": true,
  "errors": [
    {
      "original": "誤った表現",
      "corrected": "正しい表現",
      "location": "〇〇という文の中",
      "type": "誤字|脱字|文法|表記ゆれ"
    }
  ],
  "correctedContent": "修正済みの全文",
  "summary": "チェック結果のサマリー"
}`;
  } else {
    return NextResponse.json({ error: 'modeはevaluate/improve/spellcheckのいずれか' }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: mode === 'improve' ? 8000 : 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0] as any;
    const text = block?.type === 'text' ? block.text : '';

    if (mode === 'improve') {
      return NextResponse.json({ improvedContent: text });
    }

    const clean = text.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'JSON抽出失敗', raw: clean.slice(0, 300) }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('[kindle/evaluate-chapter]', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
