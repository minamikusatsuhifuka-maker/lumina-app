import { neon } from '@neondatabase/serverless';
import { notFound } from 'next/navigation';

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const shared = await sql`
    SELECT si.*, li.title, li.content, li.group_name, li.created_at as item_created_at
    FROM shared_items si
    JOIN library li ON si.library_item_id = li.id
    WHERE si.id = ${id}
      AND (si.expires_at IS NULL OR si.expires_at > NOW())
  `;

  if (!shared[0]) return notFound();

  const item = shared[0];

  // ビュー数を増やす
  await sql`UPDATE shared_items SET view_count = view_count + 1 WHERE id = ${id}`;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 20,
            background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontWeight: 600,
          }}>
            {item.group_name || '未分類'}
          </span>
          <span style={{ fontSize: 12, color: '#888' }}>
            {new Date(item.item_created_at).toLocaleDateString('ja-JP')}
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>{item.title}</h1>
        <p style={{ fontSize: 12, color: '#888' }}>xLUMINA で共有されたコンテンツ</p>
      </div>
      <div style={{
        fontSize: 14, lineHeight: 1.9, color: '#333',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        padding: 24, background: '#fafafa', borderRadius: 12,
        border: '1px solid #eee',
      }}>
        {item.content}
      </div>
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', textAlign: 'center' }}>
        <a href="https://xlumina.jp" style={{ fontSize: 13, color: '#6c63ff', textDecoration: 'none' }}>
          xLUMINA でAI調査・分析を始める →
        </a>
      </div>
    </div>
  );
}
