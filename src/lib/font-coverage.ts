// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 315是正②: フォントのグリフ被覆（欠字検出）。TrueType/OpenType の cmap（format 4／12）だけを読む最小パーサ（依存なし・決定的・R-108）
// - satori はグリフの無い文字を空白／豆腐で描き、エラーにしない。図の文字が「プランどおり」でなくなるため、描画前に検出する
// - Google Fonts の text= サブセットは、そのファミリに無い文字を黙って落とす＝返ってきた TTF の cmap を見れば欠字が分かる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** TTF/OTF（sfnt）の cmap から対応コードポイント集合を作る。読めない構造は空集合（fail-closed＝欠字扱い） */
export function fontCodepoints(buffer: ArrayBuffer): Set<number> {
  const out = new Set<number>();
  try {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 12) return out;
    const numTables = dv.getUint16(4);
    let cmapOffset = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (rec + 16 > buffer.byteLength) break;
      const tag = String.fromCharCode(dv.getUint8(rec), dv.getUint8(rec + 1), dv.getUint8(rec + 2), dv.getUint8(rec + 3));
      if (tag === 'cmap') {
        cmapOffset = dv.getUint32(rec + 8);
        break;
      }
    }
    if (cmapOffset < 0 || cmapOffset + 4 > buffer.byteLength) return out;
    const n = dv.getUint16(cmapOffset + 2);
    for (let i = 0; i < n; i++) {
      const rec = cmapOffset + 4 + i * 8;
      if (rec + 8 > buffer.byteLength) break;
      const platformId = dv.getUint16(rec);
      const encodingId = dv.getUint16(rec + 2);
      const sub = cmapOffset + dv.getUint32(rec + 4);
      if (sub + 4 > buffer.byteLength) continue;
      // Unicode（platform 0）か Windows Unicode（3/1・3/10）だけ読む
      if (!(platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10)))) continue;
      const format = dv.getUint16(sub);
      if (format === 4) {
        const segX2 = dv.getUint16(sub + 6);
        const segs = segX2 / 2;
        const endP = sub + 14;
        const startP = endP + segX2 + 2;
        const deltaP = startP + segX2;
        const rangeP = deltaP + segX2;
        for (let s = 0; s < segs; s++) {
          const end = dv.getUint16(endP + s * 2);
          const start = dv.getUint16(startP + s * 2);
          const delta = dv.getInt16(deltaP + s * 2);
          const rangeOffset = dv.getUint16(rangeP + s * 2);
          if (start === 0xffff) continue;
          for (let c = start; c <= end && c !== 0xffff; c++) {
            if (rangeOffset === 0) {
              if (((c + delta) & 0xffff) !== 0) out.add(c);
            } else {
              const gi = rangeP + s * 2 + rangeOffset + (c - start) * 2;
              if (gi + 2 > buffer.byteLength) continue;
              const g = dv.getUint16(gi);
              if (g !== 0 && ((g + delta) & 0xffff) !== 0) out.add(c);
            }
          }
        }
      } else if (format === 12) {
        const nGroups = dv.getUint32(sub + 12);
        for (let g = 0; g < nGroups; g++) {
          const rec2 = sub + 16 + g * 12;
          if (rec2 + 12 > buffer.byteLength) break;
          const start = dv.getUint32(rec2);
          const end = dv.getUint32(rec2 + 4);
          const startGlyph = dv.getUint32(rec2 + 8);
          for (let c = start; c <= end && c - start < 0x20000; c++) if (startGlyph + (c - start) !== 0) out.add(c);
        }
      }
    }
  } catch {
    return new Set<number>();
  }
  return out;
}

/** 描画対象の文字のうち、どのフォントにも無いもの（重複なし・出現順）。空白・改行は数えない */
export function uncoveredChars(text: string, fonts: readonly ArrayBuffer[]): string[] {
  const covered = new Set<number>();
  for (const f of fonts) for (const c of fontCodepoints(f)) covered.add(c);
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (!covered.has(cp) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** 欠字を院長に示す文言（決定的） */
export function missingGlyphMessage(chars: readonly string[]): string {
  return `描画フォントに無い文字があります: ${chars.map((c) => `「${c}」(U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(' ')}。プランの文字を別の表記に直してください（文字はプランどおりに描くため置き換えません）`;
}
