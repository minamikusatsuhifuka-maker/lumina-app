import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 120;

// 選択された専門用語を500字以内で解説して glossary_terms に保存するAPI
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  try {
    const { terms, sourceTopic } = await req.json();
    if (!Array.isArray(terms) || terms.length === 0) {
      return NextResponse.json({ error: 'termsが必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    const results: any[] = [];

    for (const item of terms) {
      const termName = String(item?.term || '').trim();
      if (!termName) continue;

      // 同一ユーザーで既に保存済みならスキップして既存を返す
      const existing = await sql`
        SELECT * FROM glossary_terms
        WHERE user_id = ${userId} AND term = ${termName}
        LIMIT 1
      `;
      if (existing.length > 0) {
        results.push({ ...existing[0], alreadyExists: true });
        continue;
      }

      const prompt = `「${termName}」という専門用語を、知識ゼロの一般人にもわかるように説明してください。

【条件】
- 500字以内で簡潔にまとめる
- 難しい言葉をさらに使わない
- 具体例や身近な例えを1つ入れる
- 「つまり〇〇ということです」で締めくくる
- Markdownは使わない・プレーンテキストのみ
- 前置き・後書きは書かない

カテゴリ: ${item.category ?? 'その他'}`;

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
            max_tokens: 800,
            temperature: 0.5,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('[glossary/research-explain]', termName, response.status, errText.slice(0, 200));
          results.push({ term: termName, error: `Anthropic ${response.status}` });
          continue;
        }

        const data = await response.json();
        const blocks = Array.isArray(data?.content) ? data.content : [];
        const explanation = blocks
          .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
          .map((b: any) => b.text)
          .join('\n')
          .trim()
          .slice(0, 500);

        if (!explanation) {
          results.push({ term: termName, error: 'AI応答が空でした' });
          continue;
        }

        const saved = await sql`
          INSERT INTO glossary_terms
            (user_id, term, reading, explanation, source_topic, category)
          VALUES (
            ${userId},
            ${termName},
            ${item.reading || null},
            ${explanation},
            ${sourceTopic || null},
            ${item.category || 'その他'}
          )
          RETURNING *
        `;
        results.push({ ...saved[0], alreadyExists: false });
      } catch (e: any) {
        console.error('[glossary/research-explain]', termName, e);
        results.push({ term: termName, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error('[glossary/research-explain] 全体:', e);
    return NextResponse.json({ error: e?.message || 'エラー' }, { status: 500 });
  }
}
