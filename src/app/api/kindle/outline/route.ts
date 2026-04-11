import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 180;

const BOOK_TYPE_GUIDES: Record<string, string> = {
  guide: `解説書・ガイドブック構成:
- 各章は「導入→解説→具体例→まとめ」の流れ
- 読者がすぐ実践できるアクションポイントを含める
- 図解・チェックリストの挿入箇所を提案
- 専門用語には必ず噛み砕いた説明を付ける`,
  novel: `小説・フィクション構成:
- 起承転結を意識した章立て
- キャラクター設定と心理描写を重視
- 各章末にクリフハンガー（引き）を入れる
- 伏線の配置と回収を計画的に`,
  picture: `絵本構成:
- 1見開き＝1シーン（テキスト＋イラスト指示）
- 文字数は1ページ50〜100文字以内
- 繰り返し表現やリズム感のある文体
- 各ページに具体的なイラスト指示を付ける`,
  puzzle: `パズル・クイズ本構成:
- テーマ別にカテゴリ分け
- 難易度のグラデーション（初級→中級→上級）
- 各問題に解説ページを対応させる
- 巻末に解答一覧を配置`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { title, bookType, theme, targetReader, chapterCount, pageCount } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!title) {
    return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });
  }

  const typeGuide = BOOK_TYPE_GUIDES[bookType] || BOOK_TYPE_GUIDES.guide;

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
        max_tokens: 4000,
        system: `あなたはKindle出版の専門プロデューサーです。
与えられた情報をもとに、Amazon KDPで出版するための本の構成案を作成してください。

書籍タイプ別のガイド:
${typeGuide}

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "book_title": "正式な書籍タイトル",
  "subtitle": "サブタイトル",
  "tagline": "キャッチコピー（1行）",
  "target_reader": "ターゲット読者の具体的な描写",
  "unique_value": "この本ならではの価値・差別化ポイント",
  "chapters": [
    {
      "chapter_num": 1,
      "title": "章タイトル",
      "summary": "章の概要（100〜200文字）",
      "key_points": ["ポイント1", "ポイント2", "ポイント3"],
      "estimated_pages": 10,
      "illustration_note": "この章で使うイラスト・図解の提案"
    }
  ],
  "foreword_outline": "まえがきの概要",
  "afterword_outline": "あとがきの概要",
  "cover_text": {
    "front": "表紙に載せるテキスト",
    "back": "裏表紙の紹介文（150文字程度）",
    "author_bio": "著者プロフィール文"
  },
  "kdp_keywords": ["キーワード1", "キーワード2", "...（7つ）"],
  "kdp_categories": ["カテゴリ1", "カテゴリ2"],
  "estimated_total_pages": 100,
  "pricing_suggestion": "推奨価格とその理由"
}`,
        messages: [{
          role: 'user',
          content: `以下の情報で本の構成案を作成してください。

タイトル案: ${title}
書籍タイプ: ${bookType || 'guide'}
テーマ・内容: ${theme || '（指定なし — タイトルから推測してください）'}
ターゲット読者: ${targetReader || '一般'}
希望章数: ${chapterCount || '5〜8章'}
希望ページ数: ${pageCount || '80〜120ページ'}`,
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
    return NextResponse.json({ error: `構成案の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
