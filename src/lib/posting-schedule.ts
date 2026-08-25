// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NP-02 予約投稿カレンダーの割り当てロジック（指示書266【3】・AI不使用の純関数）
// - 予約投稿の実行は note 側。アプリが出すのは「どの記事をいつ出すか」の割り当て表のみ
// - NP-02の運用サイクル: 週末に書き溜め→**平日**の朝7:30 または 夜20:30 に予約
// - 時間帯は媒体でズレる（R-70）: note夜=20:00〜22:30／X夜=18:00〜21:00。共有ロジックにしない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ScheduleSlot = 'morning' | 'noon' | 'night';

/** noteの予約時刻の既定値（NP-02: 平日の朝7:30 または 夜20:30。昼は補助枠） */
export const NOTE_SLOTS: Record<ScheduleSlot, { label: string; time: string; window: string }> = {
  morning: { label: '朝', time: '7:30', window: '7:00〜8:30' },
  noon: { label: '昼', time: '12:30', window: '12:00〜13:00' },
  night: { label: '夜', time: '20:30', window: '20:00〜22:30' },
};

export const DEFAULT_SCHEDULE_SLOT: ScheduleSlot = 'night'; // 長文・重厚なノウハウ・有料は夜帯（NP-02）

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export interface ScheduleRow {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  weekday: (typeof WEEKDAY_JA)[number];
  slot: ScheduleSlot;
  /** note公開時刻（例: 20:30） */
  noteTime: string;
  /** X告知ポストの目安（媒体別のゴールデンタイムに従う） */
  xHint: string;
}

function parseDateLocal(yyyyMmDd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 土日を飛ばして次の平日へ（NP-02は平日運用が既定） */
export function toWeekday(d: Date): Date {
  const next = new Date(d.getTime());
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

/** X告知ポストの目安。note夜公開(20:30)はXの夜帯(〜21:00)をほぼ過ぎているため翌朝へ回す */
export function xAnnounceHint(slot: ScheduleSlot): string {
  if (slot === 'night') return '翌朝 7:00〜8:30（Xの朝帯）';
  return '当日 18:00〜21:00（Xの夜帯）';
}

/**
 * 選択した記事を、開始日から**平日連続**で1日1本ずつ割り当てる。
 * slots[i] が省略された記事は defaultSlot（既定=夜20:30）。開始日が土日なら次の月曜から始める。
 */
export function buildScheduleRows(
  items: Array<{ id: string; title: string }>,
  startDate: string,
  slots: Partial<Record<number, ScheduleSlot>> = {},
  defaultSlot: ScheduleSlot = DEFAULT_SCHEDULE_SLOT,
): ScheduleRow[] {
  const start = parseDateLocal(startDate);
  if (!start || items.length === 0) return [];

  const rows: ScheduleRow[] = [];
  let cursor = toWeekday(start);
  items.forEach((item, i) => {
    const slot = slots[i] ?? defaultSlot;
    rows.push({
      id: item.id,
      title: item.title,
      date: fmt(cursor),
      weekday: WEEKDAY_JA[cursor.getDay()],
      slot,
      noteTime: NOTE_SLOTS[slot].time,
      xHint: xAnnounceHint(slot),
    });
    cursor = toWeekday(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1));
  });
  return rows;
}

/** 表をMarkdownにする（リッチコピーで手元のメモ・note予約設定への転記に使う） */
export function scheduleToMarkdown(rows: ScheduleRow[]): string {
  if (rows.length === 0) return '';
  const header = '| 公開日 | 曜日 | note公開 | 記事 | X告知の目安 |\n|---|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.date} | ${r.weekday} | ${NOTE_SLOTS[r.slot].label} ${r.noteTime} | ${r.title.replace(/\|/g, '｜')} | ${r.xHint} |`)
    .join('\n');
  return `# note予約投稿カレンダー\n\n${header}\n${body}\n\n- note夜帯: 20:00〜22:30 ／ X夜帯: 18:00〜21:00（媒体でズレる点に注意）\n- 予約の実行はnote側の予約投稿機能で行う（このアプリからの自動投稿はしない）`;
}
