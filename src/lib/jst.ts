// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 277: 日時はすべて日本時間（JST）で組み立てる。
//
// 背景: Vercel の実行環境は **UTC**。サーバー側で `new Date().toLocaleString('ja-JP')` と
// 書くと、ブラウザ（＝院長の端末＝JST）で同じコードを書いたときと **9時間ずれる**。
// 実際、バッチジョブ名が「バッチリサーチ 2026/8/31 5:41:17」（UTC）で作られ、
// 一覧の表示日時（クライアント＝JST）が「14:41:17」となって食い違っていた。
//
// 方針: 表示・保存・プロンプトに載る日時は、**サーバー/クライアントのどちらで動いても**
// このモジュールを通す（`timeZone: 'Asia/Tokyo'` を毎回書かない・書き忘れを1箇所に閉じる）。
// 日付範囲を外部API（GA4・Search Console）へ渡す値は「表示」ではなく問い合わせ窓なので対象外。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const JST_TIME_ZONE = 'Asia/Tokyo';

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** ja-JP の任意書式をJSTで。options は toLocaleString と同じ（timeZone は上書きしない） */
export function formatJst(
  value: Date | string | number = new Date(),
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ja-JP', { ...options, timeZone: JST_TIME_ZONE });
}

/** 'YYYY-MM-DD'（JST）。プロンプトの「本日」やキーに使う */
export function jstDateString(value: Date | string | number = new Date()): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 一覧などの表示用（例: 2026/8/31 14:41:17）。端末のタイムゾーンに依存しない */
export function jstDateTimeString(value: Date | string | number = new Date()): string {
  return formatJst(value);
}

/** 短い日付表示（例: 8/31）。週次レポートのタイトル等 */
export function jstShortDate(value: Date | string | number = new Date()): string {
  return formatJst(value, { month: 'numeric', day: 'numeric' });
}
