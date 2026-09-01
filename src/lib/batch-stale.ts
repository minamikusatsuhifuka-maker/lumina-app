// 284: 終わらないバッチジョブ（running/pending のまま止まったもの）を「中断」として扱う判定。
//
// 背景: 「今すぐ実行」はブラウザ主導のため、途中でタブが落ちる・サーバーがタイムアウトすると
// status を更新する処理に到達しない。異常終了は原理的に捕捉できないので、**時間経過が最後の砦**。
// DBの status は書き換えず、表示側（と削除APIの判定）でこの純関数から導出する（283と同じ方針・R-74）。
//
// 判定の基準時刻:
//   - running: started_at（無ければ created_at）から閾値を超えたら中断
//   - pending: scheduled_at（無ければ created_at）から閾値を超えたら中断
//     ※ 予約（cron）で未来の scheduled_at を持つジョブは「まだ順番が来ていない」だけなので中断にしない
// 経過時間の表示は JST で組み立てる（R-86）。

import { jstDateTimeString } from '@/lib/jst';

/** 中断とみなす経過時間（1箇所で管理）。10トピックでも1時間程度で終わるため6時間超は明らかに異常 */
export const STALE_JOB_THRESHOLD_MS = 6 * 60 * 60 * 1000;
/** サーバー側SQLで同じ閾値を使うための秒数 */
export const STALE_JOB_THRESHOLD_SECONDS = STALE_JOB_THRESHOLD_MS / 1000;

export const STALE_CANDIDATE_STATUSES = ['running', 'pending'] as const;

export type BatchJobLike = {
  status: string;
  created_at?: string | Date | null;
  started_at?: string | Date | null;
  scheduled_at?: string | Date | null;
  topics?: { status?: string }[] | null;
};

function toMs(v: string | Date | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** 中断判定の基準時刻（ms）。判定対象外の status では NaN */
export function staleReferenceMs(job: BatchJobLike): number {
  if (job.status === 'running') {
    const s = toMs(job.started_at);
    return Number.isFinite(s) ? s : toMs(job.created_at);
  }
  if (job.status === 'pending') {
    const s = toMs(job.scheduled_at);
    return Number.isFinite(s) ? s : toMs(job.created_at);
  }
  return NaN;
}

/** running/pending のまま閾値を超えているか（同じ入力・同じ nowMs なら必ず同じ結果） */
export function isStaleBatchJob(job: BatchJobLike, nowMs: number): boolean {
  if (!(STALE_CANDIDATE_STATUSES as readonly string[]).includes(job.status)) return false;
  const ref = staleReferenceMs(job);
  if (!Number.isFinite(ref)) return false;
  return nowMs - ref > STALE_JOB_THRESHOLD_MS;
}

/** 表示用の状態。中断なら 'stale'、それ以外は DB の status をそのまま返す */
export function batchJobDisplayStatus(job: BatchJobLike, nowMs: number): string {
  return isStaleBatchJob(job, nowMs) ? 'stale' : job.status;
}

/** 中断ジョブでも記事は残っている。保存済み（完了）トピック数 */
export function savedTopicCount(job: BatchJobLike): number {
  return (job.topics ?? []).filter((t) => t?.status === 'completed').length;
}

/** 経過時間の日本語（約N日／約N時間／N分未満）。負数・不正は '' */
export function elapsedLabel(fromMs: number, nowMs: number): string {
  if (!Number.isFinite(fromMs) || !Number.isFinite(nowMs)) return '';
  const diff = nowMs - fromMs;
  if (diff < 0) return '';
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 48) return `約${Math.floor(hours / 24)}日`;
  if (hours >= 1) return `約${hours}時間`;
  return '1時間未満';
}

/** 「2026/5/26 14:02:10 開始・未完了（約98日）」— 開始時刻は JST（R-86） */
export function staleJobLabel(job: BatchJobLike, nowMs: number): string {
  const ref = staleReferenceMs(job);
  const started = Number.isFinite(ref) ? jstDateTimeString(ref) : '';
  const elapsed = elapsedLabel(ref, nowMs);
  return `${started} 開始・未完了${elapsed ? `（${elapsed}）` : ''}`;
}
