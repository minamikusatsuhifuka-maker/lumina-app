'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

/* ---------- 型定義 ---------- */
interface ChapterOutline {
  chapter_num: number;
  title: string;
  summary: string;
  key_points: string[];
  estimated_pages: number;
  illustration_note: string;
}

interface OutlineResult {
  book_title: string;
  subtitle: string;
  tagline: string;
  target_reader: string;
  unique_value: string;
  chapters: ChapterOutline[];
  foreword_outline: string;
  afterword_outline: string;
  cover_text: { front: string; back: string; author_bio: string };
  kdp_keywords: string[];
  kdp_categories: string[];
  estimated_total_pages: number;
  pricing_suggestion: string;
}

interface BrainstormIdea {
  title: string;
  theme: string;
  targetReader: string;
  score: number;
  reason: string;
}

interface EditorResult {
  readability_score: number;
  issues: { type: string; text: string; suggestion: string }[];
  strengths: string[];
}

interface FeedbackPersona {
  name: string;
  age: string;
  occupation: string;
  stars: number;
  comment: string;
  improvement: string;
}

interface CoverPattern {
  style: string;
  description: string;
  midjourney_prompt: string;
  dalle_prompt: string;
}

interface ChecklistItem {
  category: string;
  item: string;
  done: boolean;
}

interface PromoPost {
  platform: string;
  content: string;
  hashtags: string[];
  schedule: string;
}

/* ---------- 定数 ---------- */
const STUDIO_TABS = [
  { key: 'idea', label: '💡 アイデア', desc: 'ブレスト・市場調査' },
  { key: 'outline', label: '📋 構成', desc: '目次・章立て' },
  { key: 'write', label: '✍️ 執筆', desc: '本文生成' },
  { key: 'quality', label: '🔍 品質向上', desc: 'エディター・フィードバック' },
  { key: 'cover', label: '🎨 表紙・販促', desc: 'プロンプト・説明文' },
  { key: 'publish', label: '🚀 出版', desc: 'チェック・プロモーション' },
];

const BOOK_TYPES = [
  { value: 'guide', label: '解説書', icon: '📘' },
  { value: 'novel', label: '小説', icon: '📗' },
  { value: 'picture', label: '絵本', icon: '🎨' },
  { value: 'puzzle', label: 'パズル', icon: '🧩' },
] as const;

const CHAPTER_COUNTS = ['3', '5', '7', '8', '10', '12', '15'];
const PAGE_COUNTS = ['30〜50', '50〜80', '80〜120', '120〜160', '160〜200', '200〜300'];
const WRITING_STYLES = [
  { value: 'polite', label: '丁寧語・解説調' },
  { value: 'casual', label: 'カジュアル・語りかけ' },
  { value: 'academic', label: '学術的・論文調' },
  { value: 'story', label: '物語調・エッセイ風' },
  { value: 'conversation', label: '会話形式' },
];

const SAMPLE_DATA: Record<string, { title: string; theme: string; targetReader: string }> = {
  guide: {
    title: 'ChatGPTで始める副業入門',
    theme: 'AI活用による副業の始め方。プロンプト設計からマネタイズまでを初心者向けに解説',
    targetReader: '副業を始めたい会社員・主婦',
  },
  novel: {
    title: 'AIが紡ぐ恋文',
    theme: 'AI翻訳家と人間の詩人が出会い、言葉の本質について対話する短編ラブストーリー',
    targetReader: 'SF好きの20〜40代読者',
  },
  picture: {
    title: 'プログラミングねこのぼうけん',
    theme: 'プログラミングの基本概念（順次・分岐・繰り返し）を猫の冒険で学ぶ知育絵本',
    targetReader: '5〜8歳の子どもとその親',
  },
  puzzle: {
    title: '脳トレ漢字パズル100',
    theme: '漢字の読み・書き・熟語パズル。クロスワード、穴埋め、しりとり形式',
    targetReader: 'シニア層・漢字好きの大人',
  },
};

export default function KindleStudioPage() {
  /* --- 共通 state --- */
  const [bookType, setBookType] = useState<string>('guide');
  const [activeStudioTab, setActiveStudioTab] = useState<string>('idea');

  /* --- 構成タブ state --- */
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [targetReader, setTargetReader] = useState('');
  const [chapterCount, setChapterCount] = useState('7');
  const [pageCount, setPageCount] = useState('80〜120');
  const [writingStyle, setWritingStyle] = useState('polite');
  const [outline, setOutline] = useState<OutlineResult | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState('');
  const { progress: outlineProgress, loading: outlineProgressLoading, startProgress: startOutline, completeProgress: completeOutline, resetProgress: resetOutline } = useProgress();

  /* --- 執筆タブ state --- */
  const [chapters, setChapters] = useState<Record<number, string>>({});
  const [writingChapter, setWritingChapter] = useState<number | null>(null);
  const [bulkWriting, setBulkWriting] = useState(false);
  const { progress: writeProgress, loading: writeProgressLoading, startProgress: startWrite, completeProgress: completeWrite, resetProgress: resetWrite } = useProgress();

  /* --- アイデアタブ state --- */
  const [brainstormTheme, setBrainstormTheme] = useState('');
  const [brainstormResult, setBrainstormResult] = useState<BrainstormIdea[] | null>(null);
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [keywordResult, setKeywordResult] = useState<{ top7_keywords: string[]; top2_categories: string[] } | null>(null);
  const [isOptimizingKeywords, setIsOptimizingKeywords] = useState(false);
  const [trendResult, setTrendResult] = useState<{ hot_themes: { theme: string; trend_score: number; description: string }[] } | null>(null);
  const [isTrending, setIsTrending] = useState(false);

  /* --- 品質向上タブ state --- */
  const [editingChapter, setEditingChapter] = useState<number>(-1);
  const [editResult, setEditResult] = useState<EditorResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [readerFeedback, setReaderFeedback] = useState<FeedbackPersona[] | null>(null);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [chapterSummary, setChapterSummary] = useState<{ summary: string; key_takeaways: string[] } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  /* --- 表紙・販促タブ state --- */
  const [coverPrompts, setCoverPrompts] = useState<CoverPattern[] | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [descriptionResult, setDescriptionResult] = useState<{ long_description: string; back_cover: string; bullet_points: string[] } | null>(null);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  /* --- 出版タブ state --- */
  const [checklistResult, setChecklistResult] = useState<ChecklistItem[] | null>(null);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [hasImages, setHasImages] = useState(false);
  const [amazonUrl, setAmazonUrl] = useState('');
  const [promoResult, setPromoResult] = useState<PromoPost[] | null>(null);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);

  /* --- コピー済みトースト --- */
  const [copiedKey, setCopiedKey] = useState('');

  /* --- スタイル --- */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 20, marginBottom: 16,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '10px 24px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
    color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '8px 18px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)',
    borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12,
  };

  /* --- ヘルパー: クリップボードコピー --- */
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  /* --- サンプル入力 --- */
  const fillSample = () => {
    const s = SAMPLE_DATA[bookType] || SAMPLE_DATA.guide;
    setTitle(s.title);
    setTheme(s.theme);
    setTargetReader(s.targetReader);
  };

  /* --- ヘルパー: アイデアを適用 --- */
  const applyIdea = (idea: BrainstormIdea) => {
    setTitle(idea.title);
    setTheme(idea.theme);
    setTargetReader(idea.targetReader);
    setActiveStudioTab('outline');
  };

  /* ============================================= */
  /* アイデアタブ API                                */
  /* ============================================= */

  /* --- AIブレインストーム --- */
  const runBrainstorm = async () => {
    if (!brainstormTheme.trim()) return;
    setIsBrainstorming(true);
    setBrainstormResult(null);
    try {
      const res = await fetch('/api/kindle/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: brainstormTheme, bookType }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBrainstormResult(data.ideas || data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`ブレインストーム失敗: ${msg}`);
    } finally {
      setIsBrainstorming(false);
    }
  };

  /* --- KDPキーワード最適化 --- */
  const optimizeKeywords = async () => {
    setIsOptimizingKeywords(true);
    setKeywordResult(null);
    try {
      const res = await fetch('/api/kindle/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: outline?.book_title || title,
          theme: theme,
          targetReader: outline?.target_reader || targetReader,
          bookType,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setKeywordResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`キーワード最適化失敗: ${msg}`);
    } finally {
      setIsOptimizingKeywords(false);
    }
  };

  /* --- トレンド分析 --- */
  const analyzeTrends = async () => {
    setIsTrending(true);
    setTrendResult(null);
    try {
      const res = await fetch('/api/kindle/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookType }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrendResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`トレンド分析失敗: ${msg}`);
    } finally {
      setIsTrending(false);
    }
  };

  /* ============================================= */
  /* 構成タブ API（既存）                             */
  /* ============================================= */

  const generateOutline = async () => {
    if (!title.trim()) return;
    setOutlineLoading(true);
    startOutline();
    setOutlineError('');
    setOutline(null);
    setChapters({});

    try {
      const res = await fetch('/api/kindle/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, bookType, theme, targetReader, chapterCount, pageCount }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutline(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutlineError(`構成案の生成に失敗しました: ${msg}`);
      resetOutline();
    } finally {
      setOutlineLoading(false);
      completeOutline();
    }
  };

  /* ============================================= */
  /* 執筆タブ API（既存）                             */
  /* ============================================= */

  const writeChapter = async (ch: ChapterOutline) => {
    setWritingChapter(ch.chapter_num);
    try {
      const res = await fetch('/api/kindle/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          chapterTitle: ch.title,
          chapterSummary: ch.summary,
          keyPoints: ch.key_points,
          targetReader: outline?.target_reader || targetReader,
          writingStyle: WRITING_STYLES.find(s => s.value === writingStyle)?.label || writingStyle,
          illustrationNote: ch.illustration_note,
          estimatedPages: ch.estimated_pages,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChapters(prev => ({ ...prev, [ch.chapter_num]: data.content }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setChapters(prev => ({ ...prev, [ch.chapter_num]: `【エラー】${msg}` }));
    } finally {
      setWritingChapter(null);
    }
  };

  const writeAllChapters = async () => {
    if (!outline) return;
    setBulkWriting(true);
    startWrite();
    for (const ch of outline.chapters) {
      if (chapters[ch.chapter_num]) continue;
      await writeChapter(ch);
    }
    setBulkWriting(false);
    completeWrite();
  };

  /* ============================================= */
  /* 品質向上タブ API                                */
  /* ============================================= */

  /* --- AIエディター --- */
  const runEditor = async () => {
    if (editingChapter < 0 || !chapters[editingChapter]) return;
    setIsEditing(true);
    setEditResult(null);
    try {
      const res = await fetch('/api/kindle/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterContent: chapters[editingChapter],
          bookType,
          targetReader: outline?.target_reader || targetReader,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEditResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`AIエディター失敗: ${msg}`);
    } finally {
      setIsEditing(false);
    }
  };

  /* --- 読者フィードバック --- */
  const getReaderFeedback = async () => {
    if (!outline) return;
    setIsGettingFeedback(true);
    setReaderFeedback(null);
    try {
      const allContent = outline.chapters
        .filter(ch => chapters[ch.chapter_num])
        .map(ch => chapters[ch.chapter_num])
        .join('\n\n---\n\n');
      const res = await fetch('/api/kindle/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline.book_title,
          bookType,
          content: allContent || '（まだ執筆されていません）',
          targetReader: outline.target_reader,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReaderFeedback(data.personas || data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`読者フィードバック失敗: ${msg}`);
    } finally {
      setIsGettingFeedback(false);
    }
  };

  /* --- 章要約 --- */
  const generateChapterSummary = async () => {
    if (!outline) return;
    setIsGeneratingSummary(true);
    setChapterSummary(null);
    try {
      const allContent = outline.chapters
        .filter(ch => chapters[ch.chapter_num])
        .map(ch => `第${ch.chapter_num}章 ${ch.title}\n${chapters[ch.chapter_num]}`)
        .join('\n\n---\n\n');
      const res = await fetch('/api/kindle/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline.book_title,
          content: allContent || '（まだ執筆されていません）',
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChapterSummary(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`要約生成失敗: ${msg}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  /* ============================================= */
  /* 表紙・販促タブ API                              */
  /* ============================================= */

  /* --- 表紙プロンプト生成 --- */
  const generateCoverPrompts = async () => {
    if (!outline && !title) return;
    setIsGeneratingCover(true);
    setCoverPrompts(null);
    try {
      const res = await fetch('/api/kindle/cover-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          theme: theme,
          targetReader: outline?.target_reader || targetReader,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCoverPrompts(data.patterns || data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`表紙プロンプト生成失敗: ${msg}`);
    } finally {
      setIsGeneratingCover(false);
    }
  };

  /* --- Amazon説明文生成 --- */
  const generateDescription = async () => {
    if (!outline && !title) return;
    setIsGeneratingDesc(true);
    setDescriptionResult(null);
    try {
      const res = await fetch('/api/kindle/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          theme: theme,
          targetReader: outline?.target_reader || targetReader,
          chapters: outline?.chapters.map(ch => ch.title) || [],
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDescriptionResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`説明文生成失敗: ${msg}`);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  /* ============================================= */
  /* 出版タブ API                                   */
  /* ============================================= */

  /* --- チェックリスト生成 --- */
  const generateChecklist = async () => {
    setIsGeneratingChecklist(true);
    setChecklistResult(null);
    try {
      const res = await fetch('/api/kindle/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          hasImages,
          chapterCount: outline?.chapters.length || parseInt(chapterCount),
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChecklistResult(data.items || data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`チェックリスト生成失敗: ${msg}`);
    } finally {
      setIsGeneratingChecklist(false);
    }
  };

  /* --- SNSプロモーション生成 --- */
  const generatePromotion = async () => {
    if (!outline && !title) return;
    setIsGeneratingPromo(true);
    setPromoResult(null);
    try {
      const res = await fetch('/api/kindle/promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          theme: theme,
          targetReader: outline?.target_reader || targetReader,
          amazonUrl: amazonUrl || '',
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPromoResult(data.posts || data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`プロモーション生成失敗: ${msg}`);
    } finally {
      setIsGeneratingPromo(false);
    }
  };

  /* --- エクスポート --- */
  const exportFullBook = () => {
    if (!outline) return;
    const lines: string[] = [];
    lines.push(`# ${outline.book_title}`);
    if (outline.subtitle) lines.push(`## ${outline.subtitle}`);
    lines.push('');
    if (outline.foreword_outline) {
      lines.push('# まえがき');
      lines.push(outline.foreword_outline);
      lines.push('');
    }
    for (const ch of outline.chapters) {
      if (chapters[ch.chapter_num]) {
        lines.push(chapters[ch.chapter_num]);
      } else {
        lines.push(`# 第${ch.chapter_num}章 ${ch.title}`);
        lines.push(`（未執筆: ${ch.summary}）`);
      }
      lines.push('');
    }
    if (outline.afterword_outline) {
      lines.push('# あとがき');
      lines.push(outline.afterword_outline);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kindle_${outline.book_title.replace(/\s/g, '_')}_${Date.now()}.txt`;
    a.click();
  };

  const completedCount = outline ? outline.chapters.filter(ch => chapters[ch.chapter_num]).length : 0;
  const totalCount = outline ? outline.chapters.length : 0;
  const writtenChapterNums = outline ? outline.chapters.filter(ch => chapters[ch.chapter_num]).map(ch => ch.chapter_num) : [];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={outlineProgressLoading || writeProgressLoading} progress={activeStudioTab === 'outline' ? outlineProgress : writeProgress} label={activeStudioTab === 'outline' ? '構成案を生成中...' : '章を執筆中...'} />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📚 Kindle出版自動化スタジオ
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
        AIが本の構成案を作成し、各章を自動執筆。KDP出版に必要な全データを一括生成
      </p>

      {/* --- 書籍タイプ選択 --- */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {BOOK_TYPES.map(bt => (
          <button
            key={bt.value}
            onClick={() => { setBookType(bt.value); setOutline(null); setChapters({}); }}
            style={{
              flex: 1, padding: '14px 8px', borderRadius: 10, cursor: 'pointer',
              border: bookType === bt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: bookType === bt.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-secondary)',
              color: bookType === bt.value ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: bookType === bt.value ? 700 : 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 26 }}>{bt.icon}</span>
            <span>{bt.label}</span>
          </button>
        ))}
      </div>

      {/* --- 6タブ --- */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0, overflowX: 'auto' }}>
        {STUDIO_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveStudioTab(tab.key)}
            style={{
              padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: 'none', borderBottom: activeStudioTab === tab.key ? '3px solid var(--accent)' : '3px solid transparent',
              background: 'transparent',
              color: activeStudioTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s', marginBottom: -2, whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title={tab.desc}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* アイデアタブ                                                       */}
      {/* ================================================================ */}
      {activeStudioTab === 'idea' && (
        <>
          {/* AIブレインストーム */}
          <div style={cardStyle}>
            <div style={sectionTitle}>💡 AIブレインストーム</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              テーマやジャンルを入力すると、AIが10個の書籍アイデアをスコア付きで提案します
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={brainstormTheme}
                onChange={e => setBrainstormTheme(e.target.value)}
                placeholder="例：AI副業、健康レシピ、子育て、投資入門..."
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && runBrainstorm()}
              />
              <button
                onClick={runBrainstorm}
                disabled={isBrainstorming || !brainstormTheme.trim()}
                style={{
                  ...btnPrimary,
                  opacity: (isBrainstorming || !brainstormTheme.trim()) ? 0.5 : 1,
                  cursor: (isBrainstorming || !brainstormTheme.trim()) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isBrainstorming ? '生成中...' : '💡 アイデア生成'}
              </button>
            </div>

            {isBrainstorming && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                AIがアイデアを考えています...
              </div>
            )}

            {brainstormResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brainstormResult.map((idea, i) => (
                  <div
                    key={i}
                    onClick={() => applyIdea(idea)}
                    style={{
                      padding: 14, background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#6c63ff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{idea.title}</span>
                      <span style={{
                        fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
                        background: idea.score >= 8 ? 'rgba(74,222,128,0.15)' : idea.score >= 6 ? 'rgba(251,191,36,0.15)' : 'rgba(255,107,107,0.1)',
                        color: idea.score >= 8 ? '#22c55e' : idea.score >= 6 ? '#f59e0b' : '#ff6b6b',
                      }}>
                        スコア {idea.score}/10
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.6 }}>{idea.theme}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {idea.targetReader} | {idea.reason}</div>
                    <div style={{ fontSize: 10, color: '#6c63ff', marginTop: 4 }}>クリックして構成タブに適用 →</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KDPキーワード最適化 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>🔑 KDPキーワード最適化</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              書籍情報をもとにAmazon KDPで上位表示されやすいキーワードとカテゴリを提案
            </p>
            <button
              onClick={optimizeKeywords}
              disabled={isOptimizingKeywords || (!title.trim() && !outline)}
              style={{
                ...btnSecondary,
                opacity: (isOptimizingKeywords || (!title.trim() && !outline)) ? 0.5 : 1,
                cursor: (isOptimizingKeywords || (!title.trim() && !outline)) ? 'not-allowed' : 'pointer',
              }}
            >
              {isOptimizingKeywords ? 'キーワード分析中...' : '🔑 キーワードを最適化'}
            </button>
            {(!title.trim() && !outline) && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>
                ※ タイトルを入力するか構成を生成してから実行してください
              </span>
            )}

            {isOptimizingKeywords && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                キーワードを分析しています...
              </div>
            )}

            {keywordResult && (
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ padding: 14, background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔑 TOP7 キーワード</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {keywordResult.top7_keywords.map((kw, i) => (
                      <span key={i} style={{
                        fontSize: 12, padding: '4px 12px', borderRadius: 20,
                        background: 'rgba(0,212,184,0.08)', border: '1px solid rgba(0,212,184,0.2)',
                        color: 'var(--text-secondary)',
                      }}>{kw}</span>
                    ))}
                  </div>
                </div>
                <div style={{ padding: 14, background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📂 TOP2 カテゴリ</div>
                  {keywordResult.top2_categories.map((cat, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#6c63ff', fontWeight: 700 }}>•</span> {cat}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* トレンド分析 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>📈 トレンド分析</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              現在のKindle市場で注目されているテーマをAIが分析します
            </p>
            <button
              onClick={analyzeTrends}
              disabled={isTrending}
              style={{
                ...btnSecondary,
                opacity: isTrending ? 0.5 : 1,
                cursor: isTrending ? 'not-allowed' : 'pointer',
              }}
            >
              {isTrending ? '分析中...' : '📈 トレンドを分析'}
            </button>

            {isTrending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                市場トレンドを分析しています...
              </div>
            )}

            {trendResult && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trendResult.hot_themes.map((ht, i) => (
                  <div key={i} style={{
                    padding: 14, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{ht.theme}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${ht.trend_score * 10}%`, height: '100%', borderRadius: 3,
                            background: ht.trend_score >= 8 ? '#22c55e' : ht.trend_score >= 6 ? '#f59e0b' : '#6c63ff',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{ht.trend_score}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ht.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* 構成タブ（既存機能を維持）                                          */}
      {/* ================================================================ */}
      {activeStudioTab === 'outline' && (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>書籍の基本情報</span>
              <button onClick={fillSample} style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
              }}>サンプルを入力</button>
            </div>

            {/* タイトル */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>書籍タイトル *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：ChatGPTで始める副業入門" style={inputStyle} />
            </div>

            {/* テーマ */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>テーマ・内容</label>
              <textarea value={theme} onChange={e => setTheme(e.target.value)} placeholder="本の内容、扱うテーマ、伝えたいメッセージなど..." rows={4} style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.6 }} />
            </div>

            {/* ターゲット読者 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲット読者</label>
              <input value={targetReader} onChange={e => setTargetReader(e.target.value)} placeholder="例：副業を始めたい会社員・主婦" style={inputStyle} />
            </div>

            {/* 章数・ページ数・文体 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>章数</label>
                <select value={chapterCount} onChange={e => setChapterCount(e.target.value)} style={inputStyle}>
                  {CHAPTER_COUNTS.map(c => <option key={c} value={c}>{c}章</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ページ数</label>
                <select value={pageCount} onChange={e => setPageCount(e.target.value)} style={inputStyle}>
                  {PAGE_COUNTS.map(p => <option key={p} value={p}>{p}ページ</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>文体</label>
                <select value={writingStyle} onChange={e => setWritingStyle(e.target.value)} style={inputStyle}>
                  {WRITING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={generateOutline} disabled={outlineLoading || !title.trim()} style={{
                padding: '12px 36px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15,
                cursor: outlineLoading ? 'not-allowed' : 'pointer',
                opacity: (outlineLoading || !title.trim()) ? 0.5 : 1,
              }}>
                {outlineLoading ? '構成案を生成中...' : '📋 構成案を生成'}
              </button>
            </div>
          </div>

          {/* エラー */}
          {outlineError && (
            <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
              {outlineError}
            </div>
          )}

          {/* ローディング */}
          {outlineLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
              <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              AIが本の構成を設計しています...
            </div>
          )}

          {/* --- 構成結果 --- */}
          {outline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* アクションバー */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SaveToLibraryButton
                  title={`Kindle構成: ${outline.book_title}`}
                  content={JSON.stringify(outline, null, 2)}
                  type="kindle-outline"
                  groupName="Kindle出版"
                  tags={`Kindle,${BOOK_TYPES.find(b => b.value === bookType)?.label || bookType},構成案`}
                />
                <button onClick={() => setActiveStudioTab('write')} style={{
                  padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                  border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  ✍️ 本文執筆へ進む
                </button>
              </div>

              {/* 書籍情報カード */}
              <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {outline.book_title}
                </div>
                {outline.subtitle && (
                  <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {outline.subtitle}
                  </div>
                )}
                {outline.tagline && (
                  <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, fontStyle: 'italic', marginBottom: 12 }}>
                    &ldquo;{outline.tagline}&rdquo;
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>ターゲット</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.target_reader}</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>推定ページ数</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.estimated_total_pages}ページ</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>推奨価格</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.pricing_suggestion}</div>
                  </div>
                </div>
              </div>

              {/* 章リスト */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                  📖 章構成（{outline.chapters.length}章）
                </div>
                {outline.chapters.map(ch => (
                  <div key={ch.chapter_num} style={{
                    padding: 14, marginBottom: 10, background: 'var(--bg-primary)',
                    border: '1px solid var(--border)', borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
                      }}>
                        {ch.chapter_num}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{ch.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        約{ch.estimated_pages}ページ
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                      {ch.summary}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ch.key_points.map((kp, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 20,
                          background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                          color: 'var(--text-secondary)',
                        }}>{kp}</span>
                      ))}
                    </div>
                    {ch.illustration_note && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                        🎨 {ch.illustration_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* KDPキーワード・カテゴリ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔑 KDPキーワード</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {outline.kdp_keywords.map((kw, i) => (
                      <span key={i} style={{
                        fontSize: 12, padding: '4px 12px', borderRadius: 20,
                        background: 'rgba(0,212,184,0.08)', border: '1px solid rgba(0,212,184,0.2)',
                        color: 'var(--text-secondary)',
                      }}>{kw}</span>
                    ))}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📂 KDPカテゴリ</div>
                  {outline.kdp_categories.map((cat, i) => (
                    <div key={i} style={{
                      fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ color: '#6c63ff', fontWeight: 700 }}>•</span> {cat}
                    </div>
                  ))}
                </div>
              </div>

              {/* 表紙テキスト */}
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📕 表紙テキスト</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>表紙</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.front}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>裏表紙</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.back}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>著者プロフィール</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.author_bio}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* 執筆タブ（既存機能を維持）                                          */}
      {/* ================================================================ */}
      {activeStudioTab === 'write' && (
        <>
          {!outline ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                まず構成案を生成してください
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                「構成」タブで書籍の構成を作成すると、ここで各章を執筆できます
              </div>
              <button onClick={() => setActiveStudioTab('outline')} style={{
                padding: '10px 24px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
                📋 構成タブへ
              </button>
            </div>
          ) : (
            <>
              {/* 進捗バー */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    執筆進捗: {completedCount} / {totalCount} 章完了
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={writeAllChapters} disabled={bulkWriting || completedCount === totalCount} style={{
                      padding: '8px 20px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                      color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13,
                      cursor: (bulkWriting || completedCount === totalCount) ? 'not-allowed' : 'pointer',
                      opacity: (bulkWriting || completedCount === totalCount) ? 0.5 : 1,
                    }}>
                      {bulkWriting ? '一括執筆中...' : '⚡ 全章一括生成'}
                    </button>
                    {completedCount > 0 && (
                      <button onClick={exportFullBook} style={{
                        padding: '8px 20px', background: 'var(--bg-primary)',
                        border: '1px solid var(--border)', color: 'var(--text-secondary)',
                        borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      }}>
                        💾 原稿をエクスポート
                      </button>
                    )}
                  </div>
                </div>
                {/* プログレスバー */}
                <div style={{ width: '100%', height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width 0.3s ease',
                    background: 'linear-gradient(90deg, #6c63ff, #00d4b8)',
                    width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%',
                  }} />
                </div>
              </div>

              {/* 各章カード */}
              {outline.chapters.map(ch => (
                <div key={ch.chapter_num} style={{ ...cardStyle, borderLeft: chapters[ch.chapter_num] ? '4px solid #4ade80' : '4px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                        background: chapters[ch.chapter_num] ? '#4ade80' : 'var(--bg-primary)',
                        color: chapters[ch.chapter_num] ? '#fff' : 'var(--text-muted)',
                        border: chapters[ch.chapter_num] ? 'none' : '1px solid var(--border)',
                      }}>
                        {chapters[ch.chapter_num] ? '✓' : ch.chapter_num}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        第{ch.chapter_num}章: {ch.title}
                      </span>
                    </div>
                    {!chapters[ch.chapter_num] && (
                      <button
                        onClick={() => writeChapter(ch)}
                        disabled={writingChapter === ch.chapter_num || bulkWriting}
                        style={{
                          padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: writingChapter === ch.chapter_num ? 'var(--bg-primary)' : 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                          color: writingChapter === ch.chapter_num ? 'var(--text-muted)' : '#fff',
                          border: 'none',
                          opacity: (writingChapter === ch.chapter_num || bulkWriting) ? 0.5 : 1,
                        }}
                      >
                        {writingChapter === ch.chapter_num ? '執筆中...' : '✍️ 執筆'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {ch.summary} （約{ch.estimated_pages}ページ）
                  </div>
                  {chapters[ch.chapter_num] && (
                    <pre style={{
                      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 8,
                      border: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto',
                      fontFamily: 'inherit',
                    }}>
                      {chapters[ch.chapter_num]}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* 品質向上タブ                                                       */}
      {/* ================================================================ */}
      {activeStudioTab === 'quality' && (
        <>
          {!outline || writtenChapterNums.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                先に章を執筆してください
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                「執筆」タブで少なくとも1章を執筆すると、品質チェックが利用できます
              </div>
              <button onClick={() => setActiveStudioTab('write')} style={btnPrimary}>
                ✍️ 執筆タブへ
              </button>
            </div>
          ) : (
            <>
              {/* AIエディター */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🔍 AIエディター</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  章を選択してAIに文章の品質チェックを依頼します。読みやすさスコア、問題点、強みを分析
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <select
                    value={editingChapter}
                    onChange={e => setEditingChapter(Number(e.target.value))}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value={-1}>章を選択...</option>
                    {writtenChapterNums.map(num => {
                      const ch = outline!.chapters.find(c => c.chapter_num === num);
                      return (
                        <option key={num} value={num}>
                          第{num}章: {ch?.title || ''}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={runEditor}
                    disabled={isEditing || editingChapter < 0}
                    style={{
                      ...btnPrimary,
                      opacity: (isEditing || editingChapter < 0) ? 0.5 : 1,
                      cursor: (isEditing || editingChapter < 0) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isEditing ? '分析中...' : '🔍 品質チェック'}
                  </button>
                </div>

                {isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    AIが文章を分析しています...
                  </div>
                )}

                {editResult && (
                  <div style={{ marginTop: 12 }}>
                    {/* 読みやすさスコア */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: 16,
                      background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12,
                    }}>
                      <div style={{
                        width: 60, height: 60, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
                        background: editResult.readability_score >= 80 ? 'rgba(74,222,128,0.15)' :
                          editResult.readability_score >= 60 ? 'rgba(251,191,36,0.15)' : 'rgba(255,107,107,0.1)',
                        color: editResult.readability_score >= 80 ? '#22c55e' :
                          editResult.readability_score >= 60 ? '#f59e0b' : '#ff6b6b',
                      }}>
                        {editResult.readability_score}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>読みやすさスコア</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {editResult.readability_score >= 80 ? '優秀 - 読みやすい文章です' :
                            editResult.readability_score >= 60 ? '良好 - 一部改善の余地があります' : '要改善 - 修正をおすすめします'}
                        </div>
                      </div>
                    </div>

                    {/* 問題点 */}
                    {editResult.issues.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b6b', marginBottom: 8 }}>⚠️ 改善点</div>
                        {editResult.issues.map((issue, i) => (
                          <div key={i} style={{
                            padding: 10, marginBottom: 6, background: 'rgba(255,107,107,0.05)',
                            border: '1px solid rgba(255,107,107,0.15)', borderRadius: 8,
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6b6b', marginBottom: 2 }}>[{issue.type}]</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{issue.text}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>💡 {issue.suggestion}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 強み */}
                    {editResult.strengths.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>✅ 強み</div>
                        {editResult.strengths.map((s, i) => (
                          <div key={i} style={{
                            padding: 8, fontSize: 12, color: 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            <span style={{ color: '#22c55e' }}>•</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 読者フィードバック */}
              <div style={cardStyle}>
                <div style={sectionTitle}>👥 読者フィードバック</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  3人の仮想読者ペルソナが本を読んだ感想とレビューを生成します
                </p>
                <button
                  onClick={getReaderFeedback}
                  disabled={isGettingFeedback}
                  style={{
                    ...btnSecondary,
                    opacity: isGettingFeedback ? 0.5 : 1,
                    cursor: isGettingFeedback ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGettingFeedback ? 'フィードバック生成中...' : '👥 読者フィードバックを取得'}
                </button>

                {isGettingFeedback && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    仮想読者がレビューを書いています...
                  </div>
                )}

                {readerFeedback && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {readerFeedback.map((persona, i) => (
                      <div key={i} style={{
                        padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {persona.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                          {persona.age} / {persona.occupation}
                        </div>
                        <div style={{ fontSize: 16, marginBottom: 8 }}>
                          {'★'.repeat(persona.stars)}{'☆'.repeat(5 - persona.stars)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                          {persona.comment}
                        </div>
                        <div style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic' }}>
                          💡 改善提案: {persona.improvement}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 章要約 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>📝 章要約・キーポイント</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  執筆済みの全章から要約とキーポイントを抽出します
                </p>
                <button
                  onClick={generateChapterSummary}
                  disabled={isGeneratingSummary}
                  style={{
                    ...btnSecondary,
                    opacity: isGeneratingSummary ? 0.5 : 1,
                    cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGeneratingSummary ? '要約生成中...' : '📝 要約を生成'}
                </button>

                {isGeneratingSummary && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    要約を生成しています...
                  </div>
                )}

                {chapterSummary && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: '1px solid var(--border)', marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📄 全体要約</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {chapterSummary.summary}
                      </div>
                    </div>
                    <div style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: '1px solid var(--border)', marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔑 キーポイント</div>
                      {chapterSummary.key_takeaways.map((kt, i) => (
                        <div key={i} style={{
                          fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0',
                          display: 'flex', alignItems: 'flex-start', gap: 6,
                        }}>
                          <span style={{ color: '#6c63ff', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span> {kt}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        if (!outline) return;
                        const summaryText = `\n\n---\n📝 要約:\n${chapterSummary.summary}\n\n🔑 キーポイント:\n${chapterSummary.key_takeaways.map((kt, i) => `${i + 1}. ${kt}`).join('\n')}`;
                        const lastChapter = writtenChapterNums[writtenChapterNums.length - 1];
                        if (lastChapter) {
                          setChapters(prev => ({
                            ...prev,
                            [lastChapter]: prev[lastChapter] + summaryText,
                          }));
                          alert('最終章に要約を追加しました');
                        }
                      }}
                      style={btnSecondary}
                    >
                      📎 最終章に要約を追加
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* 表紙・販促タブ                                                     */}
      {/* ================================================================ */}
      {activeStudioTab === 'cover' && (
        <>
          {(!outline && !title.trim()) ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                書籍情報を入力してください
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                「構成」タブでタイトルを入力するか構成案を生成すると、表紙・販促ツールが使えます
              </div>
              <button onClick={() => setActiveStudioTab('outline')} style={btnPrimary}>
                📋 構成タブへ
              </button>
            </div>
          ) : (
            <>
              {/* 表紙プロンプト生成 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🎨 表紙画像プロンプト生成</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Midjourney・DALL-E用の表紙画像プロンプトを3パターン生成します
                </p>
                <button
                  onClick={generateCoverPrompts}
                  disabled={isGeneratingCover}
                  style={{
                    ...btnPrimary,
                    opacity: isGeneratingCover ? 0.5 : 1,
                    cursor: isGeneratingCover ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGeneratingCover ? 'プロンプト生成中...' : '🎨 表紙プロンプトを生成'}
                </button>

                {isGeneratingCover && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    表紙プロンプトを生成しています...
                  </div>
                )}

                {coverPrompts && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {coverPrompts.map((pattern, i) => (
                      <div key={i} style={{
                        padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            パターン {i + 1}: {pattern.style}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
                          {pattern.description}
                        </div>

                        {/* Midjourney プロンプト */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>Midjourney</span>
                            <button
                              onClick={() => copyToClipboard(pattern.midjourney_prompt, `mj-${i}`)}
                              style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                                border: '1px solid var(--border)', background: 'transparent',
                                color: copiedKey === `mj-${i}` ? '#22c55e' : 'var(--text-muted)',
                              }}
                            >
                              {copiedKey === `mj-${i}` ? 'コピー済み!' : 'コピー'}
                            </button>
                          </div>
                          <div style={{
                            fontSize: 11, padding: 10, background: 'rgba(139,92,246,0.05)',
                            borderRadius: 6, border: '1px solid rgba(139,92,246,0.15)',
                            color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'monospace',
                          }}>
                            {pattern.midjourney_prompt}
                          </div>
                        </div>

                        {/* DALL-E プロンプト */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>DALL-E</span>
                            <button
                              onClick={() => copyToClipboard(pattern.dalle_prompt, `dalle-${i}`)}
                              style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                                border: '1px solid var(--border)', background: 'transparent',
                                color: copiedKey === `dalle-${i}` ? '#22c55e' : 'var(--text-muted)',
                              }}
                            >
                              {copiedKey === `dalle-${i}` ? 'コピー済み!' : 'コピー'}
                            </button>
                          </div>
                          <div style={{
                            fontSize: 11, padding: 10, background: 'rgba(34,197,94,0.05)',
                            borderRadius: 6, border: '1px solid rgba(34,197,94,0.15)',
                            color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'monospace',
                          }}>
                            {pattern.dalle_prompt}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Amazon説明文生成 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>📦 Amazon説明文生成</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  KDP登録用の長文説明、裏表紙テキスト、箇条書きを自動生成します
                </p>
                <button
                  onClick={generateDescription}
                  disabled={isGeneratingDesc}
                  style={{
                    ...btnPrimary,
                    opacity: isGeneratingDesc ? 0.5 : 1,
                    cursor: isGeneratingDesc ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGeneratingDesc ? '説明文生成中...' : '📦 説明文を生成'}
                </button>

                {isGeneratingDesc && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    説明文を生成しています...
                  </div>
                )}

                {descriptionResult && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 長文説明 */}
                    <div style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📝 Amazon商品説明</span>
                        <button
                          onClick={() => copyToClipboard(descriptionResult.long_description, 'long-desc')}
                          style={{
                            fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'transparent',
                            color: copiedKey === 'long-desc' ? '#22c55e' : 'var(--text-muted)',
                          }}
                        >
                          {copiedKey === 'long-desc' ? 'コピー済み!' : 'コピー'}
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {descriptionResult.long_description}
                      </div>
                    </div>

                    {/* 裏表紙 */}
                    <div style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📕 裏表紙テキスト</span>
                        <button
                          onClick={() => copyToClipboard(descriptionResult.back_cover, 'back-cover')}
                          style={{
                            fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'transparent',
                            color: copiedKey === 'back-cover' ? '#22c55e' : 'var(--text-muted)',
                          }}
                        >
                          {copiedKey === 'back-cover' ? 'コピー済み!' : 'コピー'}
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {descriptionResult.back_cover}
                      </div>
                    </div>

                    {/* 箇条書き */}
                    <div style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>✅ セールスポイント</span>
                        <button
                          onClick={() => copyToClipboard(descriptionResult.bullet_points.join('\n'), 'bullets')}
                          style={{
                            fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'transparent',
                            color: copiedKey === 'bullets' ? '#22c55e' : 'var(--text-muted)',
                          }}
                        >
                          {copiedKey === 'bullets' ? 'コピー済み!' : 'コピー'}
                        </button>
                      </div>
                      {descriptionResult.bullet_points.map((bp, i) => (
                        <div key={i} style={{
                          fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0',
                          display: 'flex', alignItems: 'flex-start', gap: 6,
                        }}>
                          <span style={{ color: '#6c63ff', fontWeight: 700 }}>•</span> {bp}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* 出版タブ                                                          */}
      {/* ================================================================ */}
      {activeStudioTab === 'publish' && (
        <>
          {/* チェックリスト */}
          <div style={cardStyle}>
            <div style={sectionTitle}>📋 出版前チェックリスト</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              書籍の種類に合わせたKDP出版前のチェックリストを生成します
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={hasImages}
                  onChange={e => setHasImages(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                画像・イラストを含む
              </label>
              <button
                onClick={generateChecklist}
                disabled={isGeneratingChecklist}
                style={{
                  ...btnPrimary,
                  opacity: isGeneratingChecklist ? 0.5 : 1,
                  cursor: isGeneratingChecklist ? 'not-allowed' : 'pointer',
                }}
              >
                {isGeneratingChecklist ? 'チェックリスト生成中...' : '📋 チェックリストを生成'}
              </button>
            </div>

            {isGeneratingChecklist && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                チェックリストを生成しています...
              </div>
            )}

            {checklistResult && (
              <div style={{ marginTop: 12 }}>
                {/* カテゴリごとにグループ化 */}
                {(() => {
                  const categories = [...new Set(checklistResult.map(item => item.category))];
                  return categories.map(cat => (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>
                        {cat}
                      </div>
                      {checklistResult.filter(item => item.category === cat).map((item, i) => (
                        <label
                          key={i}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px',
                            cursor: 'pointer', borderRadius: 6, marginBottom: 2,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => {
                              setChecklistResult(prev =>
                                prev ? prev.map((it, idx) => {
                                  if (it.category === item.category && it.item === item.item) {
                                    return { ...it, done: !it.done };
                                  }
                                  return it;
                                }) : null
                              );
                            }}
                            style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0 }}
                          />
                          <span style={{
                            fontSize: 13, color: item.done ? 'var(--text-muted)' : 'var(--text-secondary)',
                            textDecoration: item.done ? 'line-through' : 'none', lineHeight: 1.5,
                          }}>
                            {item.item}
                          </span>
                        </label>
                      ))}
                    </div>
                  ));
                })()}
                <div style={{
                  padding: 10, background: 'rgba(108,99,255,0.05)', borderRadius: 8,
                  fontSize: 12, color: 'var(--text-muted)', textAlign: 'center',
                }}>
                  完了: {checklistResult.filter(i => i.done).length} / {checklistResult.length} 項目
                </div>
              </div>
            )}
          </div>

          {/* SNSプロモーション */}
          <div style={cardStyle}>
            <div style={sectionTitle}>📣 SNSプロモーション文生成</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Twitter・Instagram・noteの投稿文とスケジュールを自動生成します
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Amazon URL（任意）</label>
              <input
                value={amazonUrl}
                onChange={e => setAmazonUrl(e.target.value)}
                placeholder="https://www.amazon.co.jp/dp/..."
                style={inputStyle}
              />
            </div>
            <button
              onClick={generatePromotion}
              disabled={isGeneratingPromo || (!title.trim() && !outline)}
              style={{
                ...btnPrimary,
                opacity: (isGeneratingPromo || (!title.trim() && !outline)) ? 0.5 : 1,
                cursor: (isGeneratingPromo || (!title.trim() && !outline)) ? 'not-allowed' : 'pointer',
              }}
            >
              {isGeneratingPromo ? 'プロモーション文生成中...' : '📣 プロモーション文を生成'}
            </button>

            {isGeneratingPromo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 12, marginTop: 8 }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                プロモーション文を生成しています...
              </div>
            )}

            {promoResult && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {promoResult.map((post, i) => {
                  const platformColors: Record<string, string> = {
                    twitter: '#1DA1F2', instagram: '#E4405F', note: '#41C9B4',
                  };
                  const platformIcons: Record<string, string> = {
                    twitter: '🐦', instagram: '📸', note: '📝',
                  };
                  const pColor = platformColors[post.platform.toLowerCase()] || '#6c63ff';
                  const pIcon = platformIcons[post.platform.toLowerCase()] || '📱';

                  return (
                    <div key={i} style={{
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 10,
                      border: `1px solid ${pColor}30`, borderLeft: `4px solid ${pColor}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16 }}>{pIcon}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: pColor }}>
                            {post.platform}
                          </span>
                          {post.schedule && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${pColor}10`, color: pColor }}>
                              {post.schedule}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => copyToClipboard(post.content + '\n\n' + post.hashtags.join(' '), `promo-${i}`)}
                          style={{
                            fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'transparent',
                            color: copiedKey === `promo-${i}` ? '#22c55e' : 'var(--text-muted)',
                          }}
                        >
                          {copiedKey === `promo-${i}` ? 'コピー済み!' : 'コピー'}
                        </button>
                      </div>
                      <div style={{
                        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                        whiteSpace: 'pre-wrap', marginBottom: 8,
                      }}>
                        {post.content}
                      </div>
                      {post.hashtags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {post.hashtags.map((tag, j) => (
                            <span key={j} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 20,
                              background: `${pColor}08`, border: `1px solid ${pColor}20`,
                              color: pColor,
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* ツールリンク集（既存機能を維持）                                      */}
      {/* ================================================================ */}
      <div style={{ marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 32 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>🔗 次に使うおすすめAIツール</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>xLUMINAで生成した原稿を以下のツールと組み合わせるとより高品質な作品が完成します。</p>
        {(() => {
          const TOOLS: Record<string, { name: string; desc: string; url: string; icon: string; badge: string; badgeColor: string }[]> = {
            guide: [
              { name: 'Vellum', desc: 'Kindle＆PDF同時組版。原稿を貼るだけで美しい本に。Mac専用。', url: 'https://vellum.pub', icon: '📖', badge: '★ 組版', badgeColor: '#8b5cf6' },
              { name: 'DALL-E 3', desc: '手順図・フロー図・説明図をテキスト指示で生成。', url: 'https://chat.openai.com', icon: '🤖', badge: '図解生成', badgeColor: '#22c55e' },
              { name: 'Midjourney', desc: 'プロ品質の表紙・カバー画像を生成。', url: 'https://midjourney.com', icon: '🎨', badge: '表紙制作', badgeColor: '#3b82f6' },
              { name: 'Canva', desc: '図解・インフォグラフィック・表紙デザインのテンプレートが豊富。', url: 'https://www.canva.com', icon: '🖼️', badge: 'レイアウト', badgeColor: '#14b8a6' },
            ],
            novel: [
              { name: 'Sudowrite', desc: '小説専用AI。続き提案・場面描写強化・書き直しが得意。', url: 'https://sudowrite.com', icon: '✍️', badge: '★ 小説AI', badgeColor: '#8b5cf6' },
              { name: 'ProWritingAid', desc: '文体の一貫性・繰り返し・テンポを分析。', url: 'https://prowritingaid.com', icon: '🔍', badge: '文体チェック', badgeColor: '#3b82f6' },
              { name: 'Midjourney', desc: '小説の世界観を表現する表紙・挿絵を生成。', url: 'https://midjourney.com', icon: '🎨', badge: '表紙・世界観', badgeColor: '#f59e0b' },
              { name: 'Vellum', desc: '小説の組版に最適。章タイトル・目次・フォントが自動で美しく整う。', url: 'https://vellum.pub', icon: '📖', badge: '組版', badgeColor: '#22c55e' },
            ],
            picture: [
              { name: 'Midjourney', desc: '絵本イラスト最高品質。--srefで全ページスタイル統一。', url: 'https://midjourney.com', icon: '🎨', badge: '★ イラスト', badgeColor: '#ec4899' },
              { name: 'xLUMINA 難易度変換', desc: '生成テキストを「小学生向け」に自動変換。', url: '/dashboard/simplifier', icon: '🎓', badge: 'xLUMINA内', badgeColor: '#6c63ff' },
              { name: 'Adobe Firefly', desc: '著作権的に最も安全。商業出版の絵本イラストに最適。', url: 'https://www.adobe.com/jp/products/firefly.html', icon: '✨', badge: '商用安全', badgeColor: '#ef4444' },
              { name: 'Canva', desc: '絵本テンプレートで画像と文章を美しく配置。', url: 'https://www.canva.com', icon: '📐', badge: 'レイアウト', badgeColor: '#14b8a6' },
              { name: 'Book Creator', desc: '絵本専用作成ツール。音声・アニメーションも追加可。', url: 'https://bookcreator.com', icon: '📚', badge: '絵本専用', badgeColor: '#eab308' },
            ],
            puzzle: [
              { name: 'Crossword Labs', desc: '単語リストを貼るだけでクロスワード自動完成。完全無料。', url: 'https://crosswordlabs.com', icon: '🔤', badge: '★ 無料', badgeColor: '#f59e0b' },
              { name: 'Discovery Puzzle Maker', desc: 'ワードサーチ・迷路など複数種類を自動生成。', url: 'https://puzzlemaker.discoveryeducation.com', icon: '🔠', badge: '無料', badgeColor: '#3b82f6' },
              { name: 'Canva', desc: 'パズル本のテンプレートで全ページを美しくレイアウト。', url: 'https://www.canva.com', icon: '📐', badge: 'レイアウト', badgeColor: '#14b8a6' },
              { name: 'ランサーズ', desc: 'AI苦手な迷路・間違い探しを専門クリエイターに外注。1問500円〜。', url: 'https://www.lancers.jp', icon: '🤝', badge: '外注', badgeColor: '#22c55e' },
            ],
          };
          const tools = TOOLS[bookType] ?? TOOLS.guide;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              {tools.map(t => (
                <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)', textDecoration: 'none',
                  transition: 'background 0.15s',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: `${t.badgeColor}20`, color: t.badgeColor }}>{t.badge}</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.desc}</p>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>
                </a>
              ))}
              <a href="https://kdp.amazon.co.jp" target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12,
                border: '2px solid rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.06)', textDecoration: 'none',
                gridColumn: 'span 2',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>📦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>KDP（Kindle Direct Publishing）</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,166,35,0.2)', color: '#b45309' }}>最終出版 無料</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Amazon公式出版プラットフォーム。無料で出版、印税35〜70%。</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>
              </a>
            </div>
          );
        })()}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>📋 出版前に確認すべきリンク</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: 'KDP ヘルプ', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200635650' },
              { label: 'KDP 料金・印税', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200634500' },
              { label: '表紙ガイドライン', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200645690' },
              { label: 'コンテンツガイドライン', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200672390' },
            ].map(link => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 11, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none', textAlign: 'center',
              }}>{link.label} ↗</a>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
