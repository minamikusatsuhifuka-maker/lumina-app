'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function HandbookListPage() {
  const router = useRouter();
  const [handbooks, setHandbooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importTitle, setImportTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch('/api/clinic/handbooks').then(r => r.json()).then(d => { if (Array.isArray(d)) setHandbooks(d); setLoading(false); }); }, []);

  const handleImport = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md', 'pdf', 'docx'].includes(ext || '')) { setMessage('.txt / .md / .pdf / .docx ファイルに対応しています'); return; }

    // txt/md はブラウザ側で読み込んでからサーバーに送る（APIは全形式対応）
    setImporting(true); setMessage('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/clinic/handbooks/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.title) { setImportPreview(data); setImportTitle(data.title); }
      else setMessage(data.error || 'ファイルの読み込みに失敗しました');
    } catch { setMessage('読み込みに失敗しました'); }
    finally { setImporting(false); }
  };

  const saveImport = async () => {
    if (!importPreview || !importTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/clinic/handbooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: importTitle, description: '' }) });
      const { id } = await res.json();
      for (const ch of importPreview.chapters || []) {
        await fetch(`/api/clinic/handbooks/${id}/chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: ch.title, content: ch.content, orderIndex: ch.orderIndex }) });
      }
      setShowImport(false); setImportPreview(null);
      router.push(`/admin/handbook/${id}`);
    } catch { setMessage('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const createNew = async () => {
    const res = await fetch('/api/clinic/handbooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新規ハンドブック', description: '' }) });
    const { id } = await res.json();
    router.push(`/admin/handbook/${id}`);
  };

  const deleteHandbook = async (id: string) => {
    if (!confirm('このハンドブックを削除しますか？')) return;
    await fetch(`/api/clinic/handbooks/${id}`, { method: 'DELETE' });
    setHandbooks(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>📖 ハンドブック</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(!showImport)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>📂 ファイルから読み込む</button>
          <button onClick={createNew} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>＋ 新規作成</button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>ハンドブックの作成・章ごとAI編集・出力</p>

      {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

      {showImport && (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 20 }}>
          {!importPreview ? (
            <>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImport(f); }} onClick={() => fileRef.current?.click()} style={{ padding: 40, border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--accent-soft)' : 'transparent' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{importing ? 'AIが章を分割中...' : 'クリックまたはD&Dでファイルをアップロード'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>.txt / .md / .pdf / .docx に対応</div>
              </div>
              <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
            </>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル</label><input value={importTitle} onChange={e => setImportTitle(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} /></div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{importPreview.chapters?.length || 0}章に分割されました：</div>
              {(importPreview.chapters || []).map((ch: any, i: number) => (
                <div key={i} style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ch.orderIndex}. {ch.title}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{ch.content?.length || 0}文字</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={saveImport} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : 'このハンドブックを作成する'}</button>
                <button onClick={() => setImportPreview(null)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : handbooks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>📖</div><div>ハンドブックがありません</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {handbooks.map(h => (
            <div key={h.id} style={{ padding: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Link href={`/admin/handbook/${h.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{h.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(h.updated_at).toLocaleDateString('ja-JP')} 更新</div>
              </Link>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: h.status === 'published' ? 'rgba(74,222,128,0.15)' : 'rgba(245,166,35,0.15)', color: h.status === 'published' ? '#4ade80' : '#f5a623' }}>{h.status === 'published' ? '公開中' : '下書き'}</span>
                <button onClick={() => deleteHandbook(h.id)} style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
