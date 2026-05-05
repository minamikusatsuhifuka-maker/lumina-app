import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  const { bookId } = await req.json();
  if (!bookId) return NextResponse.json({ error: 'bookIdが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const [book] = await sql`
    SELECT * FROM kindle_books WHERE id = ${parseInt(String(bookId), 10)} AND user_id = ${userId}
  `;
  if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

  const chapters = await sql`
    SELECT * FROM kindle_chapters WHERE book_id = ${book.id}
    ORDER BY chapter_number ASC
  `;
  const meta = (book.book_meta as any) ?? {};
  const lang = book.language === 'en' ? 'en' : 'ja';

  // マーケティング戦略を生成
  const client = new Anthropic({ apiKey });
  let marketingStrategy = '';
  try {
    const marketingRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `以下の書籍のKindleマーケティング戦略を作成してください。
タイトル: ${book.title}
ジャンル: ${book.genre ?? ''}
ターゲット: ${book.target_audience ?? ''}

以下を含めてください：
1. Amazon KDP出版設定（カテゴリ・キーワード7個・価格帯）
2. プロダクトローンチ戦略（無料期間・レビュー獲得・SNS展開）
3. Kindle説明文（購買意欲を最大化するコピー・2000字以内）
4. SNS告知文テンプレート（Twitter/X・Instagram・Facebook）
5. メールマガジン告知文

Markdown形式で出力してください。`,
      }],
    });
    const block = marketingRes.content[0] as any;
    marketingStrategy = block?.type === 'text' ? block.text : '';
  } catch (err) {
    console.error('[kindle/export] マーケティング生成エラー:', err);
    marketingStrategy = '（マーケティング戦略の生成に失敗しました）';
  }

  // 全文MD生成
  const fullContent = `---
title: ${book.title}
subtitle: ${book.subtitle ?? ''}
author: xLUMINA
language: ${lang}
genre: ${book.genre ?? ''}
target_audience: ${book.target_audience ?? ''}
word_count: ${book.current_word_count}
generated_at: ${new Date().toISOString()}
---

# ${book.title}
${book.subtitle ? `## ${book.subtitle}` : ''}

${meta.catchphrase ? `> ${meta.catchphrase}` : ''}

---

${chapters.map((ch: any) => {
  const refs = Array.isArray(ch.refs) ? ch.refs : [];
  return `# 第${ch.chapter_number}章: ${ch.title}

${ch.content ?? '（未生成）'}

${refs.length > 0
  ? `### 参考文献\n${refs.map((r: any) => `- ${r.author ?? ''}（${r.year ?? ''}）「${r.title ?? ''}」- ${r.point ?? ''}`).join('\n')}`
  : ''}`;
}).join('\n\n---\n\n')}

---

# マーケティング戦略

${marketingStrategy}
`;

  // DBに保存
  await sql`
    UPDATE kindle_books
    SET marketing_strategy = ${JSON.stringify({ markdown: marketingStrategy })}::jsonb,
        status = 'completed',
        phase = 7,
        updated_at = NOW()
    WHERE id = ${book.id}
  `;

  return NextResponse.json({
    fullContent,
    marketingStrategy,
    wordCount: book.current_word_count,
    chapterCount: chapters.length,
  });
}
