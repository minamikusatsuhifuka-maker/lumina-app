// 共通メール送信（最小版 = フェーズ①）。
// 既存の batch-research の Resend 作法（from: 'xLUMINA <noreply@xlumina.jp>' / RESEND_API_KEY）を踏襲。
// 後でフェーズ①の本格版が来ても同名関数で拡張できるよう、薄く実装する。

// HTMLエスケープ（メール本文・保存表示の動的値に使用）
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 簡易メールレイアウト（タイトル＋本文HTML）
export function renderEmailLayout(opts: { title: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f6fb;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,'Hiragino Sans',sans-serif;color:#1f2433;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f2;">
    <div style="background:linear-gradient(135deg,#6c63ff,#00d4b8);padding:18px 24px;color:#fff;font-weight:700;font-size:16px;">
      xLUMINA
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:18px;color:#1f2433;">${escapeHtml(opts.title)}</h1>
      <div style="font-size:14px;line-height:1.7;color:#3a4051;">${opts.bodyHtml}</div>
    </div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#9098ad;font-size:11px;border-top:1px solid #eef0f6;">
      このメールは南草津皮フ科クリニックの日程調整システムから自動送信されています。
    </div>
  </div>
</body></html>`;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

// Resend 経由でメール送信。RESEND_API_KEY 未設定なら送信せず ok:false を返す（呼び出し側で扱う）。
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY 未設定のため送信スキップ');
    return { ok: false, error: 'メール送信が未設定です' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'xLUMINA <noreply@xlumina.jp>',
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] Resend 失敗', res.status, body);
      return { ok: false, error: `送信に失敗しました(${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] 送信例外', e);
    return { ok: false, error: '送信に失敗しました' };
  }
}
