import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sql } from '@/lib/db';
import {
  generateWithProvider,
  IMAGE_MODELS,
  type ImageAspect,
  type ImageModelKey,
  type ImageQuality,
} from '@/lib/image-providers';

export const runtime = 'nodejs';
// 複数モデルを並列生成。一番遅いモデル（GPT Image 2）に合わせて余裕を持たせる。
export const maxDuration = 180;

const VALID_KEYS = new Set<ImageModelKey>(IMAGE_MODELS.map((m) => m.key));
const HISTORY_LIMIT = 20;

// GPT代表サイズ（履歴の size カラム互換用。既存 image-gen 履歴UIと表記を揃える）
const ASPECT_TO_GPT_SIZE: Record<ImageAspect, string> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
};

// 生成履歴を1件記録（既存 image_generations と同一テーブル・冪等作成）。失敗しても生成結果は返す。
async function recordHistory(userId: string, prompt: string, size: string, quality: string) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS image_generations (
        id BIGSERIAL PRIMARY KEY,
        owner TEXT NOT NULL,
        prompt TEXT NOT NULL,
        size TEXT NOT NULL DEFAULT '1024x1024',
        quality TEXT NOT NULL DEFAULT 'high',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO image_generations (owner, prompt, size, quality)
      VALUES (${userId}, ${prompt}, ${size}, ${quality})
    `;
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
    console.error('[image-gen/multi] 履歴記録エラー:', e);
  }
}

// 複数モデルの並列生成（既存 /api/image-gen の単体呼び出しは無変更・こちらは新設）。
// Promise.allSettled で1つ失敗しても他は返す（部分成功）。base64はNeonに保存しない。
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json({ error: 'プロンプトが必要です' }, { status: 400 });
    }

    const models: ImageModelKey[] = Array.isArray(body.models)
      ? body.models.filter((m: unknown): m is ImageModelKey => VALID_KEYS.has(m as ImageModelKey))
      : [];
    if (models.length === 0) {
      return NextResponse.json({ error: 'モデルを1つ以上選択してください' }, { status: 400 });
    }

    const aspect: ImageAspect = body.aspect === 'landscape' ? 'landscape' : 'square';
    const quality: ImageQuality =
      body.quality === 'low' || body.quality === 'high' ? body.quality : 'medium';

    // 並列実行。generateWithProvider は例外を投げず結果を返すので allSettled でも rejected は基本出ない
    const settled = await Promise.allSettled(
      models.map((model) => generateWithProvider(model, { prompt, aspect, quality })),
    );
    const results = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { ok: false as const, model: models[i], error: '生成に失敗しました', elapsedMs: 0 },
    );

    // 1つでも成功したら履歴を1件だけ記録（既存の履歴UIと互換・プロンプト再利用のため）
    if (guard.userId && results.some((r) => r.ok)) {
      await recordHistory(guard.userId, prompt, ASPECT_TO_GPT_SIZE[aspect], quality);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[image-gen/multi]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
