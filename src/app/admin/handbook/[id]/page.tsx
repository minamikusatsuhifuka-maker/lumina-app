'use client';
import { useState, useEffect, use } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';

const QUICK_INSTRUCTIONS = ['わかりやすく', '理念に沿って', '箇条書き化', '具体例を追加', 'トーンを丁寧に'];

export default function HandbookEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [handbook, setHandbook] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 章編集
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // AI改善
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ instruction: string; result: string }[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  // 新章追加
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const fetchData = async () => {
    const res = await fetch(`/api/clinic/handbooks/${id}`);
    const data = await res.json();
    setHandbook(data);
    const chs = data.chapters || [];
    setChapters(chs);
    if (chs.length > 0 && activeIdx < chs.length) {
      setEditTitle(chs[activeIdx].title);
      setEditContent(chs[activeIdx].content);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (chapters[activeIdx]) {
      setEditTitle(chapters[activeIdx].title);
      setEditContent(chapters[activeIdx].content);
      setAiResult('');
      setAiHistory([]);
    }
  }, [activeIdx]);

  const saveChapter = async () => {
    const ch = chapters[activeIdx];
    if (!ch) return;
    setSaving(true);
    await fetch(`/api/clinic/handbooks/${id}/chapters/${ch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle, content: editContent }) });
    setChapters(prev => prev.map((c, i) => i === activeIdx ? { ...c, title: editTitle, content: editContent } : c));
    setMessage('保存しました');
    setSaving(false);
    setTimeout(() => setMessage(''), 2000);
  };

  const addChapter = async () => {
    if (!newChapterTitle.trim()) return;
    const orderIndex = chapters.length + 1;
    await fetch(`/api/clinic/handbooks/${id}/chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newChapterTitle, content: '', orderIndex }) });
    setNewChapterTitle('');
    await fetchData();
    setActiveIdx(chapters.length);
  };

  const deleteChapter = async (chId: string, idx: number) => {
    if (!confirm('この章を削除しますか？')) return;
    await fetch(`/api/clinic/handbooks/${id}/chapters/${chId}`, { method: 'DELETE' });
    await fetchData();
    if (activeIdx >= chapters.length - 1) setActiveIdx(Math.max(0, chapters.length - 2));
  };

  const runAi = async () => {
    if (!aiInstruction.trim() || !chapters[activeIdx]) return;
    setAiLoading(true); setAiResult('');
    const ch = chapters[activeIdx];
    try {
      const res = await fetch(`/api/clinic/handbooks/${id}/chapters/${ch.id}/ai-improve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiInstruction, chapterContent: editContent }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') { acc += json.content; setAiResult(acc); }
            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') { acc += json.delta.text; setAiResult(acc); }
          } catch {}
        }
      }
      setAiHistory(prev => [...prev, { instruction: aiInstruction, result: acc }]);
      setAiInstruction('');
    } catch { setMessage('AI改善に失敗しました'); }
    finally { setAiLoading(false); }
  };

  const applyAi = () => { setEditContent(aiResult); setAiResult(''); };

  const exportFile = async (format: string) => {
    const res = await fetch(`/api/clinic/handbooks/${id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }) });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${handbook?.title || 'handbook'}.${format}`;
    a.click();
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
      {/* 左カラム: 章ナビ */}
      <div style={{ width: 220, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handbook?.title}</div>
        {chapters.map((ch, i) => (
          <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setActiveIdx(i)} style={{
              flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: i === activeIdx ? 'rgba(108,99,255,0.15)' : 'transparent',
              color: i === activeIdx ? 'var(--text-primary)' : 'var(--text-muted)',
              border: i === activeIdx ? '1px solid rgba(108,99,255,0.3)' : '1px solid transparent',
              fontWeight: i === activeIdx ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{i + 1}. {ch.title}</button>
            <button onClick={() => deleteChapter(ch.id, i)} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <input value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChapter(); } }} placeholder="新しい章のタイトル" style={{ flex: 1, padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, outline: 'none' }} />
          <button onClick={addChapter} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(108,99,255,0.15)', color: '#6c63ff', fontSize: 11, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>＋</button>
        </div>
      </div>

      {/* 右カラム: エディタ */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* ツールバー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))} disabled={activeIdx === 0} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>⬅️ 前の章</button>
            <button onClick={() => setActiveIdx(Math.min(chapters.length - 1, activeIdx + 1))} disabled={activeIdx >= chapters.length - 1} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>次の章 ➡️</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => exportFile('md')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>📄 MD出力</button>
            <button onClick={() => exportFile('txt')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>📄 TXT出力</button>
            <a href={`/admin/handbook/${id}/preview`} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>👁 プレビュー</a>
          </div>
        </div>

        {message && <div style={{ padding: 8, background: 'rgba(74,222,128,0.1)', borderRadius: 6, fontSize: 12, color: '#4ade80', marginBottom: 12 }}>{message}</div>}

        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>章がありません。左のパネルから追加してください。</div>
        ) : (
          <>
            {/* 章タイトル */}
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...inputStyle, fontSize: 18, fontWeight: 700, marginBottom: 12 }} />

            {/* 本文 */}
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{ ...inputStyle, minHeight: 400, resize: 'vertical', lineHeight: 1.8, fontSize: 14 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>文字数: {editContent.length}</span>
              <button onClick={saveChapter} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '💾 保存'}</button>
            </div>

            {/* AI改善エリア */}
            <div style={{ marginTop: 24, padding: 18, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>🤖 AIと改善</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {QUICK_INSTRUCTIONS.map(q => (
                  <button key={q} onClick={() => setAiInstruction(q)} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(108,99,255,0.2)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>{q}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runAi(); } }} placeholder="例：新入スタッフ向けにやさしい表現にして" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={runAi} disabled={aiLoading || !aiInstruction.trim()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{aiLoading ? '改善中...' : '🤖 AIに改善してもらう'}</button>
              </div>

              {aiResult && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>AI提案：<ModelBadge model={getSavedModel()} /></div>
                  <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>{aiResult}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={applyAi} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✅ 本文を置き換える</button>
                    <button onClick={() => setAiResult('')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>↩️ キャンセル</button>
                  </div>
                </div>
              )}

              {aiHistory.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>過去のAI提案</div>
                  {aiHistory.map((h, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <button onClick={() => setExpandedHistory(expandedHistory === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                        {expandedHistory === i ? '▼' : '▶'} {h.instruction}
                      </button>
                      {expandedHistory === i && (
                        <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: '0 0 6px 6px', border: '1px solid var(--border)', borderTop: 'none' }}>{h.result}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
