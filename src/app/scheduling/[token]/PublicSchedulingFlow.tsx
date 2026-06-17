'use client';

import { useState } from 'react';

// 外部参加者向けの公開フロー UI（認証なし）。
// 状態機械: email入力 → OTP入力 → NG日選択 → 完了。
// API は /api/scheduling/public/* を叩く。他参加者の情報は一切扱わない。

type Step = 'email' | 'otp' | 'ng' | 'done';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function dateLabel(d: string): string {
  // 'YYYY-MM-DD' をローカル日付ラベルへ（曜日付き）
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(y, (m || 1) - 1, day || 1).getDay();
  return `${m}/${day}（${WEEK[wd] ?? ''}）`;
}

export default function PublicSchedulingFlow({
  token,
  title,
  description,
  candidateDates,
}: {
  token: string;
  title: string;
  description: string | null;
  candidateDates: string[];
}) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [ngSet, setNgSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const post = async (path: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/scheduling/public/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as { ok: boolean; data: any };
  };

  const submitEmail = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { ok, data } = await post('register', { token, email });
      if (!ok) {
        setError(data.error || '送信に失敗しました');
        return;
      }
      setInfo(data.message || '確認コードをメールに送信しました');
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { ok, data } = await post('register', { token, email });
      if (!ok) setError(data.error || '再送に失敗しました');
      else setInfo('確認コードを再送しました');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { ok, data } = await post('verify', { token, email, code });
      if (!ok) {
        setError(data.error || '確認に失敗しました');
        return;
      }
      // 本人確認後、既存のNG回答があれば復元
      const me = await post('me', { token, email });
      if (me.ok && Array.isArray(me.data.ngDates)) {
        setNgSet(new Set(me.data.ngDates));
      }
      setStep('ng');
    } finally {
      setLoading(false);
    }
  };

  const toggleNg = (d: string) => {
    setNgSet((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const submitNg = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { ok, data } = await post('ng-dates', {
        token,
        email,
        dates: Array.from(ngSet),
      });
      if (!ok) {
        setError(data.error || '保存に失敗しました');
        return;
      }
      setStep('done');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 700, marginBottom: 6 }}>日程調整のお願い</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2433', margin: '0 0 8px' }}>{title}</h1>
      {description && (
        <p style={{ fontSize: 13, color: '#5a6075', whiteSpace: 'pre-wrap', margin: '0 0 16px', lineHeight: 1.7 }}>
          {description}
        </p>
      )}

      {/* ステップ表示 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['email', 'otp', 'ng', 'done'] as Step[]).map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background:
                ['email', 'otp', 'ng', 'done'].indexOf(step) >= i ? '#6c63ff' : '#e2e5ef',
            }}
          />
        ))}
      </div>

      {error && <div style={alertErr}>{error}</div>}
      {info && !error && <div style={alertInfo}>{info}</div>}

      {step === 'email' && (
        <div>
          <label style={label}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={input}
            autoComplete="email"
          />
          <p style={hint}>確認コードを上記アドレスにお送りします。</p>
          <button onClick={submitEmail} disabled={loading || !email} style={btnPrimary}>
            {loading ? '送信中...' : '確認コードを送る'}
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div>
          <label style={label}>確認コード（6桁）</label>
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            style={{ ...input, letterSpacing: 8, fontSize: 22, textAlign: 'center' as const }}
          />
          <p style={hint}>メールに届いた6桁のコードを入力してください（有効期限10分）。</p>
          <button onClick={submitCode} disabled={loading || code.length !== 6} style={btnPrimary}>
            {loading ? '確認中...' : '本人確認する'}
          </button>
          <button onClick={resend} disabled={loading} style={btnGhost}>
            コードを再送する
          </button>
        </div>
      )}

      {step === 'ng' && (
        <div>
          <label style={label}>参加できない日を選んでください（NG日）</label>
          <p style={hint}>タップで選択／解除。選んだ日が「参加できない日」です。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8, margin: '12px 0' }}>
            {candidateDates.map((d) => {
              const on = ngSet.has(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleNg(d)}
                  style={{
                    padding: '10px 4px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: on ? '2px solid #ef4444' : '1px solid #d6dae6',
                    background: on ? '#fff1f1' : '#fff',
                    color: on ? '#dc2626' : '#3a4051',
                  }}
                >
                  {dateLabel(d)}
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2 }}>{on ? '✕ NG' : '○ 可'}</div>
                </button>
              );
            })}
          </div>
          <p style={hint}>NGが無ければ何も選ばずに送信できます（全日程OK）。</p>
          <button onClick={submitNg} disabled={loading} style={btnPrimary}>
            {loading ? '送信中...' : `この内容で回答する（NG ${ngSet.size}件）`}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 18, color: '#1f2433', margin: '0 0 6px' }}>回答ありがとうございました</h2>
          <p style={{ fontSize: 13, color: '#5a6075' }}>
            日程が確定しましたら、登録いただいたメールアドレスにご連絡します。
          </p>
        </div>
      )}
    </div>
  );
}

// ── インラインスタイル（公開ページ＝クリーンな明色UI）──
const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18,
  padding: 28, boxShadow: '0 10px 40px rgba(20,24,48,0.18)', border: '1px solid #e6e9f2',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#5a6075', marginBottom: 6 };
const input: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d6dae6',
  fontSize: 15, outline: 'none', boxSizing: 'border-box', color: '#1f2433', background: '#fff',
};
const hint: React.CSSProperties = { fontSize: 12, color: '#9098ad', margin: '8px 0 14px', lineHeight: 1.6 };
const btnPrimary: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg,#6c63ff,#00d4b8)', color: '#fff', fontSize: 15, fontWeight: 700,
};
const btnGhost: React.CSSProperties = {
  width: '100%', padding: '10px', borderRadius: 10, marginTop: 8, cursor: 'pointer',
  background: 'transparent', border: '1px solid #d6dae6', color: '#5a6075', fontSize: 13, fontWeight: 600,
};
const alertErr: React.CSSProperties = {
  background: '#fff1f1', color: '#dc2626', border: '1px solid #f6caca',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14,
};
const alertInfo: React.CSSProperties = {
  background: '#eef6ff', color: '#2563eb', border: '1px solid #cfe2fb',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14,
};
