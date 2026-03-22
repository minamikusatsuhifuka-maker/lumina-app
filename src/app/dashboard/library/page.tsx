'use client';
import { useState, useEffect } from 'react';

export default function LibraryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState('all');

  useEffect(() => { fetch('/api/library').then(r => r.json()).then(setItems); }, []);

  const filtered = tab === 'all' ? items : items.filter(i => i.type === tab);
  const del = async (id: string) => {
    await fetch('/api/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setItems(i => i.filter(x => x.id !== id));
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>📚 ライブラリ</h1>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>保存した論文・記事・下書き</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[['all','すべて'],['paper','📄 論文'],['web','🌐 Web'],['draft','✍️ 下書き']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, background: tab === v ? '#6c63ff' : '#12142a', color: tab === v ? '#fff' : '#7878a0' }}>{l}</button>
        ))}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: 60, color: '#5a5a7a' }}><div style={{ fontSize: 40, marginBottom: 12 }}>📭</div><div>保存されたアイテムはありません</div></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item: any) => (
              <div key={item.id} style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0ff', marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#5a5a7a', fontFamily: 'monospace' }}>{item.created_at?.slice(0, 10)}</div>
                </div>
                <button onClick={() => del(item.id)} style={{ padding: '4px 10px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 6, color: '#ff6b6b', cursor: 'pointer', fontSize: 12 }}>削除</button>
              </div>
            ))}
          </div>
      }
    </div>
  );
}
