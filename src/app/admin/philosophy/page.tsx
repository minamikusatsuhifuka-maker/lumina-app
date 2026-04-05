'use client';
import { useState, useEffect, useRef } from 'react';
import { ModelBadge } from '@/components/ModelBadge';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

type Analysis = {
  coreValues: string[];
  mission: string;
  vision: string;
  behaviorPrinciples: string[];
  keywords: string[];
};

type Philosophy = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type SavedFile = {
  id: string;
  name: string;
  content: string;
  char_count: number;
  created_at: string;
};

export default function PhilosophyPage() {
  const [tab, setTab] = useState<'text' | 'txtfile' | 'pdf'>('text');

  // テキスト入力用（ファイルとは独立）
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Philosophy | null>(null);
  const [editing, setEditing] = useState(false);

  // DB保存済みファイル
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);

  // 今回アップロードした未保存ファイル
  const [pendingFiles, setPendingFiles] = useState<{ name: string; text: string }[]>([]);
  const [txtDragOver, setTxtDragOver] = useState(false);
  const txtFileRef = useRef<HTMLInputElement>(null);
  const [fileSaving, setFileSaving] = useState(false);

  // ファイル内容確認モーダル
  const [viewingFile, setViewingFile] = useState<{ name: string; content: string } | null>(null);

  // PDF
  const [pdfText, setPdfText] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI解析
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [message, setMessage] = useState('');

  // 初期データ読み込み
  useEffect(() => {
    // 保存済みファイル一覧を取得
    fetch('/api/clinic/philosophy-files')
      .then(r => r.json())
      .then(data => {
        if (data.files) setSavedFiles(data.files);
      });

    // 手入力テキストを取得
    fetch('/api/clinic/philosophy')
      .then(r => r.json())
      .then(data => {
        if (data.philosophy && data.philosophy.id) {
          setSaved(data.philosophy);
          setManualTitle(data.philosophy.title ?? '');
          setManualContent(data.philosophy.content ?? '');
        }
      });
  }, []);

  // テキスト保存（ファイルとは独立）
  const handleSaveText = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/philosophy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', title: manualTitle, content: manualContent }),
      });
      if (res.ok) {
        setMessage('保存しました');
        setEditing(false);
        const data = await (await fetch('/api/clinic/philosophy')).json();
        if (data.philosophy?.id) setSaved(data.philosophy);
      } else {
        setMessage('保存に失敗しました');
      }
    } catch {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ファイル読み込み → pendingFilesに追加
  const handleTextFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.name.match(/\.(txt|md)$/i));
    if (fileArray.length === 0) { setMessage('.txt または .md ファイルを選択してください'); return; }

    const newItems: { name: string; text: string }[] = [];
    for (const file of fileArray) {
      newItems.push({ name: file.name, text: await file.text() });
    }

    setPendingFiles(prev => {
      const merged = [...prev];
      for (const item of newItems) {
        const idx = merged.findIndex(f => f.name === item.name);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      return merged;
    });
    setMessage(`${newItems.length}ファイルを追加しました`);
  };

  const handleTxtDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setTxtDragOver(false);
    handleTextFiles(e.dataTransfer.files);
  };

  // ファイルをDBに保存
  const handleSaveFiles = async () => {
    if (pendingFiles.length === 0) return;
    setFileSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/philosophy-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: pendingFiles.map(f => ({ name: f.name, content: f.text })) }),
      });
      if (res.ok) {
        setMessage('ファイルを保存しました');
        setPendingFiles([]);
        // 保存済みファイル再取得
        const data = await (await fetch('/api/clinic/philosophy-files')).json();
        if (data.files) setSavedFiles(data.files);
      } else {
        setMessage('ファイル保存に失敗しました');
      }
    } catch {
      setMessage('ファイル保存に失敗しました');
    } finally {
      setFileSaving(false);
    }
  };

  // ファイル削除
  const handleDeleteFile = async (id: string) => {
    if (!confirm('このファイルを削除しますか？')) return;
    try {
      const res = await fetch('/api/clinic/philosophy-files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setSavedFiles(prev => prev.filter(f => f.id !== id));
        setMessage('ファイルを削除しました');
      }
    } catch {
      setMessage('削除に失敗しました');
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!file || !file.name.endsWith('.pdf')) {
      setMessage('PDFファイルを選択してください');
      return;
    }
    setPdfLoading(true);
    setPdfText('');
    setPdfFileName(file.name);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/clinic/philosophy-pdf', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.content) {
        setPdfText(data.content);
        setMessage('PDFからテキストを抽出しました');
      } else {
        setMessage(data.error || 'PDF解析に失敗しました');
      }
    } catch {
      setMessage('PDF解析に失敗しました');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePdfUpload(file);
  };

  // PDF抽出テキストをphilosophy_filesに独立保存
  const handleSavePdf = async () => {
    if (!pdfText.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/philosophy-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ name: pdfFileName || 'アップロードPDF.pdf', content: pdfText }],
        }),
      });
      if (res.ok) {
        setMessage('PDFをファイルとして保存しました');
        setPdfText('');
        setPdfFileName('');
        // 保存済みファイル再取得
        const data = await (await fetch('/api/clinic/philosophy-files')).json();
        if (data.files) setSavedFiles(data.files);
      } else {
        setMessage('保存に失敗しました');
      }
    } catch {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    const targetContent = saved?.content || manualContent;
    if (!targetContent.trim()) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch('/api/clinic/philosophy-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: targetContent }),
      });
      const data = await res.json();
      if (data.coreValues) {
        setAnalysis(data);
      } else {
        setMessage(data.error || '解析に失敗しました');
      }
    } catch {
      setMessage('解析に失敗しました');
    } finally {
      setAnalyzing(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📖 理念管理</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>クリニックの理念をテキストまたはPDFで登録し、AIで解析できます</p>

      {message && (
        <div style={{ padding: 12, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', border: `1px solid ${message.includes('失敗') ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`, borderRadius: 10, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 16 }}>
          {message}
        </div>
      )}

      {/* ファイル内容確認モーダル */}
      {viewingFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setViewingFile(null)}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, maxWidth: 700, width: '100%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📄 {viewingFile.name}</h3>
              <button onClick={() => setViewingFile(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{viewingFile.content}</div>
          </div>
        </div>
      )}

      {/* 保存済み理念の表示 */}
      {saved && !editing && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>登録済みの理念</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{saved.title}</div>
            </div>
            <button onClick={() => setEditing(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
              ✏️ 編集
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
            {saved.content}
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleAnalyze} disabled={analyzing} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', cursor: analyzing ? 'not-allowed' : 'pointer',
              background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
              {analyzing ? '解析中...' : '🤖 AIで理念を解析する'}
            </button>
          </div>
        </div>
      )}

      {/* タブ（常に表示） */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([{ key: 'text' as const, label: '📝 テキスト入力' }, { key: 'txtfile' as const, label: '📄 テキストファイル' }, { key: 'pdf' as const, label: '📋 PDFアップロード' }]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', borderRadius: 8, border: `1px solid ${tab === t.key ? 'var(--border-accent)' : 'var(--border)'}`,
            background: tab === t.key ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'text' && (!saved || editing) && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル</label>
          <input
            value={manualTitle} onChange={e => setManualTitle(e.target.value)}
            placeholder="例：南草津皮フ科 経営理念"
            style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginBottom: 14, boxSizing: 'border-box' }}
          />
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>理念テキスト</label>
          <textarea
            value={manualContent} onChange={e => setManualContent(e.target.value)}
            placeholder="クリニックの理念、ミッション、ビジョン、行動指針などを入力してください..."
            style={{ width: '100%', minHeight: 400, padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleSaveText} disabled={saving || !manualTitle.trim() || !manualContent.trim()} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving || !manualTitle.trim() || !manualContent.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }}>
              {saving ? '保存中...' : '💾 保存する'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(false); if (saved) { setManualTitle(saved.title); setManualContent(saved.content); } }} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'txtfile' && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          {/* 保存済みファイル一覧 */}
          {savedFiles.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>📂 保存済みファイル（{savedFiles.length}件）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedFiles.map(file => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ color: '#4ade80', flexShrink: 0 }}>✅</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>({(file.char_count ?? file.content?.length ?? 0).toLocaleString()}文字)</span>
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setViewingFile({ name: file.name, content: file.content })} style={{ fontSize: 12, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}>確認</button>
                      <button onClick={() => handleDeleteFile(file.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕ 削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 新規アップロードエリア */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>新規アップロード</div>
          <div
            onDragOver={e => { e.preventDefault(); setTxtDragOver(true); }}
            onDragLeave={() => setTxtDragOver(false)}
            onDrop={handleTxtDrop}
            onClick={() => txtFileRef.current?.click()}
            style={{
              padding: 40, border: `2px dashed ${txtDragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, textAlign: 'center', cursor: 'pointer',
              background: txtDragOver ? 'var(--accent-soft)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>クリックまたはドラッグ＆ドロップでファイルをアップロード</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>.txt / .md に対応（複数ファイル同時OK）</div>
          </div>
          <input ref={txtFileRef} type="file" accept=".txt,.md" multiple hidden onChange={e => { if (e.target.files) handleTextFiles(e.target.files); }} />

          {/* 未保存ファイルリスト */}
          {pendingFiles.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>未保存 — {pendingFiles.length}ファイル</div>
              {pendingFiles.map(item => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 3, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ color: '#f59e0b', flexShrink: 0 }}>⏳</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>({item.text.length.toLocaleString()}文字)</span>
                  </span>
                  <button onClick={() => setPendingFiles(prev => prev.filter(f => f.name !== item.name))} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: '0 4px' }} title="削除">✕</button>
                </div>
              ))}
              <button onClick={handleSaveFiles} disabled={fileSaving} style={{
                marginTop: 10, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: fileSaving ? 'not-allowed' : 'pointer',
                background: fileSaving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 14, width: '100%',
              }}>
                {fileSaving ? '保存中...' : '💾 選択ファイルを保存する'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'pdf' && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          {/* 保存済みファイル一覧（PDFタブにも表示） */}
          {savedFiles.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>📂 保存済みファイル（{savedFiles.length}件）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedFiles.map(file => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ color: '#4ade80', flexShrink: 0 }}>✅</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>({(file.char_count ?? file.content?.length ?? 0).toLocaleString()}文字)</span>
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setViewingFile({ name: file.name, content: file.content })} style={{ fontSize: 12, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}>確認</button>
                      <button onClick={() => handleDeleteFile(file.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕ 削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: 40, border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'var(--accent-soft)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {pdfLoading ? 'PDF解析中...' : 'クリックまたはドラッグ＆ドロップでPDFをアップロード'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF形式のみ対応</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }} />

          {pdfText && (
            <>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 16, marginBottom: 6 }}>抽出されたテキスト（{pdfFileName}）</label>
              <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                {pdfText}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                抽出したテキストはファイルとして保存され、手入力の理念テキストは変更されません
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={handleSavePdf} disabled={saving} style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
                }}>
                  {saving ? '保存中...' : '📄 PDFファイルとして保存する'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* AI解析結果 */}
      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🤖 AI解析結果</h2>
            <ModelBadge model="claude" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🎯 ミッション</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{analysis.mission}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🔭 ビジョン</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{analysis.vision}</div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>💎 コアバリュー</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {analysis.coreValues.map((v, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 20, fontSize: 13, color: '#6c63ff', fontWeight: 600 }}>{v}</span>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>📌 行動指針</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {analysis.behaviorPrinciples.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#4ade80', flexShrink: 0 }}>{i + 1}.</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>🏷 キーワード</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {analysis.keywords.map((k, i) => (
                <span key={i} style={{ padding: '4px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>#{k}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      <AIDialogueButton contextType="philosophy" contextLabel="クリニック理念・ビジョン" />
    </div>
  );
}
