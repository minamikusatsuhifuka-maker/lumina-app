'use client';
import { useState, useEffect } from 'react';

export default function StaffHandbookPage() {
  const [handbooks, setHandbooks] = useState<any[]>([]);
  const [selectedHb, setSelectedHb] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetch('/api/clinic/handbooks').then(r => r.json()).then(d => { if (Array.isArray(d)) setHandbooks(d.filter(h => h.status === 'published')); setLoading(false); }); }, []);

  const openHandbook = async (hb: any) => {
    const res = await fetch(`/api/clinic/handbooks/${hb.id}`);
    const data = await res.json();
    setSelectedHb(data);
    setChapters(data.chapters || []);
    setActiveChapter(data.chapters?.[0] || null);
  };

  const filteredChapters = search ? chapters.filter(c => c.title?.includes(search) || c.content?.includes(search)) : chapters;

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  if (!selectedHb) return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>📖 ハンドブック</h1>
      {handbooks.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>公開中のハンドブックがありません</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {handbooks.map(h => (
            <div key={h.id} onClick={() => openHandbook(h)} style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{h.title}</div>
              {h.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{h.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 120px)' }}>
      {/* 章リスト */}
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto' }}>
        <button onClick={() => { setSelectedHb(null); setChapters([]); setActiveChapter(null); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', marginBottom: 10, width: '100%' }}>← 一覧に戻る</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedHb.title}</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 検索" style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
        {filteredChapters.map((ch, i) => (
          <button key={ch.id} onClick={() => setActiveChapter(ch)} style={{
            width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 2,
            background: activeChapter?.id === ch.id ? 'rgba(108,99,255,0.15)' : 'transparent',
            color: activeChapter?.id === ch.id ? 'var(--text-primary)' : 'var(--text-muted)',
            border: activeChapter?.id === ch.id ? '1px solid rgba(108,99,255,0.3)' : '1px solid transparent',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{i + 1}. {ch.title}</button>
        ))}
      </div>
      {/* 本文 */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {activeChapter ? (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>第{chapters.indexOf(activeChapter) + 1}章　{activeChapter.title}</h2>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 2, whiteSpace: 'pre-wrap' }}>{activeChapter.content}</div>
          </>
        ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>章を選択してください</div>}
      </div>
    </div>
  );
}
