import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel, type AIModel } from '@/lib/ai-client';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RequestBody {
  topic: string;
  context?: string;
  model?: AIModel;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userId = (session.user as any).id ?? '';

  const { topic, context = '', model = 'gemini' } = (await req.json()) as RequestBody;

  if (!topic || !topic.trim()) {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // ユーザーのバズりパターン辞書を取得
    const rows = (await sql`
      SELECT id, title, content, metadata, is_favorite
      FROM library
      WHERE user_id = ${userId}
        AND type = 'buzz-pattern'
      ORDER BY is_favorite DESC, created_at DESC
      LIMIT 50
    `) as any[];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          patterns: [],
          message:
            'パターン辞書が空です。バズり分析からパターンを抽出してください。',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // パターン一覧を AI に渡して推奨を依頼
    const patternList = rows
      .map((r: any, i: number) => {
        const meta =
          typeof r.metadata === 'string'
            ? (() => {
                try {
                  return JSON.parse(r.metadata);
                } catch {
                  return {};
                }
              })()
            : r.metadata || {};
        return `${i + 1}. [ID:${r.id}] ${r.title}
   カテゴリ: ${meta?.category || '-'}
   フレームワーク: ${meta?.framework || '-'}
   説明: ${meta?.description || (r.content || '').slice(0, 100)}`;
      })
      .join('\n\n');

    const systemPrompt = `あなたはコンテンツマーケティングの専門家として、note記事のトピックに対して最適なバズりパターンを推薦する役割です。

ユーザーの蓄積したパターン辞書から、このトピックに最も効果的なパターンを3〜5個選んで推奨してください。
JSON配列形式で、選んだパターンのIDと、なぜ選んだかの理由を返してください。`;

    const userPrompt = `【記事のトピック】
${topic}

【補足情報】
${(context || '').slice(0, 2000)}

【パターン辞書（全${rows.length}件）】
${patternList}

【出力形式】以下のJSON配列のみを返してください。説明文や前置きは不要です。

[
  {
    "id": "パターンID（上記リストの [ID:xxx] からコピー）",
    "title": "パターン名",
    "reason": "このトピックに推奨する理由（50〜100字）"
  }
]

【選定基準】
- トピックと記事の意図にマッチするパターンを優先
- カテゴリのバランス（構成・見出し・心理トリガー等）も考慮
- 3〜5個（質を優先、無理に増やさない）`;

    const raw = await generateWithModel(model, userPrompt, systemPrompt, 4000);

    // JSON 抽出
    let jsonText = raw.trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
    if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');
    if (startIdx >= 0 && endIdx > startIdx) {
      jsonText = jsonText.slice(startIdx, endIdx + 1);
    }

    const suggestions = JSON.parse(jsonText);
    if (!Array.isArray(suggestions)) {
      throw new Error('Expected array of suggestions');
    }

    // 推奨されたIDのパターン本体を含めて返す
    const suggestionsWithDetails = suggestions
      .map((s: any) => {
        const found = rows.find((r: any) => String(r.id) === String(s.id));
        if (!found) return null;
        const meta =
          typeof found.metadata === 'string'
            ? (() => {
                try {
                  return JSON.parse(found.metadata);
                } catch {
                  return {};
                }
              })()
            : found.metadata || {};
        return {
          id: found.id,
          title: found.title,
          content: found.content,
          category: meta?.category,
          framework: meta?.framework,
          reason: s.reason,
        };
      })
      .filter(Boolean);

    return new Response(
      JSON.stringify({ patterns: suggestionsWithDetails }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[note-pattern-suggest] error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Pattern suggestion failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
