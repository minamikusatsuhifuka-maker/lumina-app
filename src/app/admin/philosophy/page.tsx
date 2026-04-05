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

export default function PhilosophyPage() {
  const [tab, setTab] = useState<'text' | 'txtfile' | 'pdf'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Philosophy | null>(null);
  const [editing, setEditing] = useState(false);

  // テキストファイル
  const [fileItems, setFileItems] = useState<{ name: string; text: string }[]>([]);
  const [txtDragOver, setTxtDragOver] = useState(false);
  const txtFileRef = useRef<HTMLInputElement>(null);

  const txtFileText = fileItems.map(f => `## ${f.name.replace(/\.(txt|md)$/i, '')}\n\n${f.text}`).join('\n\n---\n\n');

  // PDF
  const [pdfText, setPdfText] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI解析
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/clinic/philosophy')
      .then(r => r.json())
      .then(data => {
        if (data && data.id) {
          setSaved(data);
          setTitle(data.title);
          setContent(data.content);
        }
      });
  }, []);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/philosophy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
        setMessage('保存しました');
        setEditing(false);
        // 再取得
        const data = await (await fetch('/api/clinic/philosophy')).json();
        if (data?.id) setSaved(data);
      } else {
        setMessage('保存に失敗しました');
      }
    } catch {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleTextFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.name.match(/\.(txt|md)$/i));
    if (fileArray.length === 0) { setMessage('.txt または .md ファイルを選択してください'); return; }

    const newItems: { name: string; text: string }[] = [];
    for (const file of fileArray) {
      newItems.push({ name: file.name, text: await file.text() });
    }

    setFileItems(prev => {
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

  // fileItems変更時にcontentを同期
  useEffect(() => { if (fileItems.length > 0) setContent(txtFileText); }, [fileItems]);

  const handleTxtDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setTxtDragOver(false);
    handleTextFiles(e.dataTransfer.files);
  };

  const handlePdfUpload = async (file: File) => {
    if (!file || !file.name.endsWith('.pdf')) {
      setMessage('PDFファイルを選択してください');
      return;
    }
    setPdfLoading(true);
    setPdfText('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/clinic/philosophy-pdf', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.content) {
        setPdfText(data.content);
        setContent(data.content);
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

  const handleAnalyze = async () => {
    const targetContent = saved?.content || content;
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

      {/* 入力フォーム（未登録 or 編集モード） */}
      {(!saved || editing) && (
        <>
          {/* タブ */}
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

          {tab === 'text' && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル</label>
              <input
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="例：南草津皮フ科 経営理念"
                style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginBottom: 14, boxSizing: 'border-box' }}
              />
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>理念テキスト</label>
              <textarea
                value={content} onChange={e => setContent(e.target.value)}
                placeholder="クリニックの理念、ミッション、ビジョン、行動指針などを入力してください..."
                style={{ width: '100%', minHeight: 400, padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: saving || !title.trim() || !content.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                }}>
                  {saving ? '保存中...' : '💾 保存する'}
                </button>
                {editing && (
                  <button onClick={() => { setEditing(false); if (saved) { setTitle(saved.title); setContent(saved.content); } }} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    キャンセル
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'txtfile' && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
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

              {/* ファイル名リスト（個別削除対応） */}
              {fileItems.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fileItems.length}ファイル読み込み済み（合計 {txtFileText.length.toLocaleString()}文字）</span>
                    <button onClick={() => setFileItems([])} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>全て削除</button>
                  </div>
                  {fileItems.map(item => (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 3, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ color: '#4ade80', flexShrink: 0 }}>✅</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>({item.text.length.toLocaleString()}文字)</span>
                      </span>
                      <button onClick={() => setFileItems(prev => prev.filter(f => f.name !== item.name))} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: '0 4px' }} title="削除">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {txtFileText && (
                <>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 6 }}>読み込んだテキスト</label>
                  <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                    {txtFileText}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <input
                      value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="タイトルを入力"
                      style={{ flex: 1, padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
                    />
                    <button onClick={handleSave} disabled={saving || !title.trim()} style={{
                      padding: '10px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      background: saving || !title.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                      color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
                    }}>
                      {saving ? '保存中...' : 'このテキストで保存する'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'pdf' && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
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
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 16, marginBottom: 6 }}>抽出されたテキスト</label>
                  <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                    {pdfText}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <input
                      value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="タイトルを入力"
                      style={{ flex: 1, padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
                    />
                    <button onClick={handleSave} disabled={saving || !title.trim()} style={{
                      padding: '10px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      background: saving || !title.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                      color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
                    }}>
                      {saving ? '保存中...' : 'このテキストで保存する'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
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
