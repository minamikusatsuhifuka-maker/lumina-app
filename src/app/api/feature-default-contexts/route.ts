import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// 機能別デフォルト背景情報 CRUD API
// GET    /api/feature-default-contexts?feature=kindle  -> 機能のデフォルト一覧（ハイブリッド読み込み）
// POST   /api/feature-default-contexts                 -> { featureKey, contextSaveId } で追加
// DELETE /api/feature-default-contexts?id=123          -> 削除

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const feature = searchParams.get('feature');
    if (!feature) return NextResponse.json({ error: 'feature が必須です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    const rows = await sql`
      SELECT
        fdc.id,
        fdc.context_save_id,
        fdc.topic_snapshot,
        fdc.context_text_snapshot,
        fdc.snapshot_at,
        fdc.display_order,
        fdc.is_active,
        cs.topic AS current_topic,
        cs.context_text AS current_context_text,
        cs.updated_at AS current_updated_at
      FROM feature_default_contexts fdc
      LEFT JOIN context_saves cs
        ON cs.id = fdc.context_save_id AND cs.user_id = fdc.user_id
      WHERE fdc.user_id = ${userId}
        AND fdc.feature_key = ${feature}
        AND fdc.is_active = TRUE
      ORDER BY fdc.display_order ASC, fdc.created_at ASC
    `;

    const items = rows.map((row: any) => {
      const live = row.current_topic && row.current_context_text;
      return {
        id: row.id,
        contextSaveId: row.context_save_id,
        topic: live ? row.current_topic : row.topic_snapshot,
        contextText: live ? row.current_context_text : row.context_text_snapshot,
        source: live ? 'live' : 'snapshot',
        snapshotAt: row.snapshot_at,
        displayOrder: row.display_order,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { featureKey, contextSaveId } = await req.json();
    if (!featureKey || !contextSaveId) {
      return NextResponse.json({ error: 'featureKey と contextSaveId は必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // context_saves から該当データを取得（スナップショット用）
    const saved = await sql`
      SELECT topic, context_text
      FROM context_saves
      WHERE id = ${parseInt(contextSaveId, 10)} AND user_id = ${userId}
    `;
    if (saved.length === 0) {
      return NextResponse.json({ error: '対象の素材が見つかりません' }, { status: 404 });
    }

    // 重複チェック
    const existing = await sql`
      SELECT id FROM feature_default_contexts
      WHERE user_id = ${userId}
        AND feature_key = ${featureKey}
        AND context_save_id = ${parseInt(contextSaveId, 10)}
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: '既に登録済みです' }, { status: 409 });
    }

    const result = await sql`
      INSERT INTO feature_default_contexts
        (user_id, feature_key, context_save_id, topic_snapshot, context_text_snapshot)
      VALUES
        (${userId}, ${featureKey}, ${parseInt(contextSaveId, 10)}, ${saved[0].topic}, ${saved[0].context_text})
      RETURNING id
    `;

    return NextResponse.json({ success: true, id: result[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '追加に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const featureKey = searchParams.get('featureKey');
    const contextSaveId = searchParams.get('contextSaveId');

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    if (id) {
      await sql`DELETE FROM feature_default_contexts WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
    } else if (featureKey && contextSaveId) {
      // featureKey + contextSaveId 指定で削除（ライブラリ側のチェックボックスOFF用）
      await sql`
        DELETE FROM feature_default_contexts
        WHERE user_id = ${userId}
          AND feature_key = ${featureKey}
          AND context_save_id = ${parseInt(contextSaveId, 10)}
      `;
    } else {
      return NextResponse.json({ error: 'id または featureKey+contextSaveId が必須です' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '削除に失敗しました' }, { status: 500 });
  }
}
