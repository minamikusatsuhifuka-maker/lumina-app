// 軽量 in-memory レート制限（公開APIの踏み台・総当たり・スパム対策）。
// {key, count, windowStart} を Map で保持。サーバインスタンス単位（Fluid Compute で十分実用）。
// 厳密な分散制御が要る場合は将来 Upstash 等へ差し替え可能な薄いIF。

type Bucket = { count: number; windowStart: number };
const store = new Map<string, Bucket>();

// 古いエントリの肥大化を防ぐ簡易掃除（呼び出し時に確率的に実施）
function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [k, b] of store) {
    if (now - b.windowStart > 24 * 60 * 60 * 1000) store.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

// key 単位で windowMs 内に max 回まで許可。超過は ok:false。
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = store.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= max) {
    return { ok: false, retryAfterMs: windowMs - (now - b.windowStart) };
  }
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

// リクエストからクライアントIPを推定（Vercel/プロキシ環境）
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
