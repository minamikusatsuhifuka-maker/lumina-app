'use client';
import { useState, useEffect, use } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';
import { AITextReviser } from '@/components/clinic/AITextReviser';

const QUICK_INSTRUCTIONS = ['わかりやすく', '理念に沿って', '箇条書き化', '具体例を追加', 'トーンを丁寧に'];

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]); i++;
      }
      const dataLines = tableLines.filter(l => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
      if (dataLines.length > 0) {
        const rows = dataLines.map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">';
        rows.forEach((cells, idx) => {
          html += '<tr style="border-bottom:1px solid var(--border)">';
          cells.forEach(cell => {
            const tag = idx === 0 ? 'th' : 'td';
            const style = idx === 0 ? 'padding:5px 8px;text-align:left;font-weight:700;color:var(--text-primary);background:var(--bg-secondary)' : 'padding:5px 8px;color:var(--text-secondary)';
            const content = cell.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html += `<${tag} style="${style}">${content}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
        result.push(html);
      }
      continue;
    }
    if (/^## (.+)$/.test(line)) {
      result.push(`<h2 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border)">${line.replace(/^## /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h2>`);
      i++; continue;
    }
    if (/^### (.+)$/.test(line)) {
      result.push(`<h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:12px 0 4px">${line.replace(/^### /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h3>`);
      i++; continue;
    }
    if (/^# (.+)$/.test(line)) {
      result.push(`<h1 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 10px">${line.replace(/^# /, '')}</h1>`);
      i++; continue;
    }
    if (/^---$/.test(line.trim())) {
      result.push('<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');
      i++; continue;
    }
    if (/^> (.+)$/.test(line)) {
      const content = line.replace(/^> /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      result.push(`<div style="padding:7px 12px;border-left:3px solid #6c63ff;background:rgba(108,99,255,0.06);margin:5px 0;font-size:12px;color:var(--text-secondary)">${content}</div>`);
      i++; continue;
    }
    if (/^[-*] (.+)$/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] (.+)$/.test(lines[i])) {
        const content = lines[i].replace(/^[-*] /, '').replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>');
        items.push(`<li style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.6">${content}</li>`);
        i++;
      }
      result.push(`<ul style="padding-left:16px;margin:6px 0">${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') { result.push('<div style="height:6px"></div>'); i++; continue; }
    const content = line.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>');
    result.push(`<p style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.8">${content}</p>`);
    i++;
  }
  return result.join('');
}

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

  // ウィザード管理
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [beforeContent, setBeforeContent] = useState('');
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);

  // 理念一致度スコア
  const [ideologyScore, setIdeologyScore] = useState<null | { score: number; reason: string; points: string[] }>(null);
  const [ideologyLoading, setIdeologyLoading] = useState(false);

  // 改善履歴
  const [improveHistories, setImproveHistories] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Step別進捗
  const [stepProgress, setStepProgress] = useState(0);

  // ボスマネ変換・問いかけ
  const [bossConvertLoading, setBossConvertLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionResult, setQuestionResult] = useState('');
  const [questionVisible, setQuestionVisible] = useState(false);

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
      if (chapters[activeIdx].id) loadImproveHistory(chapters[activeIdx].id);
    }
  }, [activeIdx]);

  // AI処理中に進捗バーをゆっくり増やすエフェクト
  useEffect(() => {
    if (!aiLoading) return;

    setStepProgress(0);
    let current = 0;
    const target = 88;
    const duration = 18000;
    const interval = 100;
    const steps = duration / interval;
    const increment = target / steps;

    const timer = setInterval(() => {
      current = Math.min(current + increment, target);
      setStepProgress(Math.round(current));
      if (current >= target) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [aiLoading]);

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

  const checkIdeologyScore = async () => {
    setIdeologyLoading(true);
    setIdeologyScore(null);
    try {
      const res = await fetch('/api/clinic/handbooks/ideology-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterContent: editContent }),
      });
      const data = await res.json();
      if (data.score !== undefined) setIdeologyScore(data);
    } catch {}
    finally { setIdeologyLoading(false); }
  };

  const loadImproveHistory = async (chapterId: string) => {
    if (!chapterId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/clinic/handbooks/improve-history?chapterId=${chapterId}`);
      const data = await res.json();
      if (Array.isArray(data)) setImproveHistories(data);
    } catch {}
    setHistoryLoading(false);
  };

  const saveImproveHistory = async (direction: string, afterContent: string) => {
    const chapter = chapters[activeIdx];
    if (!chapter || !afterContent) return;
    try {
      await fetch('/api/clinic/handbooks/improve-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: chapter.id,
          handbookId: id,
          chapterTitle: editTitle,
          direction,
          beforeContent: editContent,
          afterContent,
          ideologyScore: null,
        }),
      });
      await loadImproveHistory(chapter.id);
    } catch {}
  };

  const convertBossToLead = async () => {
    setBossConvertLoading(true);
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'boss-to-lead', chapterContent: editContent }),
      });
      const data = await res.json();
      if (data.result) {
        setEditContent(data.result);
        setMessage('✅ リードマネジメント型の表現に変換しました');
        saveImproveHistory('ボスマネ→リードマネ変換', data.result);
      }
    } catch { setMessage('❌ 変換に失敗しました'); }
    finally { setBossConvertLoading(false); }
  };

  const generateQuestion = async () => {
    setQuestionLoading(true);
    setQuestionResult('');
    setQuestionVisible(true);
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'add-question', chapterContent: editContent }),
      });
      const data = await res.json();
      if (data.result) setQuestionResult(data.result);
    } catch { setQuestionResult('生成に失敗しました。'); }
    finally { setQuestionLoading(false); }
  };

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
    <>
    <style>{`
      @keyframes handbookSlide {
        0% { transform: translateX(0%); }
        100% { transform: translateX(350%); }
      }
    `}</style>
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
            {/* 保存ボタン行（タイトル上） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button onClick={saveChapter} disabled={saving} style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                {saving ? '保存中...' : '💾 保存'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>文字数: {editContent.length}</span>
            </div>

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


            {/* ボスマネ→リードマネ変換・問いかけ生成 */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={convertBossToLead}
                disabled={bossConvertLoading}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: bossConvertLoading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {bossConvertLoading ? '変換中...' : '🔄 ボスマネ→リードマネ変換'}
              </button>
              <button
                onClick={generateQuestion}
                disabled={questionLoading}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: questionLoading ? 'rgba(6,182,212,0.3)' : 'linear-gradient(135deg, #06b6d4, #0891b2)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {questionLoading ? '生成中...' : '💭 章末問いかけを生成'}
              </button>
            </div>

            {/* 問いかけ結果表示 */}
            {questionVisible && (
              <div style={{ marginTop: 10, padding: 14, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>💭 章末問いかけ（本文に追加できます）</div>
                {questionLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>生成中...</div>
                ) : (
                  <>
                    <div
                      style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(questionResult) }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setEditContent(prev => prev + '\n\n' + questionResult);
                          setQuestionVisible(false);
                          setMessage('✅ 章末に問いかけを追加しました');
                        }}
                        style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: '#06b6d4', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✅ 章末に追加する
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(questionResult).then(() => setMessage('📋 コピーしました！'))}
                        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                      >
                        📋 コピー
                      </button>
                      <button
                        onClick={() => setQuestionVisible(false)}
                        style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                      >
                        閉じる
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 理念一致度スコア */}
            <div style={{ marginTop: 16, padding: 14, background: 'rgba(29,158,117,0.05)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ideologyScore ? 12 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75' }}>🌿 理念一致度スコア</div>
                <button onClick={checkIdeologyScore} disabled={ideologyLoading}
                  style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: ideologyLoading ? 'rgba(29,158,117,0.3)' : '#1D9E75', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {ideologyLoading ? '採点中...' : ideologyScore ? '再採点' : '📊 採点する'}
                </button>
              </div>
              {ideologyScore && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 12, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        width: `${ideologyScore.score}%`, height: '100%', borderRadius: 6,
                        background: ideologyScore.score >= 80 ? '#1D9E75' : ideologyScore.score >= 60 ? '#f59e0b' : '#ef4444',
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: ideologyScore.score >= 80 ? '#1D9E75' : ideologyScore.score >= 60 ? '#f59e0b' : '#ef4444', minWidth: 48 }}>
                      {ideologyScore.score}点
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{ideologyScore.reason}</div>
                  {ideologyScore.points.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {ideologyScore.points.map((p, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', background: 'var(--bg-card)', borderRadius: 6, borderLeft: '3px solid rgba(29,158,117,0.4)' }}>
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI文章強化ウィザード */}
            <div style={{ marginTop: 24, padding: 18, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 14 }}>

              {/* ウィザードヘッダー */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff' }}>🤖 AI改善ウィザード</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([1, 2, 3] as const).map(step => (
                    <button key={step} onClick={() => setWizardStep(step)} style={{
                      width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: wizardStep === step ? '#6c63ff' : wizardStep > step ? '#4ade80' : 'var(--bg-card)',
                      color: wizardStep === step ? '#fff' : wizardStep > step ? '#000' : 'var(--text-muted)',
                    }}>
                      {wizardStep > step ? '✓' : step}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step別進捗バー */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>
                    {aiLoading ? '処理中...' : stepProgress === 100 ? '完了 ✓' : `Step ${wizardStep} / 3`}
                  </span>
                  <span style={{ fontWeight: aiLoading ? 400 : 600, color: stepProgress === 100 ? '#1D9E75' : 'var(--text-muted)' }}>
                    {aiLoading ? '⏳' : `${stepProgress}%`}
                  </span>
                </div>
                <div style={{ height: 8, background: 'rgba(108,99,255,0.15)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: aiLoading ? '5%' : `${stepProgress}%`,
                    background: stepProgress === 100
                      ? 'linear-gradient(90deg, #1D9E75, #4ade80)'
                      : 'linear-gradient(90deg, #6c63ff, #8b5cf6)',
                    borderRadius: 4,
                    transition: 'width 0.5s ease, background 0.3s ease',
                  }} />
                </div>
                {aiLoading && (
                  <div style={{
                    marginTop: 3, height: 4,
                    background: 'rgba(108,99,255,0.1)',
                    borderRadius: 2, overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: '-40%',
                      height: '100%', width: '40%',
                      background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.8), transparent)',
                      animation: 'handbookSlide 1.2s ease-in-out infinite',
                    }} />
                  </div>
                )}
              </div>

              {/* Step 1：現状評価 */}
              {wizardStep === 1 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Step 1 — まず現状を評価する
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    AIがこの章を読んで「改善すべき点」を具体的に教えてくれます
                  </div>
                  <button onClick={async () => {
                    setAiLoading(true); setAiResult('');
                    try {
                      const res = await fetch('/api/clinic/handbooks/enhance', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'evaluate', chapterContent: editContent }),
                      });
                      const data = await res.json();
                      if (data.result) { setAiResult(data.result); setStepProgress(100); }
                    } catch { setStepProgress(0); } finally { setAiLoading(false); }
                  }} disabled={aiLoading} style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: aiLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                  }}>
                    {aiLoading ? '評価中...' : '🔍 この章を評価する'}
                  </button>

                  {aiResult && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 350, overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResult) }}
                      />
                      <button onClick={() => { setWizardStep(2); setStepProgress(0); setAiResult(''); }}
                        style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        ✅ 評価を確認した → Step 2へ
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2：改善方向を選ぶ */}
              {wizardStep === 2 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Step 2 — 改善の方向を選ぶ
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    どんな方向に改善したいですか？ひとつ選んでください
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { k: 'philosophy', l: '🌟 理念・哲学型', d: 'クリニックの理念・先払い哲学を体現した文章に' },
                      { k: 'lead', l: '🤝 リードマネジメント型', d: '内発的動機を引き出す・命令ではなく問いかけに' },
                      { k: 'story', l: '📖 ストーリー型', d: '物語形式でスタッフの心に届く文章に' },
                      { k: 'dialogue', l: '💬 問いかけ・内省型', d: '読んだあと自分で考えたくなる文章に' },
                      { k: 'warm', l: '🤗 温かみ・共感型', d: '感謝と共感を込めた、読んで安心できる文章に' },
                      { k: 'concrete', l: '✅ 具体的行動型', d: '「明日からこう動こう」と思える実践的な文章に' },
                    ].map(t => (
                      <button key={t.k} onClick={async () => {
                        setAiLoading(true); setAiResult('');
                        setBeforeContent(editContent);
                        setShowBeforeAfter(false);
                        try {
                          const res = await fetch('/api/clinic/handbooks/enhance', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'template', template: t.k, chapterContent: editContent }),
                          });
                          const data = await res.json();
                          if (data.result) { setAiResult(data.result); setShowBeforeAfter(true); setStepProgress(100); saveImproveHistory(t.l, data.result); }
                        } catch { setStepProgress(0); } finally { setAiLoading(false); }
                      }} disabled={aiLoading} style={{
                        padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left',
                        opacity: aiLoading ? 0.5 : 1,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{t.l}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.d}</div>
                      </button>
                    ))}
                  </div>

                  {/* 自由指示オプション */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>または自由に指示を入力：</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                        placeholder="例：理念に沿って、患者さんへの感謝を込めた表現に"
                        style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
                      <button onClick={async () => {
                        if (!aiInstruction.trim()) return;
                        setAiLoading(true); setAiResult('');
                        setBeforeContent(editContent);
                        setShowBeforeAfter(false);
                        try {
                          const res = await fetch('/api/clinic/handbooks/enhance', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'rewrite', instruction: aiInstruction, chapterContent: editContent }),
                          });
                          const data = await res.json();
                          if (data.result) { setAiResult(data.result); setShowBeforeAfter(true); setStepProgress(100); saveImproveHistory(aiInstruction.slice(0, 30), data.result); setAiInstruction(''); }
                        } catch { setStepProgress(0); } finally { setAiLoading(false); }
                      }} disabled={aiLoading || !aiInstruction.trim()} style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: aiLoading ? 'rgba(108,99,255,0.3)' : '#6c63ff',
                        color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
                      }}>
                        {aiLoading ? '...' : '🤖 改善'}
                      </button>
                    </div>
                  </div>

                  {/* Before / After 比較 */}
                  {showBeforeAfter && aiResult && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        📊 Before / After 比較
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Before（現在）</div>
                          <div style={{
                            padding: 12, background: 'rgba(239,68,68,0.04)',
                            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8,
                            whiteSpace: 'pre-wrap',
                            height: 480, overflowY: 'auto',
                          }}>
                            {editContent}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', marginBottom: 4 }}>After（AI改善案）</div>
                          <div style={{
                            padding: 12, background: 'rgba(29,158,117,0.04)',
                            border: '1px solid rgba(29,158,117,0.2)', borderRadius: 8,
                            fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8,
                            whiteSpace: 'pre-wrap',
                            height: 480, overflowY: 'auto',
                          }}>
                            {aiResult || '← 上の改善ボタンを押すとここに表示されます'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={() => { setWizardStep(3); setStepProgress(0); }} style={{
                          flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                          background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        }}>
                          ✅ この改善案を採用 → Step 3へ
                        </button>
                        <button onClick={() => { setAiResult(''); setShowBeforeAfter(false); }} style={{
                          padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                        }}>
                          別の方向を試す
                        </button>
                      </div>
                    </div>
                  )}

                  <button onClick={() => setWizardStep(1)} style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    ← Step 1 に戻る
                  </button>
                </div>
              )}

              {/* Step 3：保存・確定 */}
              {wizardStep === 3 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Step 3 — 最終確認して保存する
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    改善した内容を本文に適用し、保存してください
                  </div>

                  {/* 最終プレビュー */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>適用される内容：</div>
                    <div style={{ padding: 14, background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, maxHeight: 300, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResult) }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => {
                      setEditContent(aiResult);
                      setAiResult('');
                      setShowBeforeAfter(false);
                      setStepProgress(100);
                      setWizardStep(1);
                      setMessage('✅ 本文を更新しました。「💾 保存」ボタンで保存してください。');
                      setTimeout(() => setMessage(''), 4000);
                    }} style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}>
                      ✅ 本文に適用する
                    </button>
                    <button onClick={async () => {
                      setEditContent(aiResult);
                      setAiResult('');
                      setShowBeforeAfter(false);
                      setStepProgress(100);
                      setWizardStep(1);
                      setSaving(true);
                      const chapter = chapters[activeIdx];
                      await fetch(`/api/clinic/handbooks/${id}/chapters/${chapter.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: editTitle, content: aiResult }),
                      });
                      setSaving(false);
                      setMessage('✅ 保存しました！');
                      setTimeout(() => setMessage(''), 3000);
                    }} style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                      background: '#4ade80', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}>
                      💾 適用して即保存
                    </button>
                    <button onClick={() => setWizardStep(2)} style={{
                      fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                    }}>
                      ← Step 2 に戻る（別の方向を試す）
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* 改善履歴 */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => { setShowHistory(!showHistory); if (!showHistory && chapters[activeIdx]?.id) loadImproveHistory(chapters[activeIdx].id); }}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>📜 改善履歴（{improveHistories.length}件）</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showHistory ? '▲ 閉じる' : '▼ 開く'}</span>
              </button>

              {showHistory && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historyLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>読み込み中...</div>
                  ) : improveHistories.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                      まだ改善履歴がありません。AI改善を実行すると自動で保存されます。
                    </div>
                  ) : improveHistories.map(h => (
                    <div key={h.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{h.direction || '改善'}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {new Date(h.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => { setEditContent(h.after_content); setMessage('✅ 過去の改善案を復元しました'); }}
                            style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            復元
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('この履歴を削除しますか？')) return;
                              await fetch('/api/clinic/handbooks/improve-history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: h.id }) });
                              setImproveHistories(prev => prev.filter(x => x.id !== h.id));
                            }}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 3 }}>Before</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, maxHeight: 80, overflowY: 'hidden', padding: '6px 8px', background: 'rgba(239,68,68,0.04)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)' }}>
                            {h.before_content.slice(0, 120)}...
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#1D9E75', marginBottom: 3 }}>After</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 80, overflowY: 'hidden', padding: '6px 8px', background: 'rgba(29,158,117,0.04)', borderRadius: 6, border: '1px solid rgba(29,158,117,0.15)' }}>
                            {h.after_content.slice(0, 120)}...
                          </div>
                        </div>
                      </div>
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
    </>
  );
}
