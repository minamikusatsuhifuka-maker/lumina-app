'use client';
import { useState, useEffect, use } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';
import { AITextReviser } from '@/components/clinic/AITextReviser';

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

  // AIチャットパネル
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'propose' | 'analyze' | 'free'>('propose');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

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

  const sendChat = async (overrideInput?: string) => {
    const input = overrideInput || chatInput;
    if (!input.trim() && chatMode !== 'analyze') return;
    setChatLoading(true);

    const userMsg = chatMode === 'analyze' && chatMessages.length === 0
      ? 'この章を分析してください。'
      : input;

    const newMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...chatMessages,
      { role: 'user', content: userMsg },
    ];
    setChatMessages(newMessages);
    setChatInput('');

    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          chatMode,
          chapterContent: editContent,
          messages: newMessages,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.result }]);

        // 対話モードで「---」で囲まれた文章は自動適用オファー
        if (chatMode === 'free' && data.result.includes('---')) {
          const match = data.result.match(/---\n([\s\S]+?)\n---/);
          if (match) {
            setAiResult(match[1].trim());
          }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setChatLoading(false);
    }
  };

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
            <AITextReviser
              text={editContent}
              onRevised={(revised) => setEditContent(revised)}
              defaultPurpose="manual"
              purposes={['manual', 'patient', 'simple', 'warm', 'official']}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>文字数: {editContent.length}</span>
              <button onClick={saveChapter} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '💾 保存'}</button>
            </div>

            {/* AI文章強化エリア（4タブ） */}
            <div style={{ marginTop: 24, padding: 18, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>🤖 AI文章強化</div>

              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {[{ k: 'evaluate', l: '📊 評価' }, { k: 'enhance', l: '✍️ 追記言語化' }, { k: 'template', l: '🎨 表現パターン' }, { k: 'rewrite', l: '💬 自由指示' }].map(t => (
                  <button key={t.k} onClick={() => setAiInstruction(t.k === 'rewrite' ? aiInstruction : '')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }} data-tab={t.k}>{t.l}</button>
                ))}
              </div>

              {/* 評価 */}
              <button onClick={async () => {
                setAiLoading(true); setAiResult('');
                try {
                  const res = await fetch('/api/clinic/handbooks/enhance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'evaluate', chapterContent: editContent }) });
                  const data = await res.json();
                  if (data.result) setAiResult(data.result);
                } catch {} finally { setAiLoading(false); }
              }} disabled={aiLoading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
                {aiLoading ? '処理中...' : '🔍 この章を評価・改善アイデアを出す'}
              </button>

              {/* 追記言語化 */}
              <div style={{ marginBottom: 10 }}>
                <textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} placeholder="・患者さんへの感謝を入れたい&#10;・チームワークの大切さを強調&#10;・具体的なエピソードを追加したい" style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontSize: 12, marginBottom: 6 }} />
                <button onClick={async () => {
                  if (!aiInstruction.trim()) return;
                  setAiLoading(true); setAiResult('');
                  try {
                    const res = await fetch('/api/clinic/handbooks/enhance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'enhance', chapterContent: editContent, additionalNotes: aiInstruction }) });
                    const data = await res.json();
                    if (data.result) { setAiResult(data.result); setAiHistory(prev => [...prev, { instruction: `追記: ${aiInstruction.slice(0, 30)}`, result: data.result }]); setAiInstruction(''); }
                  } catch {} finally { setAiLoading(false); }
                }} disabled={aiLoading} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>✍️ AIが言語化して本文に組み込む</button>
              </div>

              {/* 表現パターン */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
                {[
                  { k: 'story', l: '📖 ストーリー型', d: '物語形式で理念を伝える' },
                  { k: 'mission', l: '🎯 ミッション宣言型', d: '力強く・記憶に残る言葉で' },
                  { k: 'dialogue', l: '💬 対話・問いかけ型', d: '問いかけで自己内省を促す' },
                  { k: 'warm', l: '🤝 温かみ・共感型', d: '感謝と共感を込めた文体で' },
                  { k: 'concrete', l: '✅ 具体的行動型', d: '行動基準として使える形に' },
                  { k: 'poetic', l: '🌸 詩的・美しい表現型', d: '読んで美しいと感じる表現に' },
                ].map(t => (
                  <button key={t.k} onClick={async () => {
                    setAiLoading(true); setAiResult('');
                    try {
                      const res = await fetch('/api/clinic/handbooks/enhance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'template', template: t.k, chapterContent: editContent }) });
                      const data = await res.json();
                      if (data.result) { setAiResult(data.result); setAiHistory(prev => [...prev, { instruction: t.l, result: data.result }]); }
                    } catch {} finally { setAiLoading(false); }
                  }} disabled={aiLoading} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.l}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.d}</div>
                  </button>
                ))}
              </div>

              {/* 自由指示（クイックボタン付き） */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {QUICK_INSTRUCTIONS.map(q => (
                  <button key={q} onClick={() => setAiInstruction(q)} style={{ padding: '3px 8px', borderRadius: 14, border: '1px solid rgba(108,99,255,0.2)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>{q}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} placeholder="自由に指示を入力" style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
                <button onClick={runAi} disabled={aiLoading || !aiInstruction.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>{aiLoading ? '...' : '🤖 改善'}</button>
              </div>

              {/* 結果表示 */}
              {aiResult && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>AI結果：<ModelBadge model={getSavedModel()} /></div>
                  <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 350, overflowY: 'auto' }}>{aiResult}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={applyAi} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✅ 本文を置き換える</button>
                    <button onClick={() => setAiResult('')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>↩️ キャンセル</button>
                  </div>
                </div>
              )}

              {/* 履歴 */}
              {aiHistory.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>📜 改善履歴</div>
                  {aiHistory.slice(-3).map((h, i) => (
                    <div key={i} style={{ marginBottom: 3 }}>
                      <button onClick={() => setExpandedHistory(expandedHistory === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>
                        {expandedHistory === i ? '▼' : '▶'} {h.instruction}
                      </button>
                      {expandedHistory === i && (
                        <div style={{ padding: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: '0 0 4px 4px', border: '1px solid var(--border)', borderTop: 'none' }}>
                          {h.result}
                          <button onClick={() => { setEditContent(h.result); setAiResult(''); }} style={{ marginTop: 6, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#6c63ff', fontSize: 10, cursor: 'pointer', display: 'block' }}>↩️ この版に戻す</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* AIブラッシュアップチャット（フローティングパネル） */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
      }}>
        {chatOpen && (
          <div style={{
            width: 380, height: 560,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* ヘッダー */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(236,72,153,0.05))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 AIブラッシュアップ</span>
                <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
              </div>
              {/* モード切替 */}
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  { k: 'propose', l: '💬 提案' },
                  { k: 'analyze', l: '🔍 分析' },
                  { k: 'free', l: '🎙 対話' },
                ] as const).map(m => (
                  <button key={m.k} onClick={() => { setChatMode(m.k); setChatMessages([]); setChatInput(''); }}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: chatMode === m.k ? 'rgba(108,99,255,0.15)' : 'transparent', color: chatMode === m.k ? '#6c63ff' : 'var(--text-muted)', borderColor: chatMode === m.k ? 'rgba(108,99,255,0.4)' : 'var(--border)' }}>
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            {/* メッセージ一覧 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  {chatMode === 'propose' && '「もっと温かみを出したい」「患者への感謝を入れたい」など、話しかけてください'}
                  {chatMode === 'analyze' && (
                    <div>
                      <div style={{ marginBottom: 8 }}>AIがこの章を分析します</div>
                      <button onClick={() => sendChat('analyze')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🔍 今すぐ分析する
                      </button>
                    </div>
                  )}
                  {chatMode === 'free' && '自由に話しかけてください。AIが文章化・整理します'}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}>{msg.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '8px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                    考え中...
                  </div>
                </div>
              )}
            </div>

            {/* aiResultがある場合の適用バナー */}
            {aiResult && chatMode === 'free' && (
              <div style={{ padding: '8px 12px', background: 'rgba(74,222,128,0.1)', borderTop: '1px solid rgba(74,222,128,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#4ade80' }}>✅ 改善案があります</span>
                <button onClick={applyAi} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>本文に反映</button>
              </div>
            )}

            {/* 入力エリア */}
            {chatMode !== 'analyze' && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={chatMode === 'propose' ? 'こうしたい、を話しかける...' : '自由に話しかける...'}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                />
                <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: chatLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  送信
                </button>
              </div>
            )}
          </div>
        )}

        {/* トグルボタン */}
        <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setChatMessages([]); }}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: chatOpen ? 'var(--bg-card)' : 'linear-gradient(135deg, #6c63ff, #ec4899)',
            color: chatOpen ? 'var(--text-muted)' : '#fff',
            fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(108,99,255,0.4)',
          }}>
          {chatOpen ? '✕' : '🤖'}
        </button>
      </div>
    </div>
  );
}
