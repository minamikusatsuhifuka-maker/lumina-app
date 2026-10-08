// AI でタイトル生成（タイムアウト付き）
// fallback は API エラー / タイムアウト時に返される
export async function generateTitleWithTimeout(
  text: string,
  analysisLabel: string,
  fallback: string,
  timeoutMs: number = 15000,
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('/api/text-analysis/generate-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, analysisLabel }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return fallback;
    const data = await res.json();
    return data.title || fallback;
  } catch {
    return fallback;
  }
}

// ファイル名に使えない文字（/ \ : * ? " < > |）を除去
export function sanitizeFilename(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '').trim() || 'untitled';
}

// 日付 YYYYMMDD
export function yyyymmdd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// 書き出しファイル名の共通規則（339）。
// 既存の MD ダウンロードの規則（`タイトル_YYYYMMDD.md`）をそのまま一箇所にまとめたもの。
// - 禁止文字（/ \ : * ? " < > |）は sanitizeFilename で除く
// - 長いタイトルは maxLen（既定60字）で切る（OS/ブラウザ側で切られて末尾が分からなくなるのを防ぐ）
export function exportFileName(title: string, ext: string, maxLen = 60): string {
  const base = sanitizeFilename(title).slice(0, maxLen).trim() || 'untitled';
  return `${base}_${yyyymmdd()}.${ext}`;
}
