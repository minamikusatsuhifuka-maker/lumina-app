import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { sanitizeForDb } from '@/lib/sanitize';
import { BATCH_TITLE_GROUP_MAX, batchJobSignature, deriveBatchJobTitle, truncateTitle } from '@/lib/batch-title';

// バッチリサーチジョブの一覧取得・新規登録・改名・削除API

/**
 * 277 §3: 二重登録の遮断（サーバー側）。
 * 同じ利用者・同じトピック構成のジョブが直近この秒数以内に作られていたら、
 * **新しく作らずそのジョブを返す**（実行ボタンの二重発火が1秒差でレコードを2件作っていた）。
 * バッチは1本が数分かかるため、この窓の中で「同じ内容をもう一度わざと登録する」ことは実運用で起きない。
 * 画面側にも遮断（submitLockRef）を入れてあり、ここは経路を問わない最後の砦。
 */
const DUPLICATE_WINDOW_SECONDS = 30;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const jobs = await sql`
    SELECT * FROM batch_research_jobs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { groupName, topics, scheduleType, scheduledAt, notifyEmail, autoSave } = await req.json();

    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: 'topicsが必要です' }, { status: 400 });
    }
    if (topics.length > 10) {
      return NextResponse.json({ error: 'トピックは最大10件までです' }, { status: 400 });
    }

    // モード値を既存システムに揃える（light → quick）
    const normalizeMode = (m: string) => {
      if (m === 'light') return 'quick';
      if (m === 'quick' || m === 'standard' || m === 'deep') return m;
      return 'standard';
    };

    const topicsWithStatus = topics
      .filter((t: any) => t && typeof t.topic === 'string' && t.topic.trim())
      .map((t: any) => ({
        topic: String(t.topic).trim(),
        mode: normalizeMode(String(t.mode || 'standard')),
        status: 'pending',
        result: null,
        contextText: null,
      }));

    if (topicsWithStatus.length === 0) {
      return NextResponse.json({ error: '有効なトピックがありません' }, { status: 400 });
    }

    const validScheduleTypes = ['immediate', 'browser', 'cron'];
    const finalScheduleType = validScheduleTypes.includes(scheduleType) ? scheduleType : 'immediate';

    // §2-2: タイトルは決定的に導出する（グループ名 → トピック名の連結）。
    // 以前は空のときに `new Date().toLocaleString('ja-JP')` を使っていたが、
    // Vercelの実行環境はUTCのため名前だけ9時間ずれていた（§2-1・R-86）。時刻は使わない。
    const finalGroupName = deriveBatchJobTitle(groupName, topicsWithStatus);

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // §3: 直近に**まったく同じ登録**があれば、それを返して二重登録しない（新規行を作らない）。
    // 比較はリクエストの中身すべて（名前・トピック構成・実行方法・時刻・自動保存）。
    // 一部でも違えば別の登録として通す——設定を変えて登録し直す操作を塞がないため。
    const finalAutoSave = autoSave !== false;
    const finalScheduledAt = scheduledAt || null;
    const signature = batchJobSignature({
      title: finalGroupName,
      topics: topicsWithStatus,
      scheduleType: finalScheduleType,
      scheduledAt: finalScheduledAt,
      autoSave: finalAutoSave,
    });
    const recent = await sql`
      SELECT * FROM batch_research_jobs
      WHERE user_id = ${userId}
        AND created_at > NOW() - (${DUPLICATE_WINDOW_SECONDS} * INTERVAL '1 second')
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const duplicate = recent.find(
      (row: any) =>
        batchJobSignature({
          title: row.group_name,
          topics: Array.isArray(row.topics) ? row.topics : [],
          scheduleType: row.schedule_type,
          scheduledAt: row.scheduled_at,
          autoSave: row.auto_save_library !== false,
        }) === signature,
    );
    if (duplicate) {
      // 偽の成功ではない: 実体のあるジョブを返す。呼び出し側は同じidで進める（二重実行にならない）
      return NextResponse.json({ job: duplicate, deduplicated: true });
    }

    // 263【3】: 📚リサーチ保存への自動保存フラグ（R-10: 冪等な列追加。既存行は既定on）。
    // 設定（🎛自動ストック保存）はクライアントの localStorage にあるため、ジョブ作成時に
    // 確定してジョブへ載せる——サーバー自動実行（毎朝のcron）でもこの値だけで保存が完結する。
    await sql`ALTER TABLE batch_research_jobs ADD COLUMN IF NOT EXISTS auto_save_library BOOLEAN NOT NULL DEFAULT TRUE`;

    const rows = await sql`
      INSERT INTO batch_research_jobs
        (user_id, group_name, topics, schedule_type, scheduled_at, notify_email, status, auto_save_library)
      VALUES (
        ${userId},
        ${finalGroupName},
        ${JSON.stringify(topicsWithStatus)},
        ${finalScheduleType},
        ${finalScheduledAt},
        ${notifyEmail || null},
        'pending',
        ${finalAutoSave}
      )
      RETURNING *
    `;

    return NextResponse.json({ job: rows[0] });
  } catch (e: any) {
    console.error('[batch-research POST] エラー:', e);
    return NextResponse.json({ error: e?.message || '登録に失敗しました' }, { status: 500 });
  }
}

/**
 * 277 §2-4: ジョブの改名。
 * **既存の保存記事のタグ（`group:<名前>`）には波及させない** ——
 * タグは実行時点の名前で書き込まれており、後から書き換えると
 * 既にその名前で絞り込んでいる導線（🧠AI参照素材のフィルタ）が壊れるため。
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, groupName } = await req.json();
    const jobId = parseInt(String(id), 10);
    if (isNaN(jobId)) return NextResponse.json({ error: '無効なidです' }, { status: 400 });

    const title = truncateTitle(String(groupName ?? ''), BATCH_TITLE_GROUP_MAX);
    if (!title) return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    const rows = await sql`
      UPDATE batch_research_jobs
      SET group_name = ${sanitizeForDb(title)}
      WHERE id = ${jobId} AND user_id = ${userId}
      RETURNING *
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 });
    }
    return NextResponse.json({ job: rows[0] });
  } catch (e: any) {
    console.error('[batch-research PATCH] エラー:', e);
    return NextResponse.json({ error: e?.message || '改名に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) return NextResponse.json({ error: '無効なidです' }, { status: 400 });

  // ジョブの存在確認＆所有権チェック＆実行中チェック
  const rows = await sql`
    SELECT status FROM batch_research_jobs WHERE id = ${jobId} AND user_id = ${userId}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 });
  }
  if (rows[0].status === 'running') {
    return NextResponse.json({ error: '実行中のジョブは削除できません' }, { status: 409 });
  }

  await sql`DELETE FROM batch_research_jobs WHERE id = ${jobId} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
