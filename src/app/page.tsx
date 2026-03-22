import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function Home() {
  const session = await auth();
  if (session) redirect('/dashboard');

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#07080f' }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 auto 24px' }}>L</div>
        <h1 style={{ fontSize: 48, fontWeight: 700, background: 'linear-gradient(90deg, #a89fff, #00d4b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>LUMINA</h1>
        <p style={{ fontSize: 18, color: '#9090b0', marginBottom: 12 }}>AI Research & Writing Suite</p>
        <p style={{ fontSize: 15, color: '#7070a0', marginBottom: 40, lineHeight: 1.7 }}>
          学術文献検索・Web情報収集・AI文章生成を統合した<br/>次世代のリサーチ&ライティングプラットフォーム
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/auth" style={{ padding: '14px 32px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
            はじめる →
          </Link>
          <Link href="/auth?tab=login" style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.06)', color: '#c0c0e0', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15, border: '1px solid rgba(255,255,255,0.1)' }}>
            ログイン
          </Link>
        </div>
      </div>
    </main>
  );
}
