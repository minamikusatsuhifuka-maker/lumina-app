// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anthropic API のエラー応答を、そのまま画面に出せる日本語メッセージに変換する（234【1】）
//
// 背景（234で実際に起きた障害）:
//   API が 400「You have reached your specified API usage limits.」を返していたのに、
//   呼び出し側が response.ok を確認せず data.content（= undefined）を
//   extractAnthropicText に渡していたため、常に空文字 → robustJsonParse が失敗し、
//   画面には **「JSONパース失敗」** と表示されていた。
//   → 院長は「目次生成のバグ」と認識し、実際は課金上限という別の問題だった。
//
// 教訓（RULES.md R-33）: 外部APIのエラーを握りつぶして下流の症状に化けさせない。
//   エラーは発生した層で、原因が分かる文言のまま上げる（fail-closed の一部）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AnthropicErrorBody {
  error?: { type?: string; message?: string };
}

/** Anthropic のエラー種別ごとに、院長が次に何をすればよいか分かる文言を足す */
export function describeAnthropicError(status: number, body: unknown): string {
  const err = (body as AnthropicErrorBody | null)?.error;
  const raw = (err?.message ?? '').trim();
  const type = err?.type ?? '';

  // 課金・利用上限（234の実例）。コードの不具合ではないことを明示する
  if (/usage limits?/i.test(raw) || type === 'billing_error') {
    return `AIの利用上限に達しています（アプリの不具合ではありません）。Anthropicコンソールの上限設定をご確認ください。／原文: ${raw}`;
  }
  if (status === 429 || type === 'rate_limit_error') {
    return `AIへのリクエストが混み合っています。少し待ってからもう一度お試しください。／原文: ${raw}`;
  }
  if (status === 401 || type === 'authentication_error') {
    return `AIの認証に失敗しました（APIキーの設定をご確認ください）。／原文: ${raw}`;
  }
  if (status === 529 || type === 'overloaded_error') {
    return `AI側が一時的に高負荷です。少し待ってからもう一度お試しください。／原文: ${raw}`;
  }
  return `AI呼び出しに失敗しました (${status})${raw ? `: ${raw}` : ''}`;
}

/**
 * 235: Gemini へ自動フォールバックすべきエラーか判定する。
 * 「上限・混雑」＝待てば直る/別プロバイダなら通る種類のみ true。
 * 認証エラー・リクエスト不正は設定/実装の問題なのでフォールバックせず、そのまま表面化させる
 * （フォールバックで隠すと、APIキー未設定に永久に気づけなくなる＝R-33の精神）。
 */
export function isFallbackWorthy(status: number, body: unknown): boolean {
  const err = (body as AnthropicErrorBody | null)?.error;
  const raw = err?.message ?? '';
  const type = err?.type ?? '';
  if (/usage limits?|credit balance|quota/i.test(raw)) return true;
  if (type === 'billing_error' || type === 'rate_limit_error' || type === 'overloaded_error') return true;
  return status === 429 || status === 529;
}

/**
 * Anthropic 応答が失敗なら、原因の分かるメッセージで throw する。
 * **成功応答は素通り**するため、既存の呼び出しに `assertAnthropicOk(response, data)` を
 * 1行足すだけで導入できる。
 */
export function assertAnthropicOk(response: { ok: boolean; status: number }, body: unknown): void {
  if (response.ok) return;
  throw new Error(describeAnthropicError(response.status, body));
}
