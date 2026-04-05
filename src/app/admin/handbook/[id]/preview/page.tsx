'use client';
import { useState, useEffect, use } from 'react';
import Link from 'next/link';

export default function HandbookPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [handbook, setHandbook] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(`/api/clinic/handbooks/${id}`).then(r => r.json()).then(d => { setHandbook(d); setLoading(false); }); }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!handbook) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ハンドブックが見つかりません</div>;

  const chapters = handbook.chapters || [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Link href={`/admin/handbook/${id}`} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>← エディタに戻る</Link>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{handbook.title}</div>
        {handbook.description && <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{handbook.description}</div>}
        <div style={{ width: 60, height: 2, background: 'linear-gradient(90deg, #6c63ff, #ec4899)', margin: '20px auto 0', borderRadius: 2 }} />
      </div>

      {chapters.map((ch: any, i: number) => (
        <div key={ch.id} style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
            第{i + 1}章　{ch.title}
          </h2>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
            {ch.content}
          </div>
        </div>
      ))}
    </div>
  );
}
