// 250: 一括削除の確認ダイアログ（🗂テキスト分析・📚リサーチ保存・🧠AI参照素材で共通）。
//
// 削除は不可逆で Undo を持たないため、確認の文言は3画面で必ず同じにする。
// 「何件」「どの種類」「戻せない」の3点を必ず出す。

export function confirmBulkDelete(count: number, label: string): boolean {
  if (count <= 0) return false;
  return window.confirm(
    `${count}件の${label}を削除します。\n\n` +
      `削除すると元に戻せません（取り消しはできません）。\n` +
      `よろしいですか？`,
  );
}
