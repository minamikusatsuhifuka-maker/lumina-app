'use client';
import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'login' ? 'login' : 'register');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (tab === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setLoading(false); return; }
      }
      const result = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
      if (result?.error) { setError('メールアドレスまたはパスワードが違います'); setLoading(false); return; }
      router.push('/dashboard');
    } catch { setError('エラーが発生しました'); setLoading(false); }
  };

  const inputStyle = { padding: '11px 14px', background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 14, outline: 'none', width: '100%' };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07080f', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 auto 12px' }}>x</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f0f0ff' }}>xLUMINA</div>
          </Link>
        </div>
        <div style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.15)', borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', marginBottom: 24, background: '#0d0e1a', borderRadius: 8, padding: 4 }}>
            {['register', 'login'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 8, borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: tab === t ? '#6c63ff' : 'transparent', color: tab === t ? '#fff' : '#7070a0' }}>
                {t === 'register' ? '新規登録' : 'ログイン'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tab === 'register' && (
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="お名前" required style={inputStyle} />
            )}
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="メールアドレス" required style={inputStyle} />
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="パスワード（6文字以上）" required minLength={6} style={inputStyle} />
            {error && <div style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center' }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: 12, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '処理中...' : tab === 'register' ? 'アカウントを作成' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return <Suspense><AuthForm /></Suspense>;
}
