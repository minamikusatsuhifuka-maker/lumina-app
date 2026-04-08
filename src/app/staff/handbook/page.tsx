'use client';
import { useState, useEffect } from 'react';

export default function StaffHandbookPage() {
  const [handbooks, setHandbooks] = useState<any[]>([]);
  const [selectedHb, setSelectedHb] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch('/api/clinic/handbooks')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setHandbooks(d.filter(h => h.status === 'published'));
        setLoading(false);
      });
  }, []);

  const openHandbook = async (hb: any) => {
    const res = await fetch(`/api/clinic/handbooks/${hb.id}`);
    const data = await res.json();
    setSelectedHb(data);
    const chs = data.chapters || [];
    setChapters(chs);
    setActiveChapter(chs[0] || null);
    setSearch('');
  };

  const filteredChapters = search
    ? chapters.filter(c => c.title?.includes(search) || c.content?.includes(search))
    : chapters;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
      読み込み中...
    </div>
  );

  if (!selectedHb) return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📖 ハンドブック</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>クリニックの理念・ルール・知識をまとめています</p>

      {handbooks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
          公開中のハンドブックがありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {handbooks.map(h => (
            <div key={h.id} onClick={() => openHandbook(h)}
              style={{
                padding: '18px 20px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{h.title}</div>
                  {h.description && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{h.description}</div>}
                </div>
                <span style={{ fontSize: 20, color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 120px)' }}>
      {/* 章リスト（サイドバー） */}
      {sidebarOpen && (
        <div style={{
          width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
          padding: '12px 10px', overflowY: 'auto', background: 'var(--bg-secondary)',
        }}>
          <button onClick={() => { setSelectedHb(null); setChapters([]); setActiveChapter(null); }}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', marginBottom: 10, width: '100%' }}>
            ← 一覧に戻る
          </button>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, lineHeight: 1.4 }}>
            {selectedHb.title}
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 章を検索"
            style={{ width: '100%', padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }} />

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{filteredChapters.length}章</div>

          {filteredChapters.map((ch, i) => {
            const active = activeChapter?.id === ch.id;
            return (
              <button key={ch.id} onClick={() => setActiveChapter(ch)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  fontSize: 12, cursor: 'pointer', marginBottom: 3,
                  background: active ? 'rgba(108,99,255,0.12)' : 'transparent',
                  color: active ? '#6c63ff' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(108,99,255,0.25)' : '1px solid transparent',
                  fontWeight: active ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                <span style={{ opacity: 0.5, marginRight: 4 }}>{i + 1}.</span> {ch.title}
              </button>
            );
          })}
        </div>
      )}

      {/* 本文エリア */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', maxWidth: 720 }}>
        {/* ツールバー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            {sidebarOpen ? '◀ 目次を閉じる' : '▶ 目次を開く'}
          </button>
          {activeChapter && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={chapters.indexOf(activeChapter) === 0}
                onClick={() => { const idx = chapters.indexOf(activeChapter); if (idx > 0) setActiveChapter(chapters[idx - 1]); }}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', opacity: chapters.indexOf(activeChapter) === 0 ? 0.4 : 1 }}>
                ← 前の章
              </button>
              <button
                disabled={chapters.indexOf(activeChapter) === chapters.length - 1}
                onClick={() => { const idx = chapters.indexOf(activeChapter); if (idx < chapters.length - 1) setActiveChapter(chapters[idx + 1]); }}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', opacity: chapters.indexOf(activeChapter) === chapters.length - 1 ? 0.4 : 1 }}>
                次の章 →
              </button>
            </div>
          )}
        </div>

        {activeChapter ? (
          <>
            {/* 章ヘッダー */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                第{chapters.indexOf(activeChapter) + 1}章 / 全{chapters.length}章
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 0, lineHeight: 1.4 }}>
                {activeChapter.title}
              </h2>
              <div style={{ marginTop: 10, height: 3, width: 48, background: 'linear-gradient(135deg, #6c63ff, #ec4899)', borderRadius: 2 }} />
            </div>

            {/* 本文 */}
            <div style={{
              fontSize: 15, color: 'var(--text-secondary)', lineHeight: 2.0,
              whiteSpace: 'pre-wrap', letterSpacing: '0.02em',
            }}>
              {activeChapter.content}
            </div>

            {/* フッター：次の章へ */}
            {chapters.indexOf(activeChapter) < chapters.length - 1 && (
              <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>次の章</div>
                <div onClick={() => setActiveChapter(chapters[chapters.indexOf(activeChapter) + 1])}
                  style={{ padding: '14px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {chapters[chapters.indexOf(activeChapter) + 1].title}
                  </span>
                  <span style={{ color: '#6c63ff' }}>→</span>
                </div>
              </div>
            )}

            {/* 最終章の場合 */}
            {chapters.indexOf(activeChapter) === chapters.length - 1 && (
              <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                すべての章を読み終えました
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>章を選択してください</div>
        )}
      </div>
    </div>
  );
}
