'use client';

import { useEffect, useRef, useState } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; timestamp: string }
interface Chapter {
  id?: number;
  chapterNumber?: number;
  number?: number;
  title: string;
  summary?: string;
  targetWordCount?: number;
  target_word_count?: number;
  content?: string;
  researchData?: string;
  references?: any[];
  evaluation?: any;
  improvements?: any[];
  isPolished?: boolean;
  spellChecked?: boolean;
  status?: string;
  keyMessages?: string[];
  emotionalHook?: string;
  // SSEベース評価・改善（新機能）
  evaluationScore?: number | null;
  evaluation_score?: number | null;
  advice?: string | null;
  improvedContent?: string | null;
  improved_content?: string | null;
  version?: number;
}
interface BookMeta {
  title?: string; subtitle?: string; catchphrase?: string; genre?: string;
  targetAudience?: string; differentiationPoints?: string[];
  marketingHooks?: string[]; language?: string;
}
interface Book {
  id: number; title: string; subtitle?: string; language: string;
  genre?: string; targetAudience?: string;
  targetWordCount: number; currentWordCount: number;
  status: string; phase: number;
  messages?: Message[]; bookMeta?: BookMeta;
  tableOfContents?: any[];
}

const PHASES = [
  { num: 1, label: '市場分析', icon: '📊' },
  { num: 2, label: 'コンセプト', icon: '✍️' },
  { num: 3, label: '目次設計', icon: '📋' },
  { num: 4, label: '章詳細', icon: '🔍' },
  { num: 5, label: '本文生成', icon: '📝' },
  { num: 6, label: '評価・改善', icon: '✅' },
  { num: 7, label: '完成', icon: '🚀' },
];

export default function KindlePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'chapters' | 'preview' | 'export'>('chat');
  const [generatingChapterId, setGeneratingChapterId] = useState<number | null>(null);
  const [evaluatingChapterId, setEvaluatingChapterId] = useState<number | null>(null);
  const [exportData, setExportData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  // SSEベースの評価・改善（新機能）
  const [evaluatingSseId, setEvaluatingSseId] = useState<number | null>(null);
  const [improvingSseId, setImprovingSseId] = useState<number | null>(null);
  const [selectedChapterForReview, setSelectedChapterForReview] = useState<number | null>(null);
  const [streamingEvaluation, setStreamingEvaluation] = useState('');
  const [streamingImprovement, setStreamingImprovement] = useState('');
  const [showImproved, setShowImproved] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadBooks(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  const loadBooks = async () => {
    try {
      const res = await fetch('/api/kindle');
      const data = await res.json();
      setBooks(data.books ?? []);
    } catch {}
  };

  const createNewBook = async () => {
    const language = confirm('英語で作成しますか？（OK: 英語 / キャンセル: 日本語）') ? 'en' : 'ja';
    const res = await fetch('/api/kindle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新しい書籍', language }),
    });
    const { book } = await res.json();
    await loadBook(book.id);
    loadBooks();
  };

  const loadBook = async (bookId: number) => {
    const res = await fetch(`/api/kindle?id=${bookId}`);
    const { book, chapters: chs } = await res.json();
    setCurrentBook(book);
    setChapters(chs ?? []);
    setMessages(book.messages ?? []);
    setActiveTab('chat');
    setExportData(null);

    if ((book.messages ?? []).length === 0) {
      const initMsg: Message = {
        role: 'assistant',
        content: `📚 Phase 1: 市場分析・ジャンル提案\n\nKindle書籍の作成を始めましょう！\n\nまず、どんなジャンルに興味がありますか？\n\n現在Kindleで売れているジャンル例：\n\n- 📈 ビジネス・自己啓発（最大市場・競合多い）\n- 💰 投資・お金・副業（高需要・購買意欲高い）\n- 🧠 心理学・メンタル（幅広い読者層）\n- 🏥 健康・ダイエット（繰り返し購入されやすい）\n- 💻 IT・プログラミング（専門性で差別化しやすい）\n- 🎯 マーケティング・SNS（ビジネス系に需要）\n- 👶 子育て・教育（感情的購買が起きやすい）\n\nどのジャンルが気になりますか？すでに書きたいテーマがあれば教えてください！`,
        timestamp: new Date().toISOString(),
      };
      setMessages([initMsg]);
      await saveMessages(book.id, [initMsg]);
    }
  };

  const deleteBook = async (bookId: number) => {
    if (!confirm('この書籍を削除しますか？章データも一緒に削除されます。')) return;
    await fetch(`/api/kindle?id=${bookId}`, { method: 'DELETE' });
    if (currentBook?.id === bookId) {
      setCurrentBook(null);
      setChapters([]);
      setMessages([]);
    }
    loadBooks();
  };

  const saveMessages = async (bookId: number, msgs: Message[]) => {
    await fetch('/api/kindle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookId, messages: msgs }),
    });
  };

  const refreshChapters = async (bookId: number) => {
    const res = await fetch(`/api/kindle?id=${bookId}`);
    const { book, chapters: chs } = await res.json();
    setCurrentBook(book);
    setChapters(chs ?? []);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || !currentBook) return;
    setInput('');
    const userMsg: Message = { role: 'user', content, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/kindle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          bookContext: {
            title: currentBook.title,
            language: currentBook.language,
            genre: currentBook.genre,
            targetAudience: currentBook.targetAudience,
            bookMeta: currentBook.bookMeta,
            tableOfContents: chapters,
            phase: currentBook.phase,
          },
          phase: currentBook.phase,
        }),
      });
      if (!res.body) throw new Error('レスポンスボディなし');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              fullText += event.text;
              setStreamingText(fullText);
            } else if (event.type === 'done') {
              // book-meta-json
              const metaMatch = fullText.match(/```book-meta-json\s*\n?([\s\S]*?)\n?```/);
              if (metaMatch) {
                try {
                  const meta = JSON.parse(metaMatch[1]);
                  await fetch('/api/kindle', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: currentBook.id,
                      title: meta.title,
                      subtitle: meta.subtitle,
                      bookMeta: meta,
                      genre: meta.genre,
                      targetAudience: meta.targetAudience,
                      phase: 3,
                    }),
                  });
                  setCurrentBook(prev => prev ? { ...prev, title: meta.title, subtitle: meta.subtitle, bookMeta: meta, genre: meta.genre, targetAudience: meta.targetAudience, phase: 3 } : prev);
                } catch (e) { console.error('book-meta解析失敗', e); }
              }

              // toc-json
              const tocMatch = fullText.match(/```toc-json\s*\n?([\s\S]*?)\n?```/);
              if (tocMatch) {
                try {
                  const toc = JSON.parse(tocMatch[1]);
                  for (const ch of (toc.chapters ?? [])) {
                    await fetch('/api/kindle/chapters', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        bookId: currentBook.id,
                        chapterNumber: ch.number,
                        title: ch.title,
                        summary: ch.summary,
                        targetWordCount: ch.targetWordCount ?? 3000,
                      }),
                    });
                  }
                  await fetch('/api/kindle', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentBook.id, phase: 5, tableOfContents: toc.chapters }),
                  });
                  setCurrentBook(prev => prev ? { ...prev, phase: 5 } : prev);
                  await refreshChapters(currentBook.id);
                  setActiveTab('chapters');
                } catch (e) { console.error('toc解析失敗', e); }
              }

              const assistantMsg: Message = { role: 'assistant', content: fullText, timestamp: new Date().toISOString() };
              const finalMessages = [...updatedMessages, assistantMsg];
              setMessages(finalMessages);
              setStreamingText('');
              await saveMessages(currentBook.id, finalMessages);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`エラー: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const generateChapter = async (chapter: Chapter) => {
    if (!currentBook || !chapter.id) return;
    setGeneratingChapterId(chapter.id);

    try {
      await fetch('/api/kindle/chapters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chapter.id, status: 'researching' }),
      });

      const res = await fetch('/api/kindle/generate-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter,
          bookMeta: currentBook.bookMeta,
          language: currentBook.language,
          targetWordCount: chapter.targetWordCount ?? chapter.target_word_count,
        }),
      });
      if (!res.body) throw new Error('レスポンスボディなし');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let researchData = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'research_done') researchData = event.research;
            else if (event.type === 'delta') content += event.text;
            else if (event.type === 'done') {
              await fetch('/api/kindle/chapters', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: chapter.id, content, researchData, status: 'reviewing' }),
              });
              await refreshChapters(currentBook.id);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`生成エラー: ${err?.message || err}`);
    } finally {
      setGeneratingChapterId(null);
    }
  };

  // SSEベース：章を分析・評価（advice欄に保存）
  const handleEvaluateChapter = async (chapterId: number) => {
    if (!currentBook) return;
    setEvaluatingSseId(chapterId);
    setSelectedChapterForReview(chapterId);
    setStreamingEvaluation('');

    try {
      const res = await fetch('/api/kindle/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', chapterId }),
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setStreamingEvaluation(fullText);
              } else if (event.type === 'done') {
                setStreamingEvaluation('');
                await loadBook(currentBook.id);
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } finally {
      setEvaluatingSseId(null);
    }
  };

  // SSEベース：章をAIで自動改善（improved_contentに保存）
  const handleImproveChapter = async (chapterId: number) => {
    if (!currentBook) return;
    setImprovingSseId(chapterId);
    setSelectedChapterForReview(chapterId);
    setStreamingImprovement('');

    try {
      const res = await fetch('/api/kindle/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'improve', chapterId }),
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setStreamingImprovement(fullText);
              } else if (event.type === 'done') {
                setStreamingImprovement('');
                setShowImproved((prev) => ({ ...prev, [chapterId]: true }));
                await loadBook(currentBook.id);
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } finally {
      setImprovingSseId(null);
    }
  };

  const evaluateChapter = async (chapter: Chapter, mode: 'evaluate' | 'improve' | 'spellcheck') => {
    if (!chapter.content || !chapter.id || !currentBook) return;
    setEvaluatingChapterId(chapter.id);
    try {
      const res = await fetch('/api/kindle/evaluate-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: chapter.content,
          chapter,
          bookMeta: currentBook.bookMeta,
          mode,
          language: currentBook.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'エラー');

      if (mode === 'evaluate') {
        await fetch('/api/kindle/chapters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chapter.id, evaluation: data, improvements: data.improvements ?? [] }),
        });
      } else if (mode === 'improve') {
        await fetch('/api/kindle/chapters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chapter.id, content: data.improvedContent, isPolished: true, status: 'done' }),
        });
      } else if (mode === 'spellcheck') {
        await fetch('/api/kindle/chapters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chapter.id, content: data.correctedContent ?? chapter.content, spellChecked: true }),
        });
      }
      await refreshChapters(currentBook.id);
    } catch (err: any) {
      console.error(err);
      alert(`評価エラー: ${err?.message || err}`);
    } finally {
      setEvaluatingChapterId(null);
    }
  };

  const handleExport = async () => {
    if (!currentBook) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/kindle/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: currentBook.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'エクスポートエラー');
      setExportData(data);
      setActiveTab('export');
      await refreshChapters(currentBook.id);
    } catch (err: any) {
      alert(`エクスポートエラー: ${err?.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = (content: string) => content
    .replace(/```book-meta-json[\s\S]*?```/g, '')
    .replace(/```toc-json[\s\S]*?```/g, '')
    .trim();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左サイドバー */}
      <aside style={{
        width: 240, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex', flexDirection: 'column' as const,
      }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            📚 Kindle書籍生成
          </h2>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>AIと対話で書籍自動作成</p>
          <button
            onClick={createNewBook}
            style={{
              width: '100%', padding: '8px 12px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >
            ＋ 新しい書籍を作る
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' as const, padding: 10, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {books.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' as const, padding: 20 }}>
              まだ書籍がありません
            </div>
          )}
          {books.map(book => (
            <div
              key={book.id}
              onClick={() => loadBook(book.id)}
              style={{
                position: 'relative' as const,
                padding: 10, borderRadius: 8,
                border: currentBook?.id === book.id ? '1px solid #6366f1' : '1px solid var(--border)',
                background: currentBook?.id === book.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, paddingRight: 18 }}>
                {book.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                  {book.language === 'en' ? '🇺🇸 英語' : '🇯🇵 日本語'}
                </span>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                  background: book.status === 'completed' ? 'rgba(34,197,94,0.18)' : book.status === 'writing' ? 'rgba(59,130,246,0.18)' : 'rgba(245,158,11,0.18)',
                  color: book.status === 'completed' ? '#15803d' : book.status === 'writing' ? '#2563eb' : '#ca8a04',
                }}>
                  {PHASES.find(p => p.num === book.phase)?.icon} P{book.phase}
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                {(book.currentWordCount ?? 0).toLocaleString()} / {(book.targetWordCount ?? 0).toLocaleString()}字
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteBook(book.id); }}
                title="削除"
                style={{
                  position: 'absolute' as const, top: 6, right: 6,
                  width: 18, height: 18, borderRadius: 4,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {!currentBook ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div style={{ textAlign: 'center' as const, maxWidth: 540, padding: 30 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📚</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              Kindle書籍自動生成
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
              市場分析→企画→執筆→評価→マーケティングまで<br />
              AIが全工程をサポートします
            </p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 24 }}>
              {PHASES.map(p => (
                <span key={p.num} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(99,102,241,0.1)', color: '#4f46e5',
                  border: '1px solid rgba(99,102,241,0.3)',
                }}>
                  {p.icon} {p.label}
                </span>
              ))}
            </div>
            <button
              onClick={createNewBook}
              style={{
                padding: '12px 28px',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff', border: 'none', borderRadius: 12,
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
              }}
            >
              ＋ 書籍作成を始める
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>
          {/* フェーズ進捗 */}
          <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '8px 14px' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' as const }}>
              {PHASES.map(p => (
                <div key={p.num} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, fontSize: 10,
                  flexShrink: 0,
                  background: currentBook.phase === p.num ? 'rgba(99,102,241,0.18)' : currentBook.phase > p.num ? 'rgba(34,197,94,0.18)' : 'var(--bg-primary)',
                  color: currentBook.phase === p.num ? '#4f46e5' : currentBook.phase > p.num ? '#15803d' : 'var(--text-muted)',
                  fontWeight: currentBook.phase === p.num ? 700 : 500,
                  border: '1px solid var(--border)',
                }}>
                  {p.icon} {p.label} {currentBook.phase > p.num && '✓'}
                </div>
              ))}
            </div>
          </div>

          {/* タブ */}
          <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '0 14px', display: 'flex', gap: 4, paddingTop: 6 }}>
            {([
              { id: 'chat', label: '💬 対話' },
              { id: 'chapters', label: `📝 章管理（${chapters.length}章）` },
              { id: 'preview', label: '👁 プレビュー' },
              { id: 'export', label: '🚀 エクスポート' },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                  color: activeTab === t.id ? '#6366f1' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 対話タブ */}
          {activeTab === 'chat' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto' as const, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 12, background: 'var(--bg-primary)' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                      background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-secondary)',
                      color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' as const, lineHeight: 1.7 }}>
                        {renderContent(m.content)}
                      </div>
                    </div>
                  </div>
                ))}
                {streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' as const, lineHeight: 1.7 }}>
                        {renderContent(streamingText)}
                        <span style={{ display: 'inline-block', width: 6, height: 14, marginLeft: 2, background: '#6366f1', animation: 'pulse 1s ease-in-out infinite' }} />
                      </div>
                    </div>
                  </div>
                )}
                {isLoading && !streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite 0.2s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite 0.4s' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '12px 16px 16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
                  {['もっと具体的に教えて', 'それで進めてください', '別の案も出して', 'ターゲットを絞りたい', '目次を確定して', 'マーケティング要素を強化して'].map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={isLoading}
                      style={{
                        fontSize: 11, padding: '5px 10px', borderRadius: 16,
                        background: 'rgba(99,102,241,0.08)', color: '#4f46e5',
                        border: '1px solid rgba(99,102,241,0.25)',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.4 : 1,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                {/* textarea + 送信ボタン（textareaの下・右寄せ、フローティングボタンと被らない位置） */}
                <div>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="メッセージを入力... (Enterで改行)"
                    rows={3}
                    disabled={isLoading}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '10px 14px',
                      border: '1px solid var(--border)', borderRadius: 12,
                      fontSize: 14, resize: 'none' as const,
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      fontFamily: 'inherit', outline: 'none',
                      opacity: isLoading ? 0.5 : 1,
                      display: 'block',
                      marginBottom: 6,
                    }}
                  />
                  {/* paddingRight: 80 でフローティングボタン1列分（48px + 余白）を回避 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 80 }}>
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={isLoading || !input.trim()}
                      style={{
                        padding: '7px 20px',
                        background: isLoading || !input.trim() ? 'var(--bg-secondary)' : '#4f46e5',
                        color: isLoading || !input.trim() ? 'var(--text-muted)' : '#fff',
                        border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 500,
                        cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                        opacity: isLoading || !input.trim() ? 0.4 : 1,
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {isLoading ? '送信中...' : '送信'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 章管理タブ */}
          {activeTab === 'chapters' && (
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 20, background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' as const, gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📝 章管理・本文生成</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {(currentBook.currentWordCount ?? 0).toLocaleString()} / {(currentBook.targetWordCount ?? 0).toLocaleString()}字
                  </div>
                  {/* 全章一括評価ボタン */}
                  {chapters.length > 0 && chapters.some(c => c.content) && (
                    <button
                      onClick={async () => {
                        if (!confirm(`本文生成済みの章を順番に評価します。よろしいですか？`)) return;
                        for (const c of chapters) {
                          if (!c.id || !c.content) continue;
                          await handleEvaluateChapter(c.id);
                        }
                      }}
                      disabled={evaluatingSseId !== null || improvingSseId !== null}
                      style={{
                        fontSize: 12, padding: '6px 14px', fontWeight: 600,
                        background: '#f59e0b', color: '#fff',
                        border: 'none', borderRadius: 6,
                        cursor: (evaluatingSseId || improvingSseId) ? 'not-allowed' : 'pointer',
                        opacity: (evaluatingSseId || improvingSseId) ? 0.5 : 1,
                      }}
                    >
                      📊 全章を一括評価
                    </button>
                  )}
                </div>
              </div>

              {/* 書籍品質サマリー */}
              {chapters.length > 0 && chapters.some(c => (c.evaluationScore ?? c.evaluation_score) != null) && (
                <div style={{
                  padding: 16, background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16,
                }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
                    📈 書籍品質サマリー
                  </h3>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    {(() => {
                      const scored = chapters.filter(c => (c.evaluationScore ?? c.evaluation_score) != null);
                      const avg = scored.length > 0
                        ? Math.round(scored.reduce((sum, c) => sum + ((c.evaluationScore ?? c.evaluation_score) ?? 0), 0) / scored.length)
                        : null;
                      return avg !== null ? (
                        <div style={{
                          textAlign: 'center' as const, padding: '12px 20px',
                          background: 'var(--bg-primary)', borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}>
                          <div style={{
                            fontSize: 28, fontWeight: 700,
                            color: avg >= 80 ? '#059669' : avg >= 60 ? '#d97706' : '#dc2626',
                          }}>
                            {avg}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            平均スコア/100
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {chapters.map((c, i) => {
                      const score = c.evaluationScore ?? c.evaluation_score;
                      return (
                        <div
                          key={c.id ?? i}
                          onClick={() => c.id && setSelectedChapterForReview(c.id)}
                          style={{
                            textAlign: 'center' as const, padding: '8px 14px',
                            background: 'var(--bg-primary)', borderRadius: 8,
                            border: `1px solid ${score != null
                              ? (score >= 80 ? '#6ee7b7' : score >= 60 ? '#fcd34d' : '#fca5a5')
                              : 'var(--border)'}`,
                            cursor: 'pointer', minWidth: 80,
                          }}
                        >
                          <div style={{
                            fontSize: 18, fontWeight: 700,
                            color: score == null ? 'var(--text-muted)' :
                                   score >= 80 ? '#059669' :
                                   score >= 60 ? '#d97706' : '#dc2626',
                          }}>
                            {score ?? '—'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                            第{i + 1}章
                          </div>
                          {c.status === 'improved' && (
                            <div style={{ fontSize: 9, color: '#4f46e5', marginTop: 1 }}>
                              ✨改善済
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {chapters.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
                  まだ章が作成されていません<br />
                  対話タブで目次を確定すると自動で作成されます
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  {chapters.map(ch => {
                    const isGenerating = generatingChapterId === ch.id;
                    const isEvaluating = evaluatingChapterId === ch.id;
                    const targetCount = ch.targetWordCount ?? ch.target_word_count ?? 3000;
                    return (
                      <div key={ch.id} style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 12, padding: 16,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                第{ch.chapterNumber ?? ch.number}章: {ch.title}
                              </span>
                              <span style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 999,
                                background: ch.status === 'done' ? 'rgba(34,197,94,0.18)' : ch.status === 'reviewing' ? 'rgba(59,130,246,0.18)' : ch.status === 'researching' ? 'rgba(245,158,11,0.18)' : 'var(--bg-primary)',
                                color: ch.status === 'done' ? '#15803d' : ch.status === 'reviewing' ? '#2563eb' : ch.status === 'researching' ? '#ca8a04' : 'var(--text-muted)',
                                fontWeight: 700,
                              }}>
                                {ch.status === 'done' ? '✅ 完成' : ch.status === 'reviewing' ? '📝 レビュー中' : ch.status === 'researching' ? '🔍 生成中' : '⏳ 未生成'}
                              </span>
                              {ch.isPolished && (
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(168,85,247,0.18)', color: '#a855f7', fontWeight: 700 }}>✨ 改善済み</span>
                              )}
                              {ch.spellChecked && (
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(20,184,166,0.18)', color: '#0d9488', fontWeight: 700 }}>🔤 誤字確認済み</span>
                              )}
                              {/* SSE評価スコアバッジ */}
                              {(ch.evaluationScore ?? ch.evaluation_score) != null && (
                                <span style={{
                                  fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                  background: (ch.evaluationScore ?? ch.evaluation_score!) >= 80 ? '#d1fae5' :
                                              (ch.evaluationScore ?? ch.evaluation_score!) >= 60 ? '#fef3c7' : '#fee2e2',
                                  color: (ch.evaluationScore ?? ch.evaluation_score!) >= 80 ? '#065f46' :
                                         (ch.evaluationScore ?? ch.evaluation_score!) >= 60 ? '#92400e' : '#991b1b',
                                  fontWeight: 700,
                                }}>
                                  📊 {ch.evaluationScore ?? ch.evaluation_score}点
                                </span>
                              )}
                              {ch.status === 'improved' && (
                                <span style={{
                                  fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                  background: '#dbeafe', color: '#1e40af', fontWeight: 700,
                                }}>
                                  ✨ 改善版 v{ch.version ?? 2}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{ch.summary}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              目標: {targetCount.toLocaleString()}字
                              {ch.content && ` / 現在: ${ch.content.length.toLocaleString()}字`}
                            </p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => generateChapter(ch)}
                              disabled={!!generatingChapterId || !!evaluatingChapterId}
                              style={{
                                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff', border: 'none', borderRadius: 8,
                                cursor: 'pointer', opacity: (generatingChapterId || evaluatingChapterId) ? 0.4 : 1,
                              }}
                            >
                              {isGenerating ? '生成中...' : '📝 本文生成'}
                            </button>
                            {ch.content && (
                              <>
                                <button
                                  onClick={() => evaluateChapter(ch, 'evaluate')}
                                  disabled={!!evaluatingChapterId || !!generatingChapterId}
                                  style={{
                                    padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
                                    cursor: 'pointer', opacity: (evaluatingChapterId || generatingChapterId) ? 0.4 : 1,
                                  }}
                                >
                                  {isEvaluating ? '処理中...' : '⭐ AI評価'}
                                </button>
                                <button
                                  onClick={() => evaluateChapter(ch, 'improve')}
                                  disabled={!!evaluatingChapterId || !!generatingChapterId}
                                  style={{
                                    padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                    background: '#a855f7', color: '#fff', border: 'none', borderRadius: 8,
                                    cursor: 'pointer', opacity: (evaluatingChapterId || generatingChapterId) ? 0.4 : 1,
                                  }}
                                >
                                  {isEvaluating ? '処理中...' : '✨ 自動改善'}
                                </button>
                                <button
                                  onClick={() => evaluateChapter(ch, 'spellcheck')}
                                  disabled={!!evaluatingChapterId || !!generatingChapterId}
                                  style={{
                                    padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                    background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8,
                                    cursor: 'pointer', opacity: (evaluatingChapterId || generatingChapterId) ? 0.4 : 1,
                                  }}
                                >
                                  {isEvaluating ? '処理中...' : '🔤 誤字チェック'}
                                </button>
                                {/* SSE分析・評価（新機能） */}
                                <button
                                  onClick={() => ch.id && handleEvaluateChapter(ch.id)}
                                  disabled={evaluatingSseId !== null || improvingSseId !== null || !ch.id}
                                  style={{
                                    padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                    background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8,
                                    cursor: 'pointer', opacity: (evaluatingSseId !== null || improvingSseId !== null) ? 0.4 : 1,
                                  }}
                                  title="多角的に分析してスコアと具体的アドバイスを生成"
                                >
                                  {evaluatingSseId === ch.id ? '📊 評価中...' : '📊 分析・評価'}
                                </button>
                                {/* AIブラッシュアップ（評価済みの場合のみ） */}
                                {ch.advice && (
                                  <button
                                    onClick={() => ch.id && handleImproveChapter(ch.id)}
                                    disabled={evaluatingSseId !== null || improvingSseId !== null || !ch.id}
                                    style={{
                                      padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                      background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
                                      cursor: 'pointer', opacity: (evaluatingSseId !== null || improvingSseId !== null) ? 0.4 : 1,
                                    }}
                                    title="アドバイスを元にAIで章を自動改善"
                                  >
                                    {improvingSseId === ch.id ? '✨ 改善中...' : '✨ AIブラッシュアップ'}
                                  </button>
                                )}
                                {/* 原版/改善版トグル */}
                                {(ch.improvedContent || ch.improved_content) && ch.id && (
                                  <button
                                    onClick={() => setShowImproved(prev => ({ ...prev, [ch.id!]: !prev[ch.id!] }))}
                                    style={{
                                      padding: '5px 10px', fontSize: 11, fontWeight: 600,
                                      background: showImproved[ch.id] ? '#ede9fe' : '#f3f4f6',
                                      color: showImproved[ch.id] ? '#5b21b6' : '#6b7280',
                                      border: `1px solid ${showImproved[ch.id] ? '#a78bfa' : '#e5e7eb'}`,
                                      borderRadius: 8, cursor: 'pointer',
                                    }}
                                  >
                                    {showImproved[ch.id] ? '✨ 改善版' : '📄 原版'}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* 評価結果 */}
                        {ch.evaluation && (
                          <div style={{
                            marginTop: 12, padding: 12, borderRadius: 8,
                            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>
                                AI評価: {(ch.evaluation as any).totalScore}点 / 100点
                              </span>
                              {Object.entries((ch.evaluation as any).scores ?? {}).map(([k, v]) => (
                                <span key={k} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                  {k}: {v as number}
                                </span>
                              ))}
                            </div>
                            {((ch.evaluation as any).improvements ?? []).slice(0, 3).map((imp: any, i: number) => (
                              <div key={i} style={{ fontSize: 11, color: '#1e40af', marginTop: 3 }}>
                                {imp.priority === '高' ? '🔴' : '🟡'} {imp.point}: {imp.suggestion}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 本文プレビュー */}
                        {ch.content && (
                          <div style={{
                            marginTop: 10, padding: 10, borderRadius: 8,
                            background: 'var(--bg-primary)', border: '1px solid var(--border)',
                          }}>
                            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                              {ch.content.slice(0, 200)}...
                            </p>
                          </div>
                        )}

                        {/* SSE評価・改善パネル（選択中の章のみ） */}
                        {selectedChapterForReview === ch.id && (
                          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                            {/* ストリーミング中の評価 */}
                            {streamingEvaluation && evaluatingSseId === ch.id && (
                              <div style={{
                                padding: 16, background: 'rgba(245,158,11,0.08)',
                                border: '1px solid #fcd34d', borderRadius: 10, marginBottom: 12,
                              }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                                  📊 分析・評価中...
                                </p>
                                <div style={{
                                  fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const,
                                  color: 'var(--text-primary)', maxHeight: 400, overflowY: 'auto' as const,
                                }}>
                                  {streamingEvaluation}
                                  <span style={{
                                    display: 'inline-block', width: 6, height: 14,
                                    background: '#f59e0b', marginLeft: 2,
                                    animation: 'pulse 0.8s infinite',
                                  }} />
                                </div>
                              </div>
                            )}

                            {/* 保存済みアドバイス（評価レポート） */}
                            {ch.advice && evaluatingSseId !== ch.id && (
                              <div style={{
                                padding: 16, background: 'rgba(245,158,11,0.06)',
                                border: '1px solid #fcd34d', borderRadius: 10, marginBottom: 12,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' as const, gap: 6 }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                                    📊 分析・評価レポート
                                    {(ch.evaluationScore ?? ch.evaluation_score) != null && (
                                      <span style={{
                                        marginLeft: 8, fontSize: 14, fontWeight: 700,
                                        color: (ch.evaluationScore ?? ch.evaluation_score!) >= 80 ? '#059669' :
                                               (ch.evaluationScore ?? ch.evaluation_score!) >= 60 ? '#d97706' : '#dc2626',
                                      }}>
                                        {ch.evaluationScore ?? ch.evaluation_score}点 / 100点
                                      </span>
                                    )}
                                  </p>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(ch.advice ?? '')}
                                    style={{
                                      fontSize: 11, padding: '3px 8px',
                                      border: '1px solid var(--border)', borderRadius: 4,
                                      background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer',
                                    }}
                                  >
                                    📋 コピー
                                  </button>
                                </div>
                                <div style={{
                                  fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const,
                                  color: 'var(--text-primary)', maxHeight: 400, overflowY: 'auto' as const,
                                }}>
                                  {ch.advice}
                                </div>
                                {!(ch.improvedContent || ch.improved_content) && ch.id && (
                                  <button
                                    onClick={() => handleImproveChapter(ch.id!)}
                                    disabled={improvingSseId !== null || evaluatingSseId !== null}
                                    style={{
                                      marginTop: 10, width: '100%', padding: '10px',
                                      background: '#4f46e5', color: '#fff', border: 'none',
                                      borderRadius: 8, fontSize: 13, fontWeight: 600,
                                      cursor: (improvingSseId || evaluatingSseId) ? 'not-allowed' : 'pointer',
                                      opacity: (improvingSseId || evaluatingSseId) ? 0.5 : 1,
                                    }}
                                  >
                                    ✨ このアドバイスを元にAIで章を自動改善する
                                  </button>
                                )}
                              </div>
                            )}

                            {/* ストリーミング中の改善 */}
                            {streamingImprovement && improvingSseId === ch.id && (
                              <div style={{
                                padding: 16, background: 'rgba(167,139,250,0.1)',
                                border: '1px solid #a78bfa', borderRadius: 10, marginBottom: 12,
                              }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#5b21b6', marginBottom: 8 }}>
                                  ✨ AIが章を改善中...
                                </p>
                                <div style={{
                                  fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' as const,
                                  color: 'var(--text-primary)', maxHeight: 400, overflowY: 'auto' as const,
                                }}>
                                  {streamingImprovement}
                                  <span style={{
                                    display: 'inline-block', width: 6, height: 14,
                                    background: '#7c3aed', marginLeft: 2,
                                    animation: 'pulse 0.8s infinite',
                                  }} />
                                </div>
                              </div>
                            )}

                            {/* 改善版表示 */}
                            {(ch.improvedContent || ch.improved_content) && improvingSseId !== ch.id && showImproved[ch.id ?? -1] && (
                              <div style={{
                                padding: 16, background: 'rgba(79,70,229,0.04)',
                                border: '2px solid #a78bfa', borderRadius: 10,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' as const, gap: 6 }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#5b21b6' }}>
                                    ✨ 改善版 v{ch.version ?? 2}
                                  </p>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      onClick={() => navigator.clipboard.writeText((ch.improvedContent ?? ch.improved_content) ?? '')}
                                      style={{
                                        fontSize: 11, padding: '3px 8px',
                                        border: '1px solid #a78bfa', borderRadius: 4,
                                        background: 'var(--bg-primary)', color: '#5b21b6', cursor: 'pointer',
                                      }}
                                    >
                                      📋 コピー
                                    </button>
                                    <button
                                      onClick={() => ch.id && handleImproveChapter(ch.id)}
                                      disabled={improvingSseId !== null || evaluatingSseId !== null}
                                      style={{
                                        fontSize: 11, padding: '3px 8px',
                                        background: '#4f46e5', color: '#fff', border: 'none',
                                        borderRadius: 4, cursor: 'pointer',
                                        opacity: (improvingSseId || evaluatingSseId) ? 0.5 : 1,
                                      }}
                                    >
                                      🔄 再改善
                                    </button>
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' as const,
                                  color: 'var(--text-primary)', maxHeight: 500, overflowY: 'auto' as const,
                                }}>
                                  {ch.improvedContent ?? ch.improved_content}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* プレビュータブ */}
          {activeTab === 'preview' && (
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 30, background: 'var(--bg-primary)' }}>
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {currentBook.title}
                </h1>
                {currentBook.subtitle && (
                  <h2 style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 500 }}>
                    {currentBook.subtitle}
                  </h2>
                )}
                {currentBook.bookMeta?.catchphrase && (
                  <p style={{
                    fontSize: 14, fontStyle: 'italic' as const, color: '#6366f1',
                    borderLeft: '4px solid #6366f1', paddingLeft: 14, marginBottom: 20,
                  }}>
                    {currentBook.bookMeta.catchphrase}
                  </p>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 30 }}>
                  {(currentBook.currentWordCount ?? 0).toLocaleString()}字 ／ {chapters.length}章
                </div>
                {chapters.map(ch => ch.content && (
                  <div key={ch.id} style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                      第{ch.chapterNumber ?? ch.number}章: {ch.title}
                    </h2>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9, whiteSpace: 'pre-wrap' as const }}>
                      {ch.content}
                    </div>
                  </div>
                ))}
                {chapters.every(c => !c.content) && (
                  <div style={{ textAlign: 'center' as const, padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
                    まだ本文が生成されていません
                  </div>
                )}
              </div>
            </div>
          )}

          {/* エクスポートタブ */}
          {activeTab === 'export' && (
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 24, background: 'var(--bg-primary)' }}>
              <div style={{ maxWidth: 900, margin: '0 auto' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                  🚀 エクスポート・マーケティング
                </h3>

                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  style={{
                    marginBottom: 24,
                    padding: '12px 22px',
                    background: isExporting ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: isExporting ? 'var(--text-muted)' : '#fff',
                    border: 'none', borderRadius: 12,
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  {isExporting ? '🔄 マーケティング戦略生成中...' : '🚀 全文エクスポート＆マーケティング戦略生成'}
                </button>

                {exportData && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
                      <button
                        onClick={() => downloadFile(exportData.fullContent, `${currentBook.title}_全文.md`)}
                        style={{
                          padding: 18, borderRadius: 12,
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'center' as const,
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>全文MD</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>全章＋文献</div>
                      </button>
                      <button
                        onClick={() => downloadFile(exportData.marketingStrategy, `${currentBook.title}_マーケティング戦略.md`)}
                        style={{
                          padding: 18, borderRadius: 12,
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'center' as const,
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>マーケティング戦略</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>KDP設定・告知文</div>
                      </button>
                      <button
                        onClick={() => {
                          const content = chapters.map(ch => `# 第${ch.chapterNumber ?? ch.number}章: ${ch.title}\n\n${ch.content ?? ''}`).join('\n\n');
                          downloadFile(content, `${currentBook.title}_本文のみ.txt`);
                        }}
                        style={{
                          padding: 18, borderRadius: 12,
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'center' as const,
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>本文テキスト</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>KDP投稿用</div>
                      </button>
                    </div>

                    <div style={{
                      padding: 20, borderRadius: 12,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                        📈 マーケティング戦略プレビュー
                      </h4>
                      <div style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap' as const, lineHeight: 1.7,
                        maxHeight: 400, overflowY: 'auto' as const,
                      }}>
                        {exportData.marketingStrategy}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
