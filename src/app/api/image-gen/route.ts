import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

// GPT Image 2（OpenAI）での画像生成 + 生成履歴（プロンプト・設定のみ、画像は保存しない）
// APIキー秘匿のため必ずサーバー経由（クライアントからOpenAI直叩き禁止）
export const runtime = 'nodejs';
// 生成に最大2分かかることがあるため余裕を持たせる
export const maxDuration = 180;

// 許可する解像度・品質（不正値は既定に落とす）
const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);
const HISTORY_LIMIT = 20;

// 生成履歴テーブルを冪等作成（base64は保存しない＝Neonを重くしない設計）
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS image_generations (
        id BIGSERIAL PRIMARY KEY,
        owner TEXT NOT NULL,
        prompt TEXT NOT NULL,
        size TEXT NOT NULL DEFAULT '1024x1024',
        quality TEXT NOT NULL DEFAULT 'high',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

function getUserId(session: unknown): string {
  return ((session as { user?: { id?: string } })?.user?.id ?? '').trim();
}

// 429/一時エラー向けの指数バックオフ付きfetch（最大2回リトライ）
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // 429・5xx はリトライ対象（4xxの設定系エラーは即返す）
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('OpenAI APIへの接続に失敗しました');
}

// OpenAIのエラーを分かる日本語メッセージへ変換（無言で失敗しない）
function toFriendlyError(status: number, apiMessage: string): string {
  if (status === 401) {
    return 'OpenAI APIキーが無効です。Vercelの環境変数 OPENAI_API_KEY を確認してください（OpenAI側の設定が必要です）。';
  }
  if (status === 403 || /verif/i.test(apiMessage)) {
    return 'OpenAIのOrganization Verification（組織確認）が未完了の可能性があります。OpenAI開発者コンソールで組織確認を完了してください（OpenAI側の設定が必要です）。';
  }
  if (status === 429) {
    return 'OpenAI APIのレート制限または残高不足です。時間をおいて再試行するか、Billing設定を確認してください。';
  }
  if (/safety|moderation|blocked/i.test(apiMessage)) {
    return '安全フィルターにより画像生成がブロックされました。プロンプトを変更してお試しください。';
  }
  return apiMessage || `OpenAI APIエラー (${status})`;
}

// 生成履歴の取得（直近20件・プロンプトと設定のみ）
export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    await ensureTable();
    const rows = await sql`
      SELECT id, prompt, size, quality, created_at
      FROM image_generations
      WHERE owner = ${userId}
      ORDER BY created_at DESC
      LIMIT ${HISTORY_LIMIT}
    `;
    return NextResponse.json({ history: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[image-gen GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 画像生成（gpt-image-2）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => null);
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json({ error: 'プロンプトが必要です' }, { status: 400 });
    }
    const size =
      typeof body?.size === 'string' && ALLOWED_SIZES.has(body.size)
        ? body.size
        : '1024x1024';
    const quality =
      typeof body?.quality === 'string' && ALLOWED_QUALITIES.has(body.quality)
        ? body.quality
        : 'high';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'OPENAI_API_KEY が設定されていません。Vercelの環境変数に設定してください（OpenAI側の設定が必要です）。',
        },
        { status: 500 },
      );
    }

    // gpt-image-2 は透過背景（background:"transparent"）非対応のため受け付けない
    // input_fidelity も指定不可（常に高忠実で処理されるため送らない）
    const res = await fetchWithRetry('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt,
        size,
        quality,
        n: 1,
      }),
    });

    if (!res.ok) {
      const errorData = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const apiMessage = errorData?.error?.message || '';
      console.error('[image-gen POST] OpenAI APIエラー:', res.status, apiMessage);
      return NextResponse.json(
        { error: toFriendlyError(res.status, apiMessage) },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = (await res.json()) as {
      data?: { b64_json?: string }[];
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: '画像が生成されませんでした。プロンプトを変更してお試しください。' },
        { status: 400 },
      );
    }

    // 履歴を記録（プロンプト・設定のみ。失敗しても生成結果の返却は妨げない）
    try {
      await ensureTable();
      await sql`
        INSERT INTO image_generations (owner, prompt, size, quality)
        VALUES (${userId}, ${prompt}, ${size}, ${quality})
      `;
      // 直近N件のみ保持（古い履歴は削除してNeonを軽く保つ）
      await sql`
        DELETE FROM image_generations
        WHERE owner = ${userId}
          AND id NOT IN (
            SELECT id FROM image_generations
            WHERE owner = ${userId}
            ORDER BY created_at DESC
            LIMIT ${HISTORY_LIMIT}
          )
      `;
    } catch (e) {
      console.error('[image-gen POST] 履歴記録エラー:', e);
    }

    return NextResponse.json({
      success: true,
      image: { base64: b64, mimeType: 'image/png' },
      size,
      quality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '画像生成に失敗しました';
    console.error('[image-gen POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
