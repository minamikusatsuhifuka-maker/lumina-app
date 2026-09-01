// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281: 📔 エピソード記録 — サーバ専用（DB）
//
// 保存先は専用テーブル episode_records（§5-1）。エピソードは長期資産なので、
// 下書き用の feature_result_drafts や汎用 library の流用はしない（型が違う・消える・混ざる）。
// DDLは ensureEpisodeTables の冪等（CREATE TABLE IF NOT EXISTS）に収まる範囲＝停止条件①の例外。
//
// §5-2: エピソード本文をログ・エラー通知・トレースに出さない。このファイルの関数は
// 本文を console に出さない（エラーは DB のメッセージだけ）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { neon } from '@neondatabase/serverless';
import { sanitizeForDb } from '@/lib/sanitize';
import {
  EPISODE_FIELD_KEYS,
  EPISODE_FIELD_MAX,
  EPISODE_FACT_GUARD,
  formatEpisodesForPrompt,
  normalizeEpisodeTags,
  parseEpisodeIds,
  type EpisodeInput,
  type EpisodeRecord,
} from '@/lib/episodes';

type Sql = ReturnType<typeof neon<false, false>>;

export const EPISODES_TABLE = 'episode_records';

/** 冪等DDL（scheduling/memo 方式）。プロセス内で1回だけ走らせる */
let tablesReady: Promise<void> | null = null;
export function ensureEpisodeTables(sql: Sql): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS episode_records (
        id          serial PRIMARY KEY,
        user_id     text NOT NULL,
        title       text NOT NULL DEFAULT '',
        period      text NOT NULL DEFAULT '',
        situation   text NOT NULL DEFAULT '',
        feelings    text NOT NULL DEFAULT '',
        details     text NOT NULL DEFAULT '',
        thoughts    text NOT NULL DEFAULT '',
        reflection  text NOT NULL DEFAULT '',
        tags        text[] NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_episode_records_user ON episode_records(user_id, created_at DESC)`;
    })().catch((e) => {
      tablesReady = null; // 失敗時は次回に再試行できるようにする
      throw e;
    });
  }
  return tablesReady;
}

/** 入力を DB 用に整える（全項目任意。欠けは空文字＝NULLを持ち回らない） */
export function normalizeEpisodeInput(body: Record<string, unknown>): EpisodeInput {
  const out = {} as EpisodeInput;
  for (const key of EPISODE_FIELD_KEYS) {
    const v = typeof body[key] === 'string' ? (body[key] as string) : '';
    out[key] = sanitizeForDb(v).slice(0, EPISODE_FIELD_MAX);
  }
  out.tags = normalizeEpisodeTags(body.tags).map((t) => sanitizeForDb(t));
  return out;
}

type Row = {
  id: number;
  title: string;
  period: string;
  situation: string;
  feelings: string;
  details: string;
  thoughts: string;
  reflection: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

function toRecord(r: Row): EpisodeRecord {
  return {
    id: Number(r.id),
    title: r.title ?? '',
    period: r.period ?? '',
    situation: r.situation ?? '',
    feelings: r.feelings ?? '',
    details: r.details ?? '',
    thoughts: r.thoughts ?? '',
    reflection: r.reflection ?? '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/** owner検証つきで ids の記録を取得し、指定順に並べ直す（存在しない/他人のIDは黙って落ちる） */
export async function fetchEpisodesByIds(sql: Sql, userId: string, ids: number[]): Promise<EpisodeRecord[]> {
  if (ids.length === 0) return [];
  await ensureEpisodeTables(sql);
  const rows = (await sql`
    SELECT id, title, period, situation, feelings, details, thoughts, reflection, tags, created_at, updated_at
    FROM episode_records
    WHERE user_id = ${userId} AND id = ANY(${ids})
  `) as Row[];
  const byId = new Map(rows.map((r) => [Number(r.id), toRecord(r)]));
  return ids.map((id) => byId.get(id)).filter((r): r is EpisodeRecord => r !== undefined);
}

/**
 * 下流の生成経路（①ペルソナ別note記事・②分割記事化・269 Kindle→note）から呼ぶ。
 * リクエストの episodeIds を検証→取得→プロンプト用ブロック＋R-75規約にして返す。
 * 選択が無ければ空文字（=既存経路は1文字も変わらない・R-88）。
 * 取得失敗は空で返す（エピソードは付加情報。生成そのものを落とさない・R-39）。
 */
export async function loadEpisodePromptBlock(
  userId: string,
  rawIds: unknown,
): Promise<{ block: string; count: number }> {
  const ids = parseEpisodeIds(rawIds);
  if (ids.length === 0) return { block: '', count: 0 };
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const episodes = await fetchEpisodesByIds(sql, userId, ids);
    if (episodes.length === 0) return { block: '', count: 0 };
    return {
      block: `${EPISODE_FACT_GUARD}\n\n${formatEpisodesForPrompt(episodes)}`,
      count: episodes.length,
    };
  } catch {
    // §5-2: 本文を出さない。件数も出さない（失敗の事実だけ）
    console.error('[episodes] 下流向けの取得に失敗（エピソード無しで続行）');
    return { block: '', count: 0 };
  }
}
