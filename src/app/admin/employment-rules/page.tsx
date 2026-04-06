'use client';
import { useState, useEffect, useRef } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';
import { AITextReviser } from '@/components/clinic/AITextReviser';

export default function EmploymentRulesPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // ファイル読み込み
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI確認
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    fetch('/api/clinic/employment-rules').then(r => r.json()).then(data => {
      if (data && data.id) {
        setSaved(data);
        setTitle(data.title);
        setContent(data.content);
      }
    });
  }, []);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/employment-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
        setMessage('保存しました');
        setEditing(false);
        const data = await (await fetch('/api/clinic/employment-rules')).json();
        if (data?.id) setSaved(data);
      } else { setMessage('保存に失敗しました'); }
    } catch { setMessage('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const handleFileUpload = async (file: File) => {
    setFileLoading(true); setMessage('');
    try {
      // multipart/form-data でAPIに送信（PDF全文抽出・制限なし）
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title || file.name.replace(/\.(txt|md|pdf)$/i, ''));
      const res = await fetch('/api/clinic/employment-rules', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.content) {
        setContent(data.content);
        setTitle(data.title || file.name.replace(/\.(txt|md|pdf)$/i, ''));
        setMessage(`✅ ${data.charCount?.toLocaleString() ?? data.content.length.toLocaleString()}文字を読み込みました`);
        // 再取得して保存済み状態を更新
        const saved = await (await fetch('/api/clinic/employment-rules')).json();
        if (saved?.id) setSaved(saved);
      } else {
        setMessage(data.error || 'ファイル読み込みに失敗しました');
      }
    } catch { setMessage('ファイル読み込みに失敗しました'); }
    finally { setFileLoading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleAnalyze = async () => {
    const target = saved?.content || content;
    if (!target.trim()) return;
    setAnalyzing(true); setAnalysis(null); setMessage('');
    try {
      const apiKey = ''; // サーバーサイドで処理
      const res = await fetch('/api/clinic/employment-rules/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: target }),
      });
      const data = await res.json();
      if (data.topRules) { setAnalysis(data); }
      else { setMessage(data.error || '解析に失敗しました'); }
    } catch { setMessage('解析に失敗しました'); }
    finally { setAnalyzing(false); }
  };

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📋 就業規則</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>就業規則をテキストまたはファイルで登録し、AIで確認できます</p>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* 保存済み表示 */}
      {saved && !editing && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>登録済みの就業規則</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{saved.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{saved.content.length.toLocaleString()}文字</div>
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
              {analyzing ? '解析中...' : '🤖 就業規則をAIで確認する'}
            </button>
          </div>
        </div>
      )}

      {/* 入力フォーム */}
      {(!saved || editing) && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          {/* ファイルアップロード */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: 30, border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'var(--accent-soft)' : 'transparent',
              transition: 'all 0.2s', marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {fileLoading ? '読み込み中...' : 'クリックまたはドラッグ＆ドロップでファイルを読み込み'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>.txt / .md / .pdf に対応</div>
          </div>
          <input ref={fileRef} type="file" accept=".txt,.md,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />

          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：南草津皮フ科 就業規則" style={{ ...inputStyle, marginBottom: 14 }} />

          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>内容</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={30} placeholder="就業規則の内容を入力またはファイルから読み込み..." style={{ ...inputStyle, minHeight: 500, resize: 'vertical', lineHeight: 1.8, fontFamily: 'monospace', fontSize: 13 }} />
          <AITextReviser
            text={content}
            onRevised={(revised) => setContent(revised)}
            defaultPurpose="official"
            purposes={['official', 'simple', 'patient', 'warm']}
          />
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {content.length.toLocaleString()}文字
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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

      {/* AI解析結果 */}
      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🤖 AI解析結果</h2>

          {analysis.topRules && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📌 重要なルールTop10</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(analysis.topRules as string[]).map((r: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span style={{ color: '#6c63ff', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.redZoneRelated && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 10 }}>🚫 レッドゾーン該当条項</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(analysis.redZoneRelated as string[]).map((r: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 8, borderLeft: '3px solid #ef4444' }}>{r}</div>
                ))}
              </div>
            </div>
          )}

          {analysis.staffNotice && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 10 }}>📢 スタッフへの周知事項</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(analysis.staffNotice as string[]).map((r: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 8, borderLeft: '3px solid #4ade80' }}>{r}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AIDialogueButton contextType="handbook" contextLabel="就業規則" />
    </div>
  );
}
