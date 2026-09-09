// 320: 新しいタブへの handoff（localStorage の一回限りキー・R-121）の共通実装。
// noopener の新タブに sessionStorage は渡らないため localStorage に置き、**読んだ側が removeItem** する（再読込で再利用されない）。
// 317（🎤プレゼン原稿）・319（🔭追加リサーチ）・320（🖼図解生成）が同じ方式。別の受け渡しを作らない。
export function writeOneTimeHandoff(key: string, payload: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false; // プライベートモード等（呼び出し側が理由を出す）
  }
}

/** 読んだら消す。壊れていれば null（fail-closed）。parse は形の検証（不正なら null を返す） */
export function readOneTimeHandoff<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    localStorage.removeItem(key);
    return parse(raw);
  } catch {
    return null;
  }
}
