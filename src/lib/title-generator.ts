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
